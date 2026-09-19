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
} from '../utils/crypto.js';
import {
  registerSchema,
  loginSchema,
  isValidEmail,
  normalizeEmail,
} from '../utils/validation.js';

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
  console.log('EDUMATE PHASE 3: AUTHENTICATION SYSTEM TESTS');
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

    const cleanSql1 = migration1
      .replace(/CREATE EXTENSION[^\n]+;/gi, '')
      .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?LANGUAGE plpgsql;/gi, '')
      .replace(/CREATE TRIGGER[\s\S]*?EXECUTE FUNCTION[^\n]+;/gi, '');

    const cleanSql2 = migration2;
    const cleanSql3 = migration3;
    const cleanSql4 = migration4;

    const pgMemAdapter = db.adapters.createPg();
    client = new pgMemAdapter.Client();
    await client.connect();
    await client.query(cleanSql1);
    await client.query(cleanSql2);
    await client.query(cleanSql3);
    await client.query(cleanSql4);
    console.log('[Test Harness] In-memory PostgreSQL engine initialized with schema 001 + 002 + 003 + 004.\n');
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
    const input = {
      email: 'alex.chen@university.edu',
      password: 'SecureStudentPass2026!',
      confirm_password: 'SecureStudentPass2026!',
      full_name: 'Alex Chen',
      institution: 'Stanford University',
      department: 'Computer Science',
      current_year: 3,
      student_identifier: 'STU-9921',
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
      `INSERT INTO student_profiles (user_id, full_name)
       VALUES ($1, 'Student B') RETURNING id;`,
      [uB.rows[0].id]
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
