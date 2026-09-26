/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { newDb } from 'pg-mem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function record(num: number, name: string, passed: boolean, details?: string) {
  results.push({ num, name, passed, details });
  const symbol = passed ? '✅' : '❌';
  console.log(`[Notification Test ${num}] ${symbol} ${name}${details ? ` - ${details}` : ''}`);
}

async function runNotificationTests() {
  console.log('====================================================');
  console.log('AVEN PRODUCT REALITY AUDIT: REAL NOTIFICATION TESTS');
  console.log('====================================================\n');

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  const sql001 = fs.readFileSync(path.join(migrationsDir, '001_initial_schema.sql'), 'utf-8');
  const sql015Up = fs.readFileSync(path.join(migrationsDir, '015_real_notification_system.sql'), 'utf-8');
  const sql015Down = fs.readFileSync(path.join(migrationsDir, '015_real_notification_system_down.sql'), 'utf-8');

  const cleanSql = (sql: string) =>
    sql
      .replace(/CREATE EXTENSION[^\n]+;/gi, '')
      .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?LANGUAGE plpgsql;/gi, '')
      .replace(/CREATE TRIGGER[\s\S]*?EXECUTE FUNCTION[^\n]+;/gi, '');

  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: (db.public as any).getType('uuid'),
    impure: true,
    implementation: () => crypto.randomUUID(),
  });

  const pgMemAdapter = db.adapters.createPg();
  const client = new pgMemAdapter.Client();
  await client.connect();

  // Apply baseline schema
  await client.query(cleanSql(sql001));

  // Seed two distinct students for tenant isolation verification
  const student1Id = crypto.randomUUID();
  const student2Id = crypto.randomUUID();
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();

  await client.query(
    `INSERT INTO users (id, email, password_hash, role) VALUES ($1, 'student1@aven.test', 'hash1', 'STUDENT'), ($2, 'student2@aven.test', 'hash2', 'STUDENT')`,
    [user1Id, user2Id]
  );

  await client.query(
    `INSERT INTO student_profiles (id, user_id, full_name, current_year) VALUES ($1, $2, 'Alice Walker', 3), ($3, $4, 'Bob Smith', 2)`,
    [student1Id, user1Id, student2Id, user2Id]
  );

  // TEST 1: Migration 015 UP execution
  try {
    await client.query(cleanSql(sql015Up));
    const tableCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notifications'
    `);

    const colNames = tableCheck.rows.map((r: any) => r.column_name);
    const hasRequiredCols = [
      'id',
      'student_id',
      'type',
      'title',
      'message',
      'metadata',
      'is_read',
      'created_at',
      'read_at',
    ].every((c) => colNames.includes(c));

    record(1, 'Migration 015 UP executes cleanly and defines required notification columns', hasRequiredCols, `Columns: ${colNames.join(', ')}`);
  } catch (err: any) {
    record(1, 'Migration 015 UP execution', false, err.message);
  }

  // TEST 2: Create real notifications and verify storage
  try {
    await client.query(
      `INSERT INTO notifications (student_id, type, title, message, metadata, is_read, created_at)
       VALUES 
        ($1, 'quiz_completed', 'Quiz Completed: Calculus Mastery', 'You scored 85 pts (85%) with 10 questions.', '{"score":85}', FALSE, NOW()),
        ($1, 'material_processed', 'Document Analyzed: Physics Notes', 'Extracted 12 knowledge chunks.', '{"chunks":12}', FALSE, NOW()),
        ($2, 'quiz_completed', 'Quiz Completed: Mechanics', 'You scored 90 pts (90%).', '{"score":90}', FALSE, NOW())`,
      [student1Id, student2Id]
    );

    const countRes = await client.query(`SELECT COUNT(*)::int as total FROM notifications`);
    const passed = Number(countRes.rows[0]?.total) === 3;
    record(2, 'Persist real notifications with JSONB metadata and default unread state', passed, `Total: ${countRes.rows[0]?.total}`);
  } catch (err: any) {
    record(2, 'Persist real notifications', false, err.message);
  }

  // TEST 3: Strict Tenant Isolation in Notification Retrieval
  try {
    const s1Res = await client.query(
      `SELECT id, title FROM notifications WHERE student_id = $1 ORDER BY created_at DESC`,
      [student1Id]
    );
    const s2Res = await client.query(
      `SELECT id, title FROM notifications WHERE student_id = $1 ORDER BY created_at DESC`,
      [student2Id]
    );

    const passed = s1Res.rows.length === 2 && s2Res.rows.length === 1;
    record(3, 'Strict Student Tenant Isolation: Student queries return strictly owned notifications', passed, `Student1: ${s1Res.rows.length}, Student2: ${s2Res.rows.length}`);
  } catch (err: any) {
    record(3, 'Strict Student Tenant Isolation', false, err.message);
  }

  // TEST 4: Real Unread Count
  try {
    const unread1 = await client.query(
      `SELECT COUNT(*)::int as unread FROM notifications WHERE student_id = $1 AND is_read = FALSE`,
      [student1Id]
    );
    const passed = Number(unread1.rows[0]?.unread) === 2;
    record(4, 'Unread notification count correctly calculated without dummy values', passed, `Unread for Student1: ${unread1.rows[0]?.unread}`);
  } catch (err: any) {
    record(4, 'Real Unread Count', false, err.message);
  }

  // TEST 5: Mark Single Notification As Read
  try {
    const getFirst = await client.query(
      `SELECT id FROM notifications WHERE student_id = $1 LIMIT 1`,
      [student1Id]
    );
    const targetId = getFirst.rows[0]?.id;

    await client.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = NOW() 
       WHERE id = $1 AND student_id = $2`,
      [targetId, student1Id]
    );

    const verifyRead = await client.query(
      `SELECT is_read, read_at FROM notifications WHERE id = $1`,
      [targetId]
    );

    const unreadAfter = await client.query(
      `SELECT COUNT(*)::int as unread FROM notifications WHERE student_id = $1 AND is_read = FALSE`,
      [student1Id]
    );

    const passed =
      verifyRead.rows[0]?.is_read === true &&
      verifyRead.rows[0]?.read_at !== null &&
      Number(unreadAfter.rows[0]?.unread) === 1;

    record(5, 'Mark single notification as read sets is_read=TRUE and read_at timestamp', passed, `New unread count: ${unreadAfter.rows[0]?.unread}`);
  } catch (err: any) {
    record(5, 'Mark Single Notification As Read', false, err.message);
  }

  // TEST 6: Tenant Isolation on Update (Student2 cannot mark Student1 notification read)
  try {
    const getS1Unread = await client.query(
      `SELECT id FROM notifications WHERE student_id = $1 AND is_read = FALSE LIMIT 1`,
      [student1Id]
    );
    const s1NotifId = getS1Unread.rows[0]?.id;

    // Student2 attempts to update Student1's notification
    const rogueUpdate = await client.query(
      `UPDATE notifications 
       SET is_read = TRUE 
       WHERE id = $1 AND student_id = $2`,
      [s1NotifId, student2Id]
    );

    const stillUnread = await client.query(
      `SELECT is_read FROM notifications WHERE id = $1`,
      [s1NotifId]
    );

    const passed = rogueUpdate.rowCount === 0 && stillUnread.rows[0]?.is_read === false;
    record(6, 'Rogue cross-tenant mutation prevented by parameterized student_id scoping', passed, `Rows affected: ${rogueUpdate.rowCount}`);
  } catch (err: any) {
    record(6, 'Cross-tenant mutation prevention', false, err.message);
  }

  // TEST 7: Mark All As Read
  try {
    await client.query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = NOW() 
       WHERE student_id = $1 AND is_read = FALSE`,
      [student1Id]
    );

    const unreadFinal = await client.query(
      `SELECT COUNT(*)::int as unread FROM notifications WHERE student_id = $1 AND is_read = FALSE`,
      [student1Id]
    );

    const passed = Number(unreadFinal.rows[0]?.unread) === 0;
    record(7, 'Mark all notifications read resets student unread counter to 0', passed, `Remaining unread: ${unreadFinal.rows[0]?.unread}`);
  } catch (err: any) {
    record(7, 'Mark All As Read', false, err.message);
  }

  // TEST 8: Migration 015 DOWN Rollback
  try {
    await client.query(cleanSql(sql015Down));
    const tableCheck = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'notifications'
    `);
    const passed = tableCheck.rows.length === 0;
    record(8, 'Migration 015 DOWN cleanly drops notifications table on rollback', passed, `Tables found: ${tableCheck.rows.length}`);
  } catch (err: any) {
    record(8, 'Migration 015 DOWN Rollback', false, err.message);
  }

  console.log('\n====================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`TOTAL NOTIFICATION TESTS PASSED: ${results.filter((r) => r.passed).length}/${results.length}`);
  console.log('====================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runNotificationTests().catch((err) => {
  console.error('[Notification Tests] Fatal execution failure:', err);
  process.exit(1);
});
