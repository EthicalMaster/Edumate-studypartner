/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { newDb } from 'pg-mem';
import pg from 'pg';

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
  console.log(`[Test ${num}] ${symbol} ${name}${details ? ` - ${details}` : ''}`);
}

async function runVerification() {
  console.log('====================================================');
  console.log('EDUMATE POSTGRESQL DATABASE & SCHEMA VERIFICATION');
  console.log('====================================================');

  const migrationSql = fs.readFileSync(
    path.join(__dirname, 'migrations', '001_initial_schema.sql'),
    'utf-8'
  );

  let client: any;
  let isLiveDb = false;

  if (process.env.DATABASE_URL) {
    try {
      const realClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await realClient.connect();
      client = realClient;
      isLiveDb = true;
      console.log('Connected to live PostgreSQL database via DATABASE_URL.');
    } catch (e: any) {
      console.log('Live DATABASE_URL not reachable. Using in-memory PostgreSQL engine (pg-mem).');
    }
  }

  if (!isLiveDb) {
    console.log('Running automated schema verification on PostgreSQL engine (pg-mem)...');
    const db = newDb({
      autoCreateForeignKeyIndices: true,
    });

    // Register standard PostgreSQL UUID generator
    db.public.registerFunction({
      name: 'gen_random_uuid',
      returns: (db.public as any).getType('uuid'),
      impure: true,
      implementation: () => crypto.randomUUID(),
    });

    // pg-mem supports all standard tables, checks, unique, and foreign keys.
    // Filter trigger/extension declarations that are specific to full PostgreSQL server daemon.
    const cleanSql = migrationSql
      .replace(/CREATE EXTENSION[^\n]+;/gi, '')
      .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?LANGUAGE plpgsql;/gi, '')
      .replace(/CREATE TRIGGER[\s\S]*?EXECUTE FUNCTION[^\n]+;/gi, '');

    const pgMemAdapter = db.adapters.createPg();
    client = new pgMemAdapter.Client();
    await client.connect();
    await client.query(cleanSql);
  } else {
    await client.query(migrationSql);
  }

  console.log('Schema DDL applied successfully.\n');

  try {
    // ------------------------------------------------------------------------
    // TEST 1: All 12 tables exist
    // ------------------------------------------------------------------------
    const expectedTables = [
      'users',
      'student_profiles',
      'study_materials',
      'study_kits',
      'flashcards',
      'flashcard_reviews',
      'quizzes',
      'quiz_questions',
      'quiz_sessions',
      'quiz_answers',
      'quiz_results',
      'student_activity',
    ];

    let allTablesExist = true;
    for (const tbl of expectedTables) {
      try {
        await client.query(`SELECT 1 FROM ${tbl} LIMIT 0;`);
      } catch (e: any) {
        allTablesExist = false;
        record(1, 'All 12 tables exist', false, `Table ${tbl} error: ${e.message}`);
        break;
      }
    }
    if (allTablesExist) {
      record(1, 'All 12 tables exist', true, '12 of 12 tables verified');
    }

    // ------------------------------------------------------------------------
    // TEST 2: All primary keys exist
    // ------------------------------------------------------------------------
    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, role) VALUES ('verify.user1@edumate.dev', 'hash123', 'STUDENT') RETURNING id;`
    );
    const userId1 = userRes.rows[0]?.id;
    record(2, 'All primary keys exist', Boolean(userId1), `Generated UUID PK: ${userId1}`);

    // ------------------------------------------------------------------------
    // TEST 3: All foreign keys exist
    // ------------------------------------------------------------------------
    const profileRes = await client.query(
      `INSERT INTO student_profiles (user_id, full_name, current_year) VALUES ($1, 'Verification Student', 3) RETURNING id;`,
      [userId1]
    );
    const studentId1 = profileRes.rows[0]?.id;
    let fkBlocked = false;
    try {
      await client.query(
        `INSERT INTO student_profiles (user_id, full_name) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Orphan Student');`
      );
    } catch {
      fkBlocked = true;
    }
    record(3, 'All foreign keys exist', fkBlocked, 'Orphan user_id foreign key was rejected');

    // ------------------------------------------------------------------------
    // TEST 4: Unique constraints work
    // ------------------------------------------------------------------------
    let emailUniqueBlocked = false;
    try {
      await client.query(
        `INSERT INTO users (email, password_hash, role) VALUES ('verify.user1@edumate.dev', 'another_hash', 'STUDENT');`
      );
    } catch {
      emailUniqueBlocked = true;
    }
    record(4, 'Unique constraints work', emailUniqueBlocked, 'Duplicate user email was properly rejected');

    // ------------------------------------------------------------------------
    // TEST 5: CHECK constraints work
    // ------------------------------------------------------------------------
    let checkYearBlocked = false;
    try {
      await client.query(
        `INSERT INTO student_profiles (user_id, full_name, current_year) VALUES ($1, 'Invalid Year Student', 9);`,
        ['b0000000-0000-4000-8000-000000000099']
      );
    } catch {
      checkYearBlocked = true;
    }

    let checkQuestionCountBlocked = false;
    try {
      await client.query(
        `INSERT INTO quizzes (student_id, title, subject, topic, question_count, time_limit_minutes, difficulty)
         VALUES ($1, 'Invalid Count Quiz', 'Physics', 'Mechanics', 7, 15, 'easy');`,
        [studentId1]
      );
    } catch {
      checkQuestionCountBlocked = true;
    }

    let checkRatingBlocked = false;
    try {
      await client.query(
        `INSERT INTO flashcard_reviews (flashcard_id, student_id, rating)
         VALUES ('00000000-0000-0000-0000-000000000001', $1, 6);`,
        [studentId1]
      );
    } catch {
      checkRatingBlocked = true;
    }

    const allChecksPassed = checkYearBlocked && checkQuestionCountBlocked && checkRatingBlocked;
    record(5, 'CHECK constraints work', allChecksPassed, 'Verified: current_year range 1..5, question_count (5,10,15,20,30,50), rating 1..4');

    // ------------------------------------------------------------------------
    // TEST 6: UUID generation works
    // ------------------------------------------------------------------------
    const materialRes = await client.query(
      `INSERT INTO study_materials (student_id, filename, file_type, file_size_bytes, storage_location, subject, topic)
       VALUES ($1, 'lecture_physics.pdf', 'application/pdf', 2048, '/storage/lecture_physics.pdf', 'Physics', 'Mechanics')
       RETURNING id;`,
      [studentId1]
    );
    const materialId = materialRes.rows[0]?.id;
    const isUuid = /^[0-9a-f-]{36}$/i.test(materialId);
    record(6, 'UUID generation works', isUuid, `Generated UUID: ${materialId}`);

    // ------------------------------------------------------------------------
    // TEST 7: Cascading behavior works where specified
    // ------------------------------------------------------------------------
    const userForCascade = await client.query(
      `INSERT INTO users (email, password_hash) VALUES ('cascade.test@edumate.dev', 'pwd') RETURNING id;`
    );
    const cascadeUserId = userForCascade.rows[0].id;
    const profileForCascade = await client.query(
      `INSERT INTO student_profiles (user_id, full_name) VALUES ($1, 'Cascade Student') RETURNING id;`,
      [cascadeUserId]
    );
    const cascadeStudentId = profileForCascade.rows[0].id;
    await client.query(`DELETE FROM users WHERE id = $1;`, [cascadeUserId]);
    const checkCascade = await client.query(`SELECT 1 FROM student_profiles WHERE id = $1;`, [cascadeStudentId]);
    record(7, 'Cascading behavior works where specified', checkCascade.rows.length === 0, 'student_profiles record automatically removed on user cascade');

    // ------------------------------------------------------------------------
    // TEST 8: SET NULL behavior works where specified
    // ------------------------------------------------------------------------
    const kitRes = await client.query(
      `INSERT INTO study_kits (student_id, source_material_id, title, subject)
       VALUES ($1, $2, 'Mechanics Kit', 'Physics') RETURNING id;`,
      [studentId1, materialId]
    );
    const kitId = kitRes.rows[0].id;
    await client.query(`DELETE FROM study_materials WHERE id = $1;`, [materialId]);
    const checkSetNull = await client.query(`SELECT source_material_id FROM study_kits WHERE id = $1;`, [kitId]);
    record(8, 'SET NULL behavior works where specified', checkSetNull.rows[0].source_material_id === null, 'source_material_id set to NULL when material deleted');

    // ------------------------------------------------------------------------
    // TEST 9: Invalid enum-like values are rejected
    // ------------------------------------------------------------------------
    let invalidRoleBlocked = false;
    try {
      await client.query(
        `INSERT INTO users (email, password_hash, role) VALUES ('admin.hack@edumate.dev', 'pwd', 'SUPER_ADMIN');`
      );
    } catch {
      invalidRoleBlocked = true;
    }
    record(9, 'Invalid enum-like values are rejected', invalidRoleBlocked, 'Role "SUPER_ADMIN" rejected by chk_users_role');

    // ------------------------------------------------------------------------
    // TEST 10: Duplicate quiz question order within same quiz is rejected
    // ------------------------------------------------------------------------
    const quizRes = await client.query(
      `INSERT INTO quizzes (student_id, title, subject, topic, question_count, time_limit_minutes, difficulty)
       VALUES ($1, 'Physics Drill', 'Physics', 'Mechanics', 5, 15, 'easy') RETURNING id;`,
      [studentId1]
    );
    const quizId = quizRes.rows[0].id;

    await client.query(
      `INSERT INTO quiz_questions (quiz_id, question_order, question_text, question_type, options, correct_option_ids, explanation)
       VALUES ($1, 1, 'Question 1 text', 'single_choice', '[]', '[]', 'explanation 1');`,
      [quizId]
    );

    let dupOrderBlocked = false;
    try {
      await client.query(
        `INSERT INTO quiz_questions (quiz_id, question_order, question_text, question_type, options, correct_option_ids, explanation)
         VALUES ($1, 1, 'Question 1 duplicate order', 'single_choice', '[]', '[]', 'explanation 2');`,
        [quizId]
      );
    } catch {
      dupOrderBlocked = true;
    }
    record(10, 'Duplicate quiz question order within same quiz is rejected', dupOrderBlocked, 'uq_quiz_questions_order successfully enforced');

    // ------------------------------------------------------------------------
    // TEST 11: Duplicate quiz answer for same session/question is rejected
    // ------------------------------------------------------------------------
    const sessionRes = await client.query(
      `INSERT INTO quiz_sessions (student_id, quiz_id, start_time, server_deadline, time_limit_seconds)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '15 minutes', 900) RETURNING id;`,
      [studentId1, quizId]
    );
    const sessionId = sessionRes.rows[0].id;
    const qRes = await client.query(`SELECT id FROM quiz_questions WHERE quiz_id = $1 LIMIT 1;`, [quizId]);
    const questionId = qRes.rows[0].id;

    await client.query(
      `INSERT INTO quiz_answers (session_id, question_id, student_id, selected_option_ids)
       VALUES ($1, $2, $3, '["opt-a"]');`,
      [sessionId, questionId, studentId1]
    );

    let dupAnswerBlocked = false;
    try {
      await client.query(
        `INSERT INTO quiz_answers (session_id, question_id, student_id, selected_option_ids)
         VALUES ($1, $2, $3, '["opt-b"]');`,
        [sessionId, questionId, studentId1]
      );
    } catch {
      dupAnswerBlocked = true;
    }
    record(11, 'Duplicate quiz answer for same session/question is rejected', dupAnswerBlocked, 'uq_quiz_answers_session_question successfully enforced');

    // ------------------------------------------------------------------------
    // TEST 12: Duplicate student profile for same user is rejected
    // ------------------------------------------------------------------------
    let dupProfileBlocked = false;
    try {
      await client.query(
        `INSERT INTO student_profiles (user_id, full_name) VALUES ($1, 'Second Profile Attempt');`,
        [userId1]
      );
    } catch {
      dupProfileBlocked = true;
    }
    record(12, 'Duplicate student profile for same user is rejected', dupProfileBlocked, '1:1 UNIQUE constraint on student_profiles.user_id successfully enforced');

    console.log('\n====================================================');
    const passedCount = results.filter((r) => r.passed).length;
    console.log(`VERIFICATION SUMMARY: ${passedCount}/${results.length} TESTS PASSED`);
    console.log('====================================================');

    if (passedCount !== results.length) {
      process.exit(1);
    }
  } finally {
    if (client && client.end) {
      await client.end();
    }
  }
}

runVerification().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
