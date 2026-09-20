/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import type pg from 'pg';
import { SEED_QUESTION_BANK } from './question_bank.data.js';

export async function seedQuestionBank(client: pg.PoolClient | pg.Client): Promise<number> {
  // Check if question_bank already has questions
  const checkRes = await client.query('SELECT COUNT(*)::int AS count FROM question_bank');
  if (checkRes.rows[0].count > 0) {
    return checkRes.rows[0].count;
  }

  console.log('[Seed] Seeding question_bank with curriculum questions...');
  let inserted = 0;

  for (const q of SEED_QUESTION_BANK) {
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
    inserted++;
  }

  console.log(`[Seed] Seeded ${inserted} questions into question_bank.`);
  return inserted;
}

// Standalone execution entrypoint for `npm run db:seed:questions`
async function runStandalone() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[Seed Error] DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString });
  
  try {
    await client.connect();
    console.log('====================================================');
    console.log('EDUMATE QUESTION BANK SEED OPERATION');
    console.log('====================================================');
    const totalCount = await seedQuestionBank(client);
    console.log(`[Seed Complete] Question bank verified with ${totalCount} items.`);
    process.exit(0);
  } catch (err) {
    console.error('[Seed Error] Failed to seed question bank:', err);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

// Execute if run directly from CLI
const isDirectRun =
  process.argv[1]?.includes('question_bank.seed') ||
  process.argv[1]?.endsWith('question_bank.seed.ts') ||
  process.argv[1]?.endsWith('question_bank.seed.js');

if (isDirectRun) {
  runStandalone();
}
