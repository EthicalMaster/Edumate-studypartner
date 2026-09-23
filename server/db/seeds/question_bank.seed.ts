/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import type pg from 'pg';
import { ALL_CURRICULUM_QUESTIONS, validateCurriculumDataset } from './curriculum/index.js';

export interface SeedOptions {
  reset?: boolean;
}

export async function seedQuestionBank(
  client: pg.PoolClient | pg.Client,
  options?: SeedOptions
): Promise<{ total: number; inserted: number; existing: number }> {
  // Validate the dataset in-memory before touching the database
  const validation = validateCurriculumDataset(ALL_CURRICULUM_QUESTIONS);
  if (!validation.valid) {
    const issueSummary = validation.issues
      .slice(0, 5)
      .map((i) => `[${i.subject} - ${i.topic}] (${i.field}): ${i.error}`)
      .join('\n');
    throw new Error(
      `[Seed Error] Curriculum dataset validation failed with ${validation.issues.length} issues:\n${issueSummary}`
    );
  }

  // Handle optional reset
  if (options?.reset) {
    console.log('[Seed] Reset requested. Truncating question_bank table...');
    await client.query('TRUNCATE TABLE question_bank RESTART IDENTITY CASCADE');
  }

  // Fetch existing question fingerprints for idempotency
  const existingRes = await client.query<{ subject: string; topic: string; question_text: string }>(
    'SELECT subject, topic, question_text FROM question_bank'
  );
  const existingSet = new Set(
    existingRes.rows.map((r) => `${r.subject}:::${r.topic}:::${r.question_text.trim()}`)
  );

  console.log(
    `[Seed] Seeding question_bank. Dataset size: ${ALL_CURRICULUM_QUESTIONS.length}, Already in DB: ${existingSet.size}`
  );

  let inserted = 0;
  let skipped = 0;

  for (const q of ALL_CURRICULUM_QUESTIONS) {
    const key = `${q.subject}:::${q.topic}:::${q.question_text.trim()}`;
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }

    await client.query(
      `INSERT INTO question_bank (
        subject, topic, difficulty, question_type, question_text,
        options, correct_option_ids, correct_answer_text,
        explanation, formula_hint, default_marks, section
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        q.subject,
        q.topic,
        q.difficulty,
        q.question_type,
        q.question_text,
        JSON.stringify(q.options),
        JSON.stringify(q.correct_option_ids),
        q.correct_answer_text || null,
        q.explanation,
        q.formula_hint || null,
        q.default_marks,
        q.section,
      ]
    );
    existingSet.add(key);
    inserted++;
  }

  const countRes = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM question_bank');
  const finalTotal = parseInt(countRes.rows[0].count, 10);

  console.log(
    `[Seed Complete] Successfully processed: ${inserted} newly inserted, ${skipped} already existed. Total questions in database: ${finalTotal}.`
  );

  return { total: finalTotal, inserted, existing: skipped };
}

// Standalone execution entrypoint for `npm run db:seed:questions`
async function runStandalone() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[Seed Error] DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const shouldReset = process.argv.includes('--reset') || process.argv.includes('--force');

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString });

  try {
    await client.connect();
    console.log('====================================================');
    console.log('EDUMATE EXPANDED CURRICULUM QUESTION BANK SEED');
    console.log('====================================================');
    if (shouldReset) {
      console.log('Flag detected: --reset/--force enabled.');
    }

    await client.query('BEGIN');
    const result = await seedQuestionBank(client, { reset: shouldReset });
    await client.query('COMMIT');

    console.log('====================================================');
    console.log(`[Database Ready] Question Bank total: ${result.total} records`);
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Seed Error] Failed to seed question bank:', err);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

// Execute if run directly from CLI
const isDirectRun =
  Boolean(process.argv[1]?.includes('question_bank.seed')) &&
  !process.argv[1]?.includes('.test.');

if (isDirectRun) {
  runStandalone();
}
