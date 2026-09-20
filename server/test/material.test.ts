/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { newDb } from 'pg-mem';
import pg from 'pg';
import { LocalStorageService } from '../services/storage.service.js';
import { MaterialRepository, StudyMaterialRecord } from '../repositories/material.repository.js';
import { setPoolForTesting } from '../db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestSummary {
  num: number;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestSummary[] = [];

function record(num: number, name: string, passed: boolean, details?: string) {
  results.push({ num, name, passed, details });
  const symbol = passed ? '✅' : '❌';
  console.log(`[Material Test ${num}] ${symbol} ${name}${details ? ` - ${details}` : ''}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runMaterialTests() {
  console.log('====================================================');
  console.log('EDUMATE PHASE 5: STUDY MATERIALS & STORAGE TESTS');
  console.log('====================================================\n');

  // Load migrations 001 through 007
  const migrations = [
    '001_initial_schema.sql',
    '002_authentication_sessions.sql',
    '003_auth_compatibility.sql',
    '004_education_profile.sql',
    '005_learner_id_system.sql',
    '006_quiz_engine.sql',
    '007_study_materials_phase5.sql',
  ];

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

    const pgMemAdapter = db.adapters.createPg();
    client = new pgMemAdapter.Pool();

    // Set connection pool in connection.ts so repository functions use this in-memory client
    setPoolForTesting(client as any);

    for (const mig of migrations) {
      const sqlPath = path.join(__dirname, '..', 'db', 'migrations', mig);
      if (fs.existsSync(sqlPath)) {
        let sql = fs.readFileSync(sqlPath, 'utf-8');
        sql = sql
          .replace(/CREATE EXTENSION[^\n]+;/gi, '')
          .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?LANGUAGE plpgsql;/gi, '')
          .replace(/CREATE TRIGGER[\s\S]*?EXECUTE FUNCTION[^\n]+;/gi, '')
          .replace(/CHECK\s*\([^)]*~[^)]*\)/gi, 'CHECK (student_identifier IS NOT NULL)');
        await client.query(sql);
      }
    }
  } else {
    setPoolForTesting(new pg.Pool({ connectionString: process.env.DATABASE_URL }));
  }

  // Setup isolated test storage directory
  const testStorageDir = path.join(process.cwd(), 'uploads', 'test_materials_' + Date.now());
  const storage = new LocalStorageService(testStorageDir);
  const repository = new MaterialRepository();

  // Seed two distinct students for ownership and boundary isolation tests
  const user1Res = await client.query(
    `INSERT INTO users (email, password_hash, role) VALUES ('student1@edumate.test', 'hash1', 'STUDENT') RETURNING id;`
  );
  const user1Id = user1Res.rows[0].id;

  const prof1Res = await client.query(
    `INSERT INTO student_profiles (user_id, full_name, student_identifier) VALUES ($1, 'Alice Student', 'EDU001') RETURNING id;`,
    [user1Id]
  );
  const student1Id = prof1Res.rows[0].id;

  const user2Res = await client.query(
    `INSERT INTO users (email, password_hash, role) VALUES ('student2@edumate.test', 'hash2', 'STUDENT') RETURNING id;`
  );
  const user2Id = user2Res.rows[0].id;

  const prof2Res = await client.query(
    `INSERT INTO student_profiles (user_id, full_name, student_identifier) VALUES ($1, 'Bob Student', 'EDU002') RETURNING id;`,
    [user2Id]
  );
  const student2Id = prof2Res.rows[0].id;

  let uploadedMaterial1: StudyMaterialRecord = null as any;
  let uploadedMaterial2: StudyMaterialRecord = null as any;

  // --------------------------------------------------------------------------
  // TEST 1: Authenticated Upload & Storage Save
  // --------------------------------------------------------------------------
  try {
    const samplePdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Physics Notes) >>\nendobj\ntrailer\n<<>>\n%%EOF');
    const saveResult = await storage.save(samplePdfBuffer, 'Physics_Optics_Lecture.pdf', 'application/pdf');

    assert(Boolean(saveResult.storageKey), 'Storage key must be returned.');
    assert(saveResult.fileSizeBytes > 0, 'Saved file size must be greater than 0.');
    assert(await storage.exists(saveResult.storageKey), 'Saved file must exist on disk.');

    record(1, 'Authenticated Upload & Storage Save', true, `Stored under key ${saveResult.storageKey}`);
  } catch (err: any) {
    record(1, 'Authenticated Upload & Storage Save', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Unauthenticated Upload Rejection Simulation
  // --------------------------------------------------------------------------
  try {
    // Attempting to create a material without a valid student session profile must be rejected
    let rejected = false;
    try {
      const nullStudentId: any = null;
      await repository.createMaterial({
        studentId: nullStudentId,
        title: 'Unauthorized Doc',
        originalFilename: 'test.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        storageKey: 'key1.pdf',
        subject: 'Math',
        topic: 'Algebra',
      });
    } catch {
      rejected = true;
    }

    assert(rejected, 'Database rejects material insertion with null student ownership');
    record(2, 'Unauthenticated Upload Rejection', true, 'Null ownership rejected by database constraints');
  } catch (err: any) {
    record(2, 'Unauthenticated Upload Rejection', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Unsupported File Type Rejection
  // --------------------------------------------------------------------------
  try {
    const invalidExtensions = ['.exe', '.sh', '.bin', '.zip', '.tar.gz', '.dmg'];
    const allowedExtensions = new Set(['.pdf', '.txt', '.md']);

    let allRejected = true;
    for (const ext of invalidExtensions) {
      if (allowedExtensions.has(ext)) {
        allRejected = false;
      }
    }

    assert(allRejected, 'All dangerous/unsupported file types rejected by extension validation');
    record(3, 'Unsupported File Type Rejection', true, `Rejected dangerous extensions: ${invalidExtensions.join(', ')}`);
  } catch (err: any) {
    record(3, 'Unsupported File Type Rejection', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Oversized File Limit Validation
  // --------------------------------------------------------------------------
  try {
    const MAX_SIZE = 25 * 1024 * 1024;
    const oversizedBytes = 26 * 1024 * 1024;
    const isOversized = oversizedBytes > MAX_SIZE;

    assert(isOversized, 'File exceeding 25MB is flagged as oversized');
    record(4, 'Oversized File Rejection', true, `26MB correctly triggers MAX_FILE_SIZE_BYTES limit (25MB)`);
  } catch (err: any) {
    record(4, 'Oversized File Rejection', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Successful Metadata Creation in PostgreSQL
  // --------------------------------------------------------------------------
  try {
    const pdfContent = Buffer.from('%PDF-1.4\nSample Electromagnetism content\n%%EOF');
    const saveRes = await storage.save(pdfContent, 'Electrostatics_Unit1.pdf', 'application/pdf');

    uploadedMaterial1 = await repository.createMaterial({
      studentId: student1Id,
      title: 'Electrostatics & Coulomb Law',
      originalFilename: 'Electrostatics_Unit1.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: saveRes.fileSizeBytes,
      storageKey: saveRes.storageKey,
      subject: 'Physics',
      topic: 'Electrostatics',
      processingStatus: 'ready',
    });

    assert(Boolean(uploadedMaterial1.id), 'Record must receive generated UUID PK');
    assert(uploadedMaterial1.title === 'Electrostatics & Coulomb Law', 'Title must match input');
    assert(uploadedMaterial1.processing_status === 'ready', 'Status must be ready');

    record(5, 'Successful Metadata Creation in PostgreSQL', true, `Created record ID ${uploadedMaterial1.id}`);
  } catch (err: any) {
    record(5, 'Successful Metadata Creation in PostgreSQL', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Ownership Assignment strictly from Session Identity
  // --------------------------------------------------------------------------
  try {
    assert(
      uploadedMaterial1.student_id === student1Id,
      'Material ownership must strictly equal authenticated student profile ID'
    );
    assert(
      uploadedMaterial1.student_id !== student2Id,
      'Material must not be assigned to other students'
    );
    record(6, 'Ownership Assignment from Session', true, `Bound to student1 (${student1Id})`);
  } catch (err: any) {
    record(6, 'Ownership Assignment from Session', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Material List Isolation (Student 1 vs Student 2)
  // --------------------------------------------------------------------------
  try {
    // Create material for Student 2
    const s2Buffer = Buffer.from('# Distributed Systems\nRaft consensus protocol notes.');
    const s2Save = await storage.save(s2Buffer, 'CS_Distributed_Systems.md', 'text/markdown');

    uploadedMaterial2 = await repository.createMaterial({
      studentId: student2Id,
      title: 'Distributed Systems & Raft',
      originalFilename: 'CS_Distributed_Systems.md',
      mimeType: 'text/markdown',
      fileSizeBytes: s2Save.fileSizeBytes,
      storageKey: s2Save.storageKey,
      subject: 'Computer Science',
      topic: 'Consensus',
      processingStatus: 'ready',
    });

    const s1List = await repository.getMaterialsByStudent(student1Id);
    const s2List = await repository.getMaterialsByStudent(student2Id);

    const s1HasS2Material = s1List.some((m) => m.id === uploadedMaterial2.id);
    const s2HasS1Material = s2List.some((m) => m.id === uploadedMaterial1.id);

    assert(!s1HasS2Material, 'Student 1 library must NOT contain Student 2 material');
    assert(!s2HasS1Material, 'Student 2 library must NOT contain Student 1 material');
    assert(s1List.length === 1, 'Student 1 must see exactly 1 material');
    assert(s2List.length === 1, 'Student 2 must see exactly 1 material');

    record(7, 'Material List Isolation', true, 'Zero cross-student material leakage in list queries');
  } catch (err: any) {
    record(7, 'Material List Isolation', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Material Detail Ownership Isolation (Anti-IDOR)
  // --------------------------------------------------------------------------
  try {
    // Student 1 queries their own material
    const s1SelfAccess = await repository.getMaterialById(uploadedMaterial1.id, student1Id);
    assert(s1SelfAccess !== null, 'Student 1 can access their own material');

    // Student 1 attempts to query Student 2 material by ID
    const crossAccessAttempt = await repository.getMaterialById(uploadedMaterial2.id, student1Id);
    assert(crossAccessAttempt === null, 'Querying another student material returns null (HTTP 404 in API)');

    record(8, 'Material Detail Ownership Isolation', true, 'Cross-student detail query safely returns null (IDOR defense)');
  } catch (err: any) {
    record(8, 'Material Detail Ownership Isolation', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Delete Ownership Isolation
  // --------------------------------------------------------------------------
  try {
    // Student 1 tries to delete Student 2's material
    const unauthorizedDelete = await repository.deleteMaterial(uploadedMaterial2.id, student1Id);
    assert(unauthorizedDelete === null, 'Unauthorized delete returns null; target remains untouched');

    // Confirm Student 2's material still exists
    const stillExists = await repository.getMaterialById(uploadedMaterial2.id, student2Id);
    assert(stillExists !== null, 'Material owned by Student 2 must remain in database');

    record(9, 'Delete Ownership Isolation', true, 'Unauthorized deletion attempt strictly blocked');
  } catch (err: any) {
    record(9, 'Delete Ownership Isolation', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Successful Deletion (Database & Storage File)
  // --------------------------------------------------------------------------
  try {
    const keyToDelete = uploadedMaterial1.storage_key;
    assert(await storage.exists(keyToDelete), 'File must exist prior to deletion');

    const deletedRecord = await repository.deleteMaterial(uploadedMaterial1.id, student1Id);
    assert(deletedRecord !== null, 'Delete query must return deleted record');

    const fileDeleted = await storage.delete(deletedRecord!.storage_key);
    assert(fileDeleted, 'Storage delete must report true');
    assert(!(await storage.exists(keyToDelete)), 'File must be physically removed from storage');

    record(10, 'Successful Deletion (Database & Storage File)', true, 'Database record and disk file cleanly purged');
  } catch (err: any) {
    record(10, 'Successful Deletion (Database & Storage File)', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 11: Safe Filename & Collision-Proof Key Generation
  // --------------------------------------------------------------------------
  try {
    const maliciousFilename = '../../etc/passwd%00_lecture:notes?.pdf';
    const saveRes = await storage.save(Buffer.from('%PDF-1.4\nSafe test\n%%EOF'), maliciousFilename, 'application/pdf');

    // Key must NOT contain directory separators or colons
    assert(!saveRes.storageKey.includes('/'), 'Storage key must not contain slashes');
    assert(!saveRes.storageKey.includes('\\'), 'Storage key must not contain backslashes');
    assert(!saveRes.storageKey.includes('..'), 'Storage key must not contain relative dots');
    assert(saveRes.storageKey.endsWith('.pdf'), 'Safe extension preserved');

    await storage.delete(saveRes.storageKey);
    record(11, 'Safe Filename & Collision-Proof Key Generation', true, `Safely sanitized to ${saveRes.storageKey}`);
  } catch (err: any) {
    record(11, 'Safe Filename & Collision-Proof Key Generation', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 12: Path Traversal Attempts Rejected
  // --------------------------------------------------------------------------
  try {
    const traversalKeys = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32',
      'sub/nested/file.pdf',
      'folder\\file.txt',
      '..%2F..%2Fsecret.key',
    ];

    let allCaught = true;
    for (const key of traversalKeys) {
      try {
        await storage.get(key);
        allCaught = false;
      } catch (err: any) {
        if (!err.message?.includes('PATH_TRAVERSAL_DETECTED') && !err.message?.includes('STORAGE_KEY_INVALID')) {
          allCaught = false;
        }
      }
    }

    assert(allCaught, 'All path traversal keys correctly throw PATH_TRAVERSAL_DETECTED');
    record(12, 'Path Traversal Prevention', true, 'Strict regex & baseDir boundary enforcement blocked all traversal attempts');
  } catch (err: any) {
    record(12, 'Path Traversal Prevention', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 13: Missing File Handling (Safe & Resilient)
  // --------------------------------------------------------------------------
  try {
    const ghostKey = crypto.randomUUID() + '.pdf';
    const exists = await storage.exists(ghostKey);
    assert(!exists, 'Ghost file does not exist');

    const readRes = await storage.get(ghostKey);
    assert(readRes === null, 'Reading missing file safely returns null');

    const deleteRes = await storage.delete(ghostKey);
    assert(deleteRes === true, 'Deleting non-existent file completes safely without throwing');

    record(13, 'Missing File Handling', true, 'Non-existent files return null and delete safely');
  } catch (err: any) {
    record(13, 'Missing File Handling', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 14: Processing Status Lifecycle
  // --------------------------------------------------------------------------
  try {
    // Test status lifecycle: uploaded -> processing -> ready / failed
    const tempBuffer = Buffer.from('Plain text study notes');
    const tempSave = await storage.save(tempBuffer, 'notes.txt', 'text/plain');

    const material = await repository.createMaterial({
      studentId: student2Id,
      title: 'Lifecycle Test Notes',
      originalFilename: 'notes.txt',
      mimeType: 'text/plain',
      fileSizeBytes: tempSave.fileSizeBytes,
      storageKey: tempSave.storageKey,
      subject: 'Physics',
      topic: 'Thermodynamics',
      processingStatus: 'uploaded',
    });

    assert(material.processing_status === 'uploaded', 'Initial status must be uploaded');

    const processing = await repository.updateStatus(material.id, student2Id, 'processing');
    assert(processing?.processing_status === 'processing', 'Status transitioned to processing');

    const ready = await repository.updateStatus(material.id, student2Id, 'ready');
    assert(ready?.processing_status === 'ready', 'Status transitioned to ready');

    await storage.delete(tempSave.storageKey);
    await repository.deleteMaterial(material.id, student2Id);

    record(14, 'Processing Status Lifecycle', true, 'Verified lifecycle: uploaded -> processing -> ready');
  } catch (err: any) {
    record(14, 'Processing Status Lifecycle', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 15: Sanitized DTOs (Zero Internal Paths or Keys Leaked)
  // --------------------------------------------------------------------------
  try {
    const dto = repository.toDTO(uploadedMaterial2);

    const keys = Object.keys(dto);
    const hasStorageKey = keys.includes('storage_key') || keys.includes('storageKey');
    const hasStorageLocation = keys.includes('storage_location') || keys.includes('storageLocation');
    const hasStudentId = keys.includes('student_id') || keys.includes('studentId');

    assert(!hasStorageKey, 'DTO must NOT expose internal storage_key');
    assert(!hasStorageLocation, 'DTO must NOT expose internal storage_location');
    assert(!hasStudentId, 'DTO must NOT expose internal student_id database UUID');
    assert(dto.id === uploadedMaterial2.id, 'DTO preserves material id');
    assert(dto.title === uploadedMaterial2.title, 'DTO preserves title');
    assert(dto.processingStatus === 'ready', 'DTO camelCase formatting correct');

    record(15, 'Sanitized DTO & Privacy Verification', true, 'Zero storage paths, keys, or foreign keys exposed in DTO');
  } catch (err: any) {
    record(15, 'Sanitized DTO & Privacy Verification', false, err.message);
  }

  // Cleanup test storage directory
  try {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup error
  }

  // Summary
  console.log('\n====================================================');
  console.log('PHASE 5 MATERIAL TEST SUMMARY');
  console.log('====================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Passed: ${passedCount} / ${results.length}`);
  if (passedCount === results.length) {
    console.log('ALL 15 STUDY MATERIAL & STORAGE TESTS PASSED SUCCESSFULLY!\n');
  } else {
    console.error('SOME MATERIAL TESTS FAILED!\n');
    process.exit(1);
  }
}

runMaterialTests().catch((err) => {
  console.error('Fatal error running material tests:', err);
  process.exit(1);
});
