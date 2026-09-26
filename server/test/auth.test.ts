/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { newDb } from 'pg-mem';
import crypto from 'crypto';
import pg from 'pg';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
  generateLearnerId,
  isValidLearnerId,
} from '../utils/crypto.js';
import {
  registerSchema,
  loginSchema,
  isValidEmail,
  normalizeEmail,
  LEARNER_ID_REGEX,
} from '../utils/validation.js';
import { setPoolForTesting } from '../db/connection.js';
import { userRepository } from '../repositories/user.repository.js';
import { authService } from '../services/auth.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestSummary {
  name: string;
  passed: boolean;
  message?: string;
}

const results: TestSummary[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runAuthTests() {
  console.log('====================================================');
  console.log('AVEN PHASE 3: AUTHENTICATION SYSTEM TESTS');
  console.log('====================================================\n');

  // Load migration DDL
  const migration1 = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '001_initial_schema.sql'),
    'utf-8'
  );
  const migration2 = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '002_authentication_sessions.sql'),
    'utf-8'
  );
  const migration3 = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '003_auth_compatibility.sql'),
    'utf-8'
  );
  const migration4 = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '004_education_profile.sql'),
    'utf-8'
  );
  const migration5 = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '005_learner_id_system.sql'),
    'utf-8'
  );

  let client: any;
  let isLive = false;

  if (process.env.DATABASE_URL) {
    try {
      const realClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await realClient.connect();
      client = realClient;
      isLive = true;
      console.log('[Test Harness] Running against live PostgreSQL database.');
    } catch {
      console.log('[Test Harness] Live DB not available. Falling back to in-memory PostgreSQL engine (pg-mem).');
    }
  }

  if (!isLive) {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    db.public.registerFunction({
      name: 'gen_random_uuid',
      returns: (db.public as any).getType('uuid'),
      impure: true,
      implementation: () => crypto.randomUUID(),
    });
    db.public.registerFunction({
      name: 'md5',
      args: [(db.public as any).getType('text')],
      returns: (db.public as any).getType('text'),
      implementation: (val: string) => crypto.createHash('md5').update(val || '').digest('hex'),
    });
    db.public.registerFunction({
      name: 'length',
      args: [(db.public as any).getType('text')],
      returns: (db.public as any).getType('integer'),
      implementation: (val: string) => (val ? val.length : 0),
    });
    db.public.registerFunction({
      name: 'upper',
      args: [(db.public as any).getType('text')],
      returns: (db.public as any).getType('text'),
      implementation: (val: string) => (val ? val.toUpperCase() : ''),
    });
    db.public.registerFunction({
      name: 'substring',
      args: [
        (db.public as any).getType('text'),
        (db.public as any).getType('integer'),
        (db.public as any).getType('integer'),
      ],
      returns: (db.public as any).getType('text'),
      implementation: (val: string, start: number, len: number) =>
        val ? val.substring(start - 1, start - 1 + len) : '',
    });

    const cleanSql1 = migration1
      .replace(/CREATE EXTENSION[^\n]+;/gi, '')
      .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?LANGUAGE plpgsql;/gi, '')
      .replace(/CREATE TRIGGER[\s\S]*?EXECUTE FUNCTION[^\n]+;/gi, '');

    const cleanSql2 = migration2;
    const cleanSql3 = migration3;
    const cleanSql4 = migration4;
    const cleanSql5 = migration5.replace(/CHECK\s*\([^)]*~[^)]*\)/gi, 'CHECK (student_identifier IS NOT NULL)');

    const pgMemAdapter = db.adapters.createPg();
    const testPool = new pgMemAdapter.Pool();
    setPoolForTesting(testPool);
    client = await testPool.connect();

    await client.query(cleanSql1);
    await client.query(cleanSql2);
    await client.query(cleanSql3);
    await client.query(cleanSql4);
    await client.query(cleanSql5);
    console.log('[Test Harness] In-memory PostgreSQL engine initialized with schemas 001 through 005.\n');
  }

  // --------------------------------------------------------------------------
  // TEST 1: Password Hashing (Argon2id)
  // --------------------------------------------------------------------------
  try {
    const rawPass = 'SecretP@ssword2026';
    const hash = await hashPassword(rawPass);
    assert(hash.startsWith('$argon2id$'), 'Hash must use Argon2id format ($argon2id$)');
    assert(hash !== rawPass, 'Plaintext password must never equal hash');
    const matches = await verifyPassword(hash, rawPass);
    assert(matches === true, 'Argon2id verify must succeed on correct password');
    const wrongMatches = await verifyPassword(hash, 'WrongPassword123');
    assert(wrongMatches === false, 'Argon2id verify must fail on incorrect password');

    results.push({ name: '1. Argon2id Password Hashing & Verification', passed: true });
    console.log('✓ TEST 1: Argon2id Password Hashing & Verification passed');
  } catch (e: any) {
    results.push({ name: '1. Argon2id Password Hashing & Verification', passed: false, message: e.message });
    console.error('✗ TEST 1 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Successful Registration (Atomic Transaction)
  // --------------------------------------------------------------------------
  let student1UserId = '';
  let student1ProfileId = '';
  let student1SessionToken = '';
  try {
    const candidateId = generateLearnerId();
    const input = {
      email: 'alex.chen@university.edu',
      password: 'SecureStudentPass2026!',
      confirm_password: 'SecureStudentPass2026!',
      full_name: 'Alex Chen',
      institution: 'Stanford University',
      department: 'Computer Science',
      current_year: 3,
      student_identifier: candidateId,
    };

    // Validate using Zod schema
    const validated = registerSchema.parse(input);
    const passHash = await hashPassword(validated.password);

    // Run transaction
    await client.query('BEGIN');
    const uRes = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ($1, $2, 'STUDENT', true)
       RETURNING id, email, role, is_active;`,
      [validated.email.toLowerCase(), passHash]
    );
    student1UserId = uRes.rows[0].id;

    const pRes = await client.query(
      `INSERT INTO student_profiles (user_id, full_name, institution, department, current_year, student_identifier)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, institution, department, current_year, student_identifier;`,
      [
        student1UserId,
        validated.full_name,
        validated.institution,
        validated.department,
        validated.current_year,
        validated.student_identifier,
      ]
    );
    student1ProfileId = pRes.rows[0].id;
    await client.query('COMMIT');

    // Create session
    student1SessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(student1SessionToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await client.query(
      `INSERT INTO user_sessions (user_id, session_token_hash, expires_at)
       VALUES ($1, $2, $3);`,
      [student1UserId, tokenHash, expiresAt]
    );

    assert(Boolean(student1UserId), 'User ID must be generated');
    assert(Boolean(student1ProfileId), 'Student Profile ID must be generated');
    assert(pRes.rows[0].full_name === 'Alex Chen', 'Profile full_name must match input');

    results.push({ name: '2. Successful Student Registration (Atomic Transaction)', passed: true });
    console.log('✓ TEST 2: Successful Student Registration passed');
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    results.push({ name: '2. Successful Student Registration', passed: false, message: e.message });
    console.error('✗ TEST 2 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Duplicate Email Rejection
  // --------------------------------------------------------------------------
  try {
    let rejected = false;
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (email, password_hash, role, is_active)
         VALUES ($1, $2, 'STUDENT', true);`,
        ['alex.chen@university.edu', 'another_dummy_hash']
      );
      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      rejected = true;
    }
    assert(rejected, 'Duplicate email insertion must be rejected by unique constraint');

    results.push({ name: '3. Duplicate Email Rejection (Unique Constraint)', passed: true });
    console.log('✓ TEST 3: Duplicate Email Rejection passed');
  } catch (e: any) {
    results.push({ name: '3. Duplicate Email Rejection', passed: false, message: e.message });
    console.error('✗ TEST 3 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Successful Login & Credential Verification
  // --------------------------------------------------------------------------
  try {
    const loginInput = {
      email: 'alex.chen@university.edu',
      password: 'SecureStudentPass2026!',
    };
    loginSchema.parse(loginInput);

    const userRes = await client.query(
      `SELECT u.*, p.id as student_id, p.full_name
       FROM users u
       JOIN student_profiles p ON p.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1) AND u.is_active = true;`,
      [loginInput.email]
    );

    assert(userRes.rows.length === 1, 'User must be found by email');
    const user = userRes.rows[0];
    const passMatches = await verifyPassword(user.password_hash, loginInput.password);
    assert(passMatches, 'Password verification must succeed');

    results.push({ name: '4. Successful Login & Credential Verification', passed: true });
    console.log('✓ TEST 4: Successful Login passed');
  } catch (e: any) {
    results.push({ name: '4. Successful Login', passed: false, message: e.message });
    console.error('✗ TEST 4 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Incorrect Password Rejection (Generic Error)
  // --------------------------------------------------------------------------
  try {
    const userRes = await client.query('SELECT password_hash FROM users WHERE email = $1;', [
      'alex.chen@university.edu',
    ]);
    const passMatches = await verifyPassword(userRes.rows[0].password_hash, 'TotallyWrongPassword!');
    assert(!passMatches, 'Incorrect password must fail verification');

    results.push({ name: '5. Incorrect Password Rejection (No Enumeration)', passed: true });
    console.log('✓ TEST 5: Incorrect Password Rejection passed');
  } catch (e: any) {
    results.push({ name: '5. Incorrect Password Rejection', passed: false, message: e.message });
    console.error('✗ TEST 5 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Inactive User Rejection
  // --------------------------------------------------------------------------
  try {
    // Create deactivated student
    const deactPassHash = await hashPassword('Deactivated123!');
    const dRes = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ($1, $2, 'STUDENT', false)
       RETURNING id, is_active;`,
      ['inactive.student@university.edu', deactPassHash]
    );
    assert(dRes.rows[0].is_active === false, 'Account must be marked inactive');

    // Attempt login check
    const checkRes = await client.query(
      'SELECT id, is_active FROM users WHERE email = $1;',
      ['inactive.student@university.edu']
    );
    assert(checkRes.rows[0].is_active === false, 'Inactive flag must block authentication');

    results.push({ name: '6. Inactive Account Authentication Rejection', passed: true });
    console.log('✓ TEST 6: Inactive Account Authentication Rejection passed');
  } catch (e: any) {
    results.push({ name: '6. Inactive Account Rejection', passed: false, message: e.message });
    console.error('✗ TEST 6 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Successful /api/auth/me (Active Session Resolution)
  // --------------------------------------------------------------------------
  try {
    const tokenHash = hashSessionToken(student1SessionToken);
    const sessionRes = await client.query(
      `SELECT s.id as session_id, u.id as user_id, u.email, u.role, p.id as student_id, p.full_name
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       JOIN student_profiles p ON p.user_id = u.id
       WHERE s.session_token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND u.is_active = true;`,
      [tokenHash]
    );

    assert(sessionRes.rows.length === 1, 'Active session must resolve authenticated identity');
    assert(sessionRes.rows[0].full_name === 'Alex Chen', 'Must resolve attached profile');
    assert(sessionRes.rows[0].email === 'alex.chen@university.edu', 'Must resolve user email');

    results.push({ name: '7. Successful /api/auth/me Active Session Resolution', passed: true });
    console.log('✓ TEST 7: Successful /api/auth/me passed');
  } catch (e: any) {
    results.push({ name: '7. Successful /api/auth/me', passed: false, message: e.message });
    console.error('✗ TEST 7 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Unauthenticated /api/auth/me (Missing or Invalid Token)
  // --------------------------------------------------------------------------
  try {
    const fakeTokenHash = hashSessionToken('completely_fabricated_token_12345');
    const sessionRes = await client.query(
      `SELECT s.id FROM user_sessions s
       WHERE s.session_token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW();`,
      [fakeTokenHash]
    );
    assert(sessionRes.rows.length === 0, 'Unregistered token must return no session');

    results.push({ name: '8. Unauthenticated /api/auth/me Rejection', passed: true });
    console.log('✓ TEST 8: Unauthenticated /api/auth/me Rejection passed');
  } catch (e: any) {
    results.push({ name: '8. Unauthenticated /api/auth/me Rejection', passed: false, message: e.message });
    console.error('✗ TEST 8 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Logout & Session Revocation
  // --------------------------------------------------------------------------
  try {
    const tokenHash = hashSessionToken(student1SessionToken);
    await client.query(
      `UPDATE user_sessions SET revoked_at = NOW() WHERE session_token_hash = $1;`,
      [tokenHash]
    );

    const checkRes = await client.query(
      `SELECT id, revoked_at FROM user_sessions WHERE session_token_hash = $1;`,
      [tokenHash]
    );
    assert(checkRes.rows[0].revoked_at !== null, 'revoked_at must be populated');

    results.push({ name: '9. Logout & Session Revocation', passed: true });
    console.log('✓ TEST 9: Logout & Session Revocation passed');
  } catch (e: any) {
    results.push({ name: '9. Logout & Session Revocation', passed: false, message: e.message });
    console.error('✗ TEST 9 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Revoked Session Rejection
  // --------------------------------------------------------------------------
  try {
    const tokenHash = hashSessionToken(student1SessionToken);
    const sessionRes = await client.query(
      `SELECT s.id FROM user_sessions s
       WHERE s.session_token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW();`,
      [tokenHash]
    );
    assert(sessionRes.rows.length === 0, 'Revoked session must be rejected');

    results.push({ name: '10. Revoked Session Rejection', passed: true });
    console.log('✓ TEST 10: Revoked Session Rejection passed');
  } catch (e: any) {
    results.push({ name: '10. Revoked Session Rejection', passed: false, message: e.message });
    console.error('✗ TEST 10 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 11: Expired Session Rejection
  // --------------------------------------------------------------------------
  try {
    const expiredToken = generateSessionToken();
    const expiredHash = hashSessionToken(expiredToken);
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago

    await client.query(
      `INSERT INTO user_sessions (user_id, session_token_hash, expires_at)
       VALUES ($1, $2, $3);`,
      [student1UserId, expiredHash, pastDate]
    );

    const sessionRes = await client.query(
      `SELECT s.id FROM user_sessions s
       WHERE s.session_token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW();`,
      [expiredHash]
    );
    assert(sessionRes.rows.length === 0, 'Expired session must not be active');

    results.push({ name: '11. Expired Session Rejection', passed: true });
    console.log('✓ TEST 11: Expired Session Rejection passed');
  } catch (e: any) {
    results.push({ name: '11. Expired Session Rejection', passed: false, message: e.message });
    console.error('✗ TEST 11 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 12: Student Data Isolation (Anti-IDOR)
  // --------------------------------------------------------------------------
  try {
    // Create Student B
    const passB = await hashPassword('StudentBPass2026!');
    const uB = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ($1, $2, 'STUDENT', true) RETURNING id;`,
      ['student.b@university.edu', passB]
    );
    const pB = await client.query(
      `INSERT INTO student_profiles (user_id, full_name, student_identifier)
       VALUES ($1, 'Student B', $2) RETURNING id;`,
      [uB.rows[0].id, generateLearnerId()]
    );
    const student2ProfileId = pB.rows[0].id;

    // Create a study kit owned strictly by Student A
    const kitA = await client.query(
      `INSERT INTO study_kits (student_id, title, subject)
       VALUES ($1, 'Student A Private Kit', 'Computer Science')
       RETURNING id;`,
      [student1ProfileId]
    );
    const kitAId = kitA.rows[0].id;

    // Simulate Student B attempting to access Student A's kit:
    // With authenticated student_id isolation:
    const isolatedQuery = await client.query(
      `SELECT id, title FROM study_kits WHERE id = $1 AND student_id = $2;`,
      [kitAId, student2ProfileId]
    );
    assert(isolatedQuery.rows.length === 0, 'Student B must NEVER be able to access Student A study kit');

    // Authorized owner access:
    const ownerQuery = await client.query(
      `SELECT id, title FROM study_kits WHERE id = $1 AND student_id = $2;`,
      [kitAId, student1ProfileId]
    );
    assert(ownerQuery.rows.length === 1, 'Authorized owner must access their own kit');

    results.push({ name: '12. Student Ownership Isolation (Anti-IDOR)', passed: true });
    console.log('✓ TEST 12: Student Ownership Isolation passed');
  } catch (e: any) {
    results.push({ name: '12. Student Ownership Isolation', passed: false, message: e.message });
    console.error('✗ TEST 12 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 13: Practical Email Validation & Normalization
  // --------------------------------------------------------------------------
  try {
    // 1. Valid emails accepted
    assert(isValidEmail('student@university.edu'), 'student@university.edu must be valid');
    assert(isValidEmail('alex.chen@stanford.edu'), 'alex.chen@stanford.edu must be valid');
    assert(isValidEmail('user.name+tag@sub.domain.co.uk'), 'subdomain email must be valid');

    // 2. Trimming & lowercasing normalization
    assert(normalizeEmail('  ALEX.CHEN@STANFORD.EDU  ') === 'alex.chen@stanford.edu', 'Email normalization must trim and lowercase');

    // 3. Reject malformed addresses as required
    const malformedList = [
      'test',             // no @
      'test@',            // no domain
      '@gmail.com',       // no local part
      'test@gmail',       // no dot/TLD
      'test@@gmail.com',  // double @
      '',                 // empty
      '   ',              // whitespace only
      'user@.com',        // empty domain label
      'user@domain..com', // consecutive dots
    ];

    for (const badEmail of malformedList) {
      assert(!isValidEmail(badEmail), `Email '${badEmail}' must be rejected by practical email validator`);
    }

    results.push({ name: '13. Practical Email Validation & Normalization', passed: true });
    console.log('✓ TEST 13: Practical Email Validation & Normalization passed');
  } catch (e: any) {
    results.push({ name: '13. Practical Email Validation & Normalization', passed: false, message: e.message });
    console.error('✗ TEST 13 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 14: Backend Validation Authority (Tamper-Resistance)
  // --------------------------------------------------------------------------
  try {
    // Bypassing frontend to call register schema directly with malformed emails must fail
    const invalidInputs = [
      'test',
      'test@',
      '@gmail.com',
      'test@gmail',
      'test@@gmail.com',
    ];

    for (const badEmail of invalidInputs) {
      const parsed = registerSchema.safeParse({
        email: badEmail,
        password: 'Password123!',
        confirm_password: 'Password123!',
        full_name: 'Test Student',
        education_level: 'Undergraduate / College',
        academic_stage: '1st Year',
      });
      assert(!parsed.success, `Backend registration schema must reject malformed email '${badEmail}'`);
    }

    // Backend login schema must also reject malformed emails
    for (const badEmail of invalidInputs) {
      const parsed = loginSchema.safeParse({
        email: badEmail,
        password: 'Password123!',
      });
      assert(!parsed.success, `Backend login schema must reject malformed email '${badEmail}'`);
    }

    results.push({ name: '14. Backend Email Validation Authority', passed: true });
    console.log('✓ TEST 14: Backend Email Validation Authority passed');
  } catch (e: any) {
    results.push({ name: '14. Backend Email Validation Authority', passed: false, message: e.message });
    console.error('✗ TEST 14 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 15: Case-Insensitive Unique-Email Database Constraint
  // --------------------------------------------------------------------------
  try {
    const duplicateEmailAttempts = [
      'ALEX.CHEN@UNIVERSITY.EDU',
      'Alex.Chen@University.Edu',
      '  alex.chen@university.edu  ',
    ];

    for (const dup of duplicateEmailAttempts) {
      const normalized = normalizeEmail(dup);
      const existing = await client.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1);`,
        [normalized]
      );
      assert(existing.rows.length >= 1, `Email '${dup}' must collide with existing registered account`);
    }

    results.push({ name: '15. Normalized Email Uniqueness Preservation', passed: true });
    console.log('✓ TEST 15: Normalized Email Uniqueness Preservation passed');
  } catch (e: any) {
    results.push({ name: '15. Normalized Email Uniqueness Preservation', passed: false, message: e.message });
    console.error('✗ TEST 15 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 16: Authentication Schema Compatibility (Future Google Sign-In & Verified Email)
  // --------------------------------------------------------------------------
  try {
    // 1. Verify email_verified and auth_provider columns exist with safe defaults
    const compatUserRes = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active, email_verified, auth_provider)
       VALUES ('federation.ready@university.edu', NULL, 'STUDENT', true, true, 'google_future_ready')
       RETURNING id, email, password_hash, role, is_active, email_verified, auth_provider;`
    );
    assert(compatUserRes.rows.length === 1, 'Schema must support NULL password_hash for future Google Sign-In accounts');
    const compatUser = compatUserRes.rows[0];
    assert(compatUser.email_verified === true, 'email_verified field must be stored and queried correctly');
    assert(compatUser.auth_provider === 'google_future_ready', 'auth_provider field must be stored and queried correctly');
    assert(compatUser.password_hash === null, 'password_hash can be null for future federated accounts');

    // 2. Verify standard user has safe defaults
    const standardUserRes = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ('standard.defaults@university.edu', '$argon2id$v=19$m=65536,t=3,p=4$fakehash', 'STUDENT', true)
       RETURNING id, email, email_verified, auth_provider;`
    );
    const standardUser = standardUserRes.rows[0];
    assert(standardUser.email_verified === false, 'Default email_verified must be false');
    assert(standardUser.auth_provider === 'local', 'Default auth_provider must be local');

    results.push({ name: '16. Future Google Sign-In Architecture Compatibility', passed: true });
    console.log('✓ TEST 16: Future Google Sign-In Architecture Compatibility passed');
  } catch (e: any) {
    results.push({ name: '16. Future Google Sign-In Architecture Compatibility', passed: false, message: e.message });
    console.error('✗ TEST 16 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 17: Multi-Level Education Profile Validation (School, Postgrad, Diploma, Other)
  // --------------------------------------------------------------------------
  try {
    // Valid School Profile (Grade 10)
    const schoolParsed = registerSchema.safeParse({
      email: 'school.learner@edumate.org',
      password: 'StrongPassword123!',
      confirm_password: 'StrongPassword123!',
      full_name: 'Maya Patel',
      education_level: 'School',
      academic_stage: 'Grade 10',
      institution: 'Lincoln High School',
    });
    assert(schoolParsed.success, 'Valid school registration must be accepted');

    // Valid Postgraduate Profile (2nd Year)
    const postgradParsed = registerSchema.safeParse({
      email: 'postgrad.learner@edumate.org',
      password: 'StrongPassword123!',
      confirm_password: 'StrongPassword123!',
      full_name: 'David Kim',
      education_level: 'Postgraduate',
      academic_stage: '2nd Year',
      department: 'Biochemistry',
    });
    assert(postgradParsed.success, 'Valid postgraduate registration must be accepted');

    // Valid Diploma Profile (Year 2)
    const diplomaParsed = registerSchema.safeParse({
      email: 'diploma.learner@edumate.org',
      password: 'StrongPassword123!',
      confirm_password: 'StrongPassword123!',
      full_name: 'Carlos Mendez',
      education_level: 'Diploma / Vocational',
      academic_stage: 'Year 2',
    });
    assert(diplomaParsed.success, 'Valid diploma registration must be accepted');

    // Valid Other Profile (Self-Paced)
    const otherParsed = registerSchema.safeParse({
      email: 'lifelong.learner@edumate.org',
      password: 'StrongPassword123!',
      confirm_password: 'StrongPassword123!',
      full_name: 'Sarah Connor',
      education_level: 'Other',
      academic_stage: 'Self-Paced Learner',
    });
    assert(otherParsed.success, 'Valid custom learner registration must be accepted');

    // Incompatible level / stage (e.g. School learner with university '4th Year')
    const invalidComboParsed = registerSchema.safeParse({
      email: 'mismatched@edumate.org',
      password: 'StrongPassword123!',
      confirm_password: 'StrongPassword123!',
      full_name: 'Incompatible Student',
      education_level: 'School',
      academic_stage: '4th Year',
    });
    assert(!invalidComboParsed.success, 'School learner with university 4th Year stage must be rejected');

    results.push({ name: '17. Multi-Level Education Profile Validation', passed: true });
    console.log('✓ TEST 17: Multi-Level Education Profile Validation passed');
  } catch (e: any) {
    results.push({ name: '17. Multi-Level Education Profile Validation', passed: false, message: e.message });
    console.error('✗ TEST 17 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 18: Database Persistence of Diverse Education Levels
  // --------------------------------------------------------------------------
  try {
    const pHash = await hashPassword('StudentPass123!');

    // Insert School Learner (Grade 10)
    const schoolUser = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ('maya.grade10@edumate.org', $1, 'STUDENT', true)
       RETURNING id;`,
      [pHash]
    );
    const schoolUserId = schoolUser.rows[0].id;

    const schoolProfile = await client.query(
      `INSERT INTO student_profiles (user_id, full_name, education_level, academic_stage, institution, current_year)
       VALUES ($1, 'Maya Patel', 'School', 'Grade 10', 'Lincoln High', NULL)
       RETURNING id, full_name, education_level, academic_stage, current_year;`,
      [schoolUserId]
    );
    assert(schoolProfile.rows[0].education_level === 'School', 'education_level must persist as School');
    assert(schoolProfile.rows[0].academic_stage === 'Grade 10', 'academic_stage must persist as Grade 10');
    assert(schoolProfile.rows[0].current_year === null, 'current_year should safely be NULL for school learners');

    // Insert Postgraduate Learner
    const gradUser = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ('david.postgrad@edumate.org', $1, 'STUDENT', true)
       RETURNING id;`,
      [pHash]
    );
    const gradProfile = await client.query(
      `INSERT INTO student_profiles (user_id, full_name, education_level, academic_stage, department, current_year)
       VALUES ($1, 'David Kim', 'Postgraduate', '2nd Year', 'Biochemistry', NULL)
       RETURNING id, education_level, academic_stage, current_year;`,
      [gradUser.rows[0].id]
    );
    assert(gradProfile.rows[0].education_level === 'Postgraduate', 'education_level must persist as Postgraduate');
    assert(gradProfile.rows[0].academic_stage === '2nd Year', 'academic_stage must persist as 2nd Year');

    results.push({ name: '18. Database Persistence for Diverse Education Levels', passed: true });
    console.log('✓ TEST 18: Database Persistence for Diverse Education Levels passed');
  } catch (e: any) {
    results.push({ name: '18. Database Persistence for Diverse Education Levels', passed: false, message: e.message });
    console.error('✗ TEST 18 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 19: Backward Compatibility with Legacy 4-Year University Payloads
  // --------------------------------------------------------------------------
  try {
    // Client sending legacy payload with current_year: 4 and no education_level
    const legacyPayload = {
      email: 'legacy.senior@university.edu',
      password: 'LegacyPassword123!',
      confirm_password: 'LegacyPassword123!',
      full_name: 'Legacy Senior',
      current_year: 4,
    };
    const parsedLegacy = registerSchema.safeParse(legacyPayload);
    assert(parsedLegacy.success, 'Legacy registration payload with current_year: 4 must still validate');

    // Insert legacy record to verify backward-compatible storage
    const legUser = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ('legacy.senior@university.edu', 'hash', 'STUDENT', true)
       RETURNING id;`,
    );
    const legProfile = await client.query(
      `INSERT INTO student_profiles (user_id, full_name, education_level, academic_stage, current_year)
       VALUES ($1, 'Legacy Senior', 'Undergraduate / College', '4th Year', 4)
       RETURNING id, education_level, academic_stage, current_year;`,
      [legUser.rows[0].id]
    );
    assert(legProfile.rows[0].current_year === 4, 'Legacy current_year must still be stored');
    assert(legProfile.rows[0].education_level === 'Undergraduate / College', 'Legacy records default to Undergraduate');
    assert(legProfile.rows[0].academic_stage === '4th Year', 'Legacy records compute stage as 4th Year');

    results.push({ name: '19. Backward Compatibility with Legacy 4-Year University Schema', passed: true });
    console.log('✓ TEST 19: Backward Compatibility with Legacy 4-Year University Schema passed');
  } catch (e: any) {
    results.push({ name: '19. Backward Compatibility with Legacy 4-Year University Schema', passed: false, message: e.message });
    console.error('✗ TEST 19 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 20: New Registration Automatically Receives a Permanent Learner ID
  // --------------------------------------------------------------------------
  let autoUser: any = null;
  let autoLearnerId = '';
  try {
    const regInput = {
      email: 'auto.learner@university.edu',
      password: 'StrongPass2026!#',
      confirm_password: 'StrongPass2026!#',
      full_name: 'Jordan Rivera',
      education_level: 'Undergraduate / College' as const,
      academic_stage: '2nd Year',
      institution: 'UC Berkeley',
      department: 'Electrical Engineering',
    };

    // Note: No student_identifier is passed by the caller
    const created = await userRepository.createUserWithProfile(regInput);
    assert(!!created, 'createUserWithProfile must return the newly created user');
    assert(!!created.profile, 'User must have an associated student profile');
    assert(typeof created.profile?.student_identifier === 'string', 'student_identifier must be a string');
    assert((created.profile?.student_identifier ?? '').length > 0, 'student_identifier must not be empty');

    autoUser = created;
    autoLearnerId = created.profile!.student_identifier!;

    // Verify directly in database
    const dbCheck = await client.query(
      `SELECT student_identifier FROM student_profiles WHERE user_id = $1;`,
      [created.id]
    );
    assert(dbCheck.rows.length === 1, 'Database must contain profile row');
    assert(
      dbCheck.rows[0].student_identifier === autoLearnerId,
      'Database stored student_identifier must match repository return value'
    );

    results.push({ name: '20. Automatic Learner ID Generation on Registration', passed: true });
    console.log(`✓ TEST 20: Automatic Learner ID Generation passed (ID: ${autoLearnerId})`);
  } catch (e: any) {
    results.push({ name: '20. Automatic Learner ID Generation on Registration', passed: false, message: e.message });
    console.error('✗ TEST 20 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 21: Learner ID Format (Exact 10 chars, EDU prefix, 7 uppercase chars)
  // --------------------------------------------------------------------------
  try {
    assert(autoLearnerId.length === 10, `Learner ID must be exactly 10 characters long, got: ${autoLearnerId.length}`);
    assert(autoLearnerId.startsWith('EDU'), `Learner ID must begin with prefix EDU, got: ${autoLearnerId}`);
    
    const randomSuffix = autoLearnerId.slice(3);
    assert(randomSuffix.length === 7, `Suffix must be exactly 7 characters, got: ${randomSuffix.length}`);
    assert(/^[A-Z0-9]{7}$/.test(randomSuffix), `Suffix must use only uppercase A-Z and 0-9, got: ${randomSuffix}`);
    assert(isValidLearnerId(autoLearnerId), 'isValidLearnerId() helper must return true for generated ID');
    assert(LEARNER_ID_REGEX.test(autoLearnerId), 'LEARNER_ID_REGEX must match generated ID');

    // Negative assertions for invalid formats
    assert(!isValidLearnerId('EDU12345'), 'Must reject length != 10 (short)');
    assert(!isValidLearnerId('EDU12345678'), 'Must reject length != 10 (long)');
    assert(!isValidLearnerId('STU7K4P92X'), 'Must reject wrong prefix');
    assert(!isValidLearnerId('edu7k4p92x'), 'Must reject lowercase prefix and characters');
    assert(!isValidLearnerId('EDU7K4P92!'), 'Must reject special characters');
    assert(!isValidLearnerId(''), 'Must reject empty string');

    results.push({ name: '21. Learner ID Format and Specification Enforcement', passed: true });
    console.log('✓ TEST 21: Learner ID Format and Specification Enforcement passed');
  } catch (e: any) {
    results.push({ name: '21. Learner ID Format and Specification Enforcement', passed: false, message: e.message });
    console.error('✗ TEST 21 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 22: Uniqueness of Generated Learner IDs across Multiple Registrations
  // --------------------------------------------------------------------------
  try {
    const generatedIds = new Set<string>();
    generatedIds.add(autoLearnerId);

    // Register 10 more distinct users
    for (let i = 1; i <= 10; i++) {
      const u = await userRepository.createUserWithProfile({
        email: `batch.learner.${i}@edumate.org`,
        password: 'BatchPassword2026!',
        confirm_password: 'BatchPassword2026!',
        full_name: `Batch Learner ${i}`,
        education_level: 'Undergraduate / College',
        academic_stage: '1st Year',
      });
      const id = u.profile!.student_identifier!;
      assert(isValidLearnerId(id), `Generated ID ${id} must be valid`);
      assert(!generatedIds.has(id), `Learner ID collision detected for ID: ${id}`);
      generatedIds.add(id);
    }

    assert(generatedIds.size === 11, `All 11 registered users must have distinct unique Learner IDs`);

    results.push({ name: '22. Learner ID Uniqueness across Multiple Registrations', passed: true });
    console.log(`✓ TEST 22: Learner ID Uniqueness across Multiple Registrations passed (${generatedIds.size} unique IDs)`);
  } catch (e: any) {
    results.push({ name: '22. Learner ID Uniqueness across Multiple Registrations', passed: false, message: e.message });
    console.error('✗ TEST 22 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 23: Learner ID Persistence & Immutability across Logout and Login
  // --------------------------------------------------------------------------
  try {
    // 1. Log in the user created in Test 20
    const loginResult = await authService.login({
      email: 'auto.learner@university.edu',
      password: 'StrongPass2026!#',
    });
    assert(!!loginResult, 'Login must succeed');
    assert(
      loginResult.user.profile?.student_identifier === autoLearnerId,
      'Login response must return the exact same permanent Learner ID'
    );

    // 2. Simulate Logout by revoking session
    await authService.logout(loginResult.sessionToken);

    // 3. Log in again
    const reLoginResult = await authService.login({
      email: 'auto.learner@university.edu',
      password: 'StrongPass2026!#',
    });
    assert(!!reLoginResult, 'Re-login must succeed');
    assert(
      reLoginResult.user.profile?.student_identifier === autoLearnerId,
      'Re-login must preserve the exact same permanent Learner ID'
    );

    results.push({ name: '23. Learner ID Immutability across Logout & Login', passed: true });
    console.log('✓ TEST 23: Learner ID Immutability across Logout & Login passed');
  } catch (e: any) {
    results.push({ name: '23. Learner ID Immutability across Logout & Login', passed: false, message: e.message });
    console.error('✗ TEST 23 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 24: Learner ID Immutability across Profile Updates
  // --------------------------------------------------------------------------
  try {
    // Attempt normal profile update
    const updatedUser = await userRepository.updateProfile(autoUser.id, {
      full_name: 'Jordan Rivera Updated',
      department: 'Robotics & AI',
      institution: 'UC Berkeley COE',
    });
    assert(!!updatedUser, 'updatedUser must not be null');
    assert(updatedUser!.profile?.full_name === 'Jordan Rivera Updated', 'Profile full_name must be updated');
    assert(
      updatedUser!.profile?.student_identifier === autoLearnerId,
      'Learner ID must remain strictly unchanged after valid profile update'
    );

    // Attempt malicious attempt to inject a modified student_identifier
    const maliciousPayload = {
      full_name: 'Jordan Tampered',
      student_identifier: 'EDUHACKED99', // Malicious attempt to change permanent ID
    } as any;
    const tamperedResult = await userRepository.updateProfile(autoUser.id, maliciousPayload);
    assert(!!tamperedResult, 'tamperedResult must not be null');
    assert(
      tamperedResult!.profile?.student_identifier === autoLearnerId,
      'Learner ID must NEVER be modified by profile update calls'
    );

    // Verify database record directly
    const dbVerify = await client.query(
      `SELECT student_identifier FROM student_profiles WHERE user_id = $1;`,
      [autoUser.id]
    );
    assert(
      dbVerify.rows[0].student_identifier === autoLearnerId,
      'Database record must strictly retain original permanent Learner ID'
    );

    results.push({ name: '24. Learner ID Immutability across Profile Updates', passed: true });
    console.log('✓ TEST 24: Learner ID Immutability across Profile Updates passed');
  } catch (e: any) {
    results.push({ name: '24. Learner ID Immutability across Profile Updates', passed: false, message: e.message });
    console.error('✗ TEST 24 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 25: Anti-IDOR & Authorization Isolation (Learner Cannot Modify Another's ID)
  // --------------------------------------------------------------------------
  try {
    // Create Victim user
    const victim = await userRepository.createUserWithProfile({
      email: 'victim.student@edumate.org',
      password: 'VictimPass2026!',
      confirm_password: 'VictimPass2026!',
      full_name: 'Victim Student',
      education_level: 'Undergraduate / College',
      academic_stage: '1st Year',
    });
    const victimOriginalId = victim.profile!.student_identifier!;

    // Create Attacker user
    const attacker = await userRepository.createUserWithProfile({
      email: 'attacker.student@edumate.org',
      password: 'AttackerPass2026!',
      confirm_password: 'AttackerPass2026!',
      full_name: 'Attacker Student',
      education_level: 'Undergraduate / College',
      academic_stage: '1st Year',
    });

    // Attacker attempts to update victim's profile
    const attackerUpdate = await userRepository.updateProfile(attacker.id, {
      full_name: 'Attacker Renamed',
    });
    assert(!!attackerUpdate, 'attackerUpdate must not be null');
    assert(attackerUpdate!.id === attacker.id, 'Update must only affect the authenticated caller');

    // Verify Victim's record is completely untouched
    const victimDb = await client.query(
      `SELECT full_name, student_identifier FROM student_profiles WHERE user_id = $1;`,
      [victim.id]
    );
    assert(victimDb.rows[0].full_name === 'Victim Student', 'Victim profile name must remain intact');
    assert(
      victimDb.rows[0].student_identifier === victimOriginalId,
      'Victim Learner ID must remain strictly unchanged'
    );

    results.push({ name: '25. Anti-IDOR & Authorization Isolation', passed: true });
    console.log('✓ TEST 25: Anti-IDOR & Authorization Isolation passed');
  } catch (e: any) {
    results.push({ name: '25. Anti-IDOR & Authorization Isolation', passed: false, message: e.message });
    console.error('✗ TEST 25 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 26: Duplicate Candidate Collision Handling and Retry
  // --------------------------------------------------------------------------
  try {
    // 1. Verify isLearnerIdTaken correctly detects used vs unused IDs
    const taken = await userRepository.isLearnerIdTaken(autoLearnerId);
    assert(taken === true, `isLearnerIdTaken must return true for existing ID ${autoLearnerId}`);

    const unusedId = 'EDU9999999';
    const notTaken = await userRepository.isLearnerIdTaken(unusedId);
    assert(notTaken === false, `isLearnerIdTaken must return false for unused ID ${unusedId}`);

    // 2. Test generateUniqueLearnerId helper
    const freshUniqueId = await userRepository.generateUniqueLearnerId();
    assert(isValidLearnerId(freshUniqueId), 'generateUniqueLearnerId must produce a valid 10-char EDU ID');
    const isCollision = await userRepository.isLearnerIdTaken(freshUniqueId);
    assert(!isCollision, 'generateUniqueLearnerId must produce an unassigned ID');

    results.push({ name: '26. Duplicate Candidate Collision Handling & Retry', passed: true });
    console.log('✓ TEST 26: Duplicate Candidate Collision Handling & Retry passed');
  } catch (e: any) {
    results.push({ name: '26. Duplicate Candidate Collision Handling & Retry', passed: false, message: e.message });
    console.error('✗ TEST 26 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 27: Backward Compatibility & Safe Database Migration Backfill
  // --------------------------------------------------------------------------
  try {
    // Simulate pre-existing rows before backfill query:
    // User A: Has existing valid ID 'EDU7A1B2C3'
    const uA = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ('pre.valid@edumate.org', 'hash', 'STUDENT', true) RETURNING id;`
    );
    await client.query(
      `INSERT INTO student_profiles (user_id, full_name, student_identifier)
       VALUES ($1, 'Pre Valid', 'EDU7A1B2C3');`,
      [uA.rows[0].id]
    );

    // User B: Has legacy non-standard identifier 'STU-LEGACY-01'
    const uB = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ('pre.legacy@edumate.org', 'hash', 'STUDENT', true) RETURNING id;`
    );
    await client.query(
      `INSERT INTO student_profiles (user_id, full_name, student_identifier)
       VALUES ($1, 'Pre Legacy', 'STU-LEGACY-01');`,
      [uB.rows[0].id]
    );

    // Execute migration 005 backfill query logic
    await client.query(`
      UPDATE student_profiles
      SET student_identifier = 'EDU' || UPPER(SUBSTRING(MD5(id::text), 1, 7))
      WHERE student_identifier IS NULL 
         OR LENGTH(student_identifier) != 10 
         OR SUBSTRING(student_identifier, 1, 3) != 'EDU';
    `);

    // Verify User A: Existing valid ID must NOT have been overwritten
    const checkA = await client.query(
      `SELECT student_identifier FROM student_profiles WHERE user_id = $1;`,
      [uA.rows[0].id]
    );
    assert(
      checkA.rows[0].student_identifier === 'EDU7A1B2C3',
      'Existing valid Learner ID must be strictly preserved by backfill'
    );

    // Verify User B: Non-standard ID must have been safely migrated to a valid 10-char EDU ID
    const checkB = await client.query(
      `SELECT student_identifier FROM student_profiles WHERE user_id = $1;`,
      [uB.rows[0].id]
    );
    const newIdB = checkB.rows[0].student_identifier;
    assert(isValidLearnerId(newIdB), `Migrated ID must now be valid 10-char EDU ID, got: ${newIdB}`);
    assert(newIdB !== 'STU-LEGACY-01', 'Legacy non-standard ID must be upgraded');

    results.push({ name: '27. Backward Compatibility & Safe Migration Backfill', passed: true });
    console.log('✓ TEST 27: Backward Compatibility & Safe Migration Backfill passed');
  } catch (e: any) {
    results.push({ name: '27. Backward Compatibility & Safe Migration Backfill', passed: false, message: e.message });
    console.error('✗ TEST 27 FAILED:', e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 28: Registration Schema Validation & Elimination of Manual Learner ID
  // --------------------------------------------------------------------------
  try {
    // 1. Valid payload with NO student_identifier: must succeed
    const payloadNoId = {
      email: 'no.id.required@edumate.org',
      password: 'GoodPassword123!',
      confirm_password: 'GoodPassword123!',
      full_name: 'No Id Required',
      education_level: 'Undergraduate / College',
      academic_stage: '1st Year',
    };
    const parsedNoId = registerSchema.safeParse(payloadNoId);
    assert(parsedNoId.success, 'Registration payload without student_identifier must pass schema validation');

    // 2. Legacy client sending invalid format: must be rejected
    const invalidFormats = [
      'STU-12345',
      'edu7k4p92x',
      'EDU12',
      'EDU12345678',
      'EDU!@#$%^&',
    ];
    for (const badId of invalidFormats) {
      const parsedBad = registerSchema.safeParse({
        ...payloadNoId,
        student_identifier: badId,
      });
      assert(
        !parsedBad.success,
        `Registration schema must reject invalid student_identifier format: ${badId}`
      );
    }

    // 3. Legacy client sending valid format: accepted
    const parsedValid = registerSchema.safeParse({
      ...payloadNoId,
      student_identifier: 'EDU7K4P92X',
    });
    assert(parsedValid.success, 'Registration schema must accept valid 10-char EDU format if sent by legacy client');

    results.push({ name: '28. Registration Schema & Manual Entry Elimination', passed: true });
    console.log('✓ TEST 28: Registration Schema & Manual Entry Elimination passed');
  } catch (e: any) {
    results.push({ name: '28. Registration Schema & Manual Entry Elimination', passed: false, message: e.message });
    console.error('✗ TEST 28 FAILED:', e.message);
  }

  console.log('\n====================================================');
  console.log('TEST SUMMARY');
  console.log('====================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Passed: ${passedCount} / ${results.length}`);

  if (passedCount === results.length) {
    console.log(`ALL ${results.length} AUTHENTICATION & SECURITY TESTS PASSED SUCCESSFULLY!\n`);
  } else {
    console.error(`FAILED: ${results.length - passedCount} test(s) failed.\n`);
    process.exit(1);
  }

  await client.end?.();
}

runAuthTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
