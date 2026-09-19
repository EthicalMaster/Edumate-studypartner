/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// DEVELOPMENT ONLY SEED SCRIPT
// WARNING: Do NOT use this script in production environments.
// This script provides minimal relational records to verify schema integrity.
// ============================================================================

import pg from 'pg';

async function seedDevelopmentData() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is required to seed data.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log('[DEV SEED] Seeding relational development test data...');

  try {
    await client.query('BEGIN');

    // 1. Create development test user
    // Note: Development-only password hash for 'DevTestPass123!'
    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
       RETURNING id;`,
      [
        'dev.student@edumate.internal',
        '$2b$12$K89QcQ96y5i0aB1XvK83ceF4T9sC8wBv4uG3h9pM6kY1nO8q7r2Zy', // Dev dummy hash
        'STUDENT',
        true,
      ]
    );
    const userId = userRes.rows[0].id;

    // 2. Create student profile
    const profileRes = await client.query(
      `INSERT INTO student_profiles (user_id, full_name, institution, department, current_year, student_identifier)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
       RETURNING id;`,
      [
        userId,
        'Dev Test Student',
        'Faculty of Engineering & Technology',
        'Computer Science',
        3,
        'DEV-CS-2024',
      ]
    );
    const studentId = profileRes.rows[0].id;

    // 3. Create sample study material metadata
    const materialRes = await client.query(
      `INSERT INTO study_materials (student_id, filename, file_type, file_size_bytes, storage_location, subject, topic, processing_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id;`,
      [
        studentId,
        'electrostatics_lecture_notes.pdf',
        'application/pdf',
        4194304, // 4MB
        '/storage/dev/materials/electrostatics_lecture_notes.pdf',
        'Physics',
        'Electrostatics & Gauss Law',
        'completed',
      ]
    );
    const materialId = materialRes.rows[0].id;

    // 4. Create sample study kit
    const kitRes = await client.query(
      `INSERT INTO study_kits (student_id, source_material_id, title, subject, unit, description, summary_content, formula_sheet, key_concepts, trap_alerts, is_remedial)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id;`,
      [
        studentId,
        materialId,
        'Unit 1: Electrostatic Fields & Flux',
        'Physics',
        'Electromagnetism I',
        'Foundational principles governing electrostatic fields and boundary surfaces.',
        '# Electrostatics\nElectrostatic fields originate from stationary electric charges.',
        JSON.stringify([
          { name: "Coulomb's Law", latex: 'F = \\frac{1}{4\\pi\\varepsilon_0} \\frac{q_1 q_2}{r^2}' },
          { name: "Gauss's Law", latex: '\\oint E \\cdot dA = \\frac{Q_{\\text{encl}}}{\\varepsilon_0}' },
        ]),
        JSON.stringify([
          { concept: 'Electric Flux', definition: 'The measure of flow of the electric field through a given surface.' },
        ]),
        JSON.stringify([
          { trap: 'Forgetting surface normal', avoidance: 'Always verify angle between field vector and outward unit normal.' },
        ]),
        false,
      ]
    );
    const kitId = kitRes.rows[0].id;

    // 5. Create flashcards
    await client.query(
      `INSERT INTO flashcards (study_kit_id, student_id, subject, topic, question, answer, key_concept, formula, difficulty, mastery_state)
       VALUES 
       ($1, $2, 'Physics', 'Gauss Law', 'What does Gauss Law state for an enclosed charge?', 'The net electric flux through any closed surface is proportional to the enclosed charge.', 'Gauss Law', '\\oint E \\cdot dA = Q / \\varepsilon_0', 'medium', 'learning'),
       ($1, $2, 'Physics', 'Permittivity', 'What is the relative permittivity of vacuum?', '1.0 exactly by definition.', 'Vacuum Permittivity', '\\varepsilon_r = 1', 'easy', 'reviewing');`,
      [kitId, studentId]
    );

    // 6. Create sample quiz paper
    const quizRes = await client.query(
      `INSERT INTO quizzes (student_id, study_kit_id, title, subject, topic, question_count, time_limit_minutes, difficulty, is_diagnostic)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id;`,
      [
        studentId,
        kitId,
        'Electrostatics Diagnostic Drill',
        'Physics',
        'Electric Field & Flux',
        5,
        15,
        'medium',
        true,
      ]
    );
    const quizId = quizRes.rows[0].id;

    // 7. Add question to quiz
    await client.query(
      `INSERT INTO quiz_questions (quiz_id, question_order, question_text, question_type, options, correct_option_ids, explanation, formula_hint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [
        quizId,
        1,
        'What happens to the electric flux through a spherical Gaussian surface if its radius is halved?',
        'single_choice',
        JSON.stringify([
          { id: 'opt-a', text: 'It remains unchanged' },
          { id: 'opt-b', text: 'It doubles' },
          { id: 'opt-c', text: 'It is halved' },
          { id: 'opt-d', text: 'It quadruples' },
        ]),
        JSON.stringify(['opt-a']),
        'By Gauss Law, total flux depends strictly on enclosed charge, independent of surface radius.',
        '\\Phi = Q_{\\text{encl}} / \\varepsilon_0',
      ]
    );

    await client.query('COMMIT');
    console.log('[DEV SEED] Successfully seeded test records.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[DEV SEED] Seeding failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

seedDevelopmentData().catch((err) => {
  console.error(err);
  process.exit(1);
});
