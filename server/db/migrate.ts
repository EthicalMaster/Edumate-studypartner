/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations(rollback = false) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Error: DATABASE_URL environment variable is required to run migrations.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // 1. Ensure schema_migrations ledger table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Fetch previously applied migrations
    const res = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY id ASC;'
    );
    const appliedVersions = new Set(res.rows.map((r) => r.version));

    if (rollback) {
      // Find the latest applied migration to rollback
      const lastApplied = res.rows[res.rows.length - 1];
      if (!lastApplied) {
        console.log('No applied migrations found to rollback.');
        return;
      }

      const downFileName = `${lastApplied.version}_down.sql`;
      const downFilePath = path.join(MIGRATIONS_DIR, downFileName);
      if (!fs.existsSync(downFilePath)) {
        console.error(`Rollback file not found: ${downFileName}`);
        process.exit(1);
      }

      console.log(`Rolling back migration: ${lastApplied.version}...`);
      const sql = fs.readFileSync(downFilePath, 'utf-8');

      await client.query('BEGIN');
      await client.query(sql);
      await client.query('DELETE FROM schema_migrations WHERE version = $1', [lastApplied.version]);
      await client.query('COMMIT');
      console.log(`Successfully rolled back: ${lastApplied.version}`);
      return;
    }

    // 2. Discover pending migration files (excluding *_down.sql)
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !f.endsWith('_down.sql'))
      .sort();

    let pendingCount = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (appliedVersions.has(version)) {
        continue;
      }

      console.log(`Applying migration: ${file}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        console.log(`Applied migration: ${file}`);
        pendingCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Failed to apply migration ${file}:`, err);
        throw err;
      }
    }

    if (pendingCount === 0) {
      console.log('Database is up to date. No pending migrations.');
    } else {
      console.log(`Successfully applied ${pendingCount} migration(s).`);
    }
  } finally {
    await client.end();
  }
}

const isRollback = process.argv.includes('--rollback');
runMigrations(isRollback).catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
