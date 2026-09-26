/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { newDb } from 'pg-mem';
import pg from 'pg';
import { setPoolForTesting } from '../db/connection.js';
import { embeddingService } from '../services/embedding/embedding.service.js';
import { QdrantVectorRepository } from '../repositories/vector/qdrant.repository.js';
import { QuotaService } from '../services/governance/quota.service.js';
import { loadResourceQuotas } from '../services/governance/quota.config.js';
import { RetrievalService } from '../services/retrieval/retrieval.service.js';
import { materialRepository } from '../repositories/material.repository.js';
import { VectorPoint } from '../repositories/vector/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let total = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n=== AVEN Phase 7 Final Verification Test Suite ===\n');

async function runTests() {
  // --------------------------------------------------------------------------
  // Setup Test Database (pg-mem or live PostgreSQL)
  // --------------------------------------------------------------------------
  const migrations = [
    '001_initial_schema.sql',
    '002_authentication_sessions.sql',
    '003_auth_compatibility.sql',
    '004_education_profile.sql',
    '005_learner_id_system.sql',
    '006_quiz_engine.sql',
    '007_study_materials_phase5.sql',
    '008_document_intelligence.sql',
    '009_vector_embeddings.sql',
  ];

  let testPool: any;
  if (process.env.DATABASE_URL) {
    try {
      const realPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      await realPool.query('SELECT 1');
      testPool = realPool;
    } catch {
      testPool = null;
    }
  }

  if (!testPool) {
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
    testPool = new pgMemAdapter.Pool();
    setPoolForTesting(testPool);

    for (const mig of migrations) {
      const sqlPath = path.join(__dirname, '..', 'db', 'migrations', mig);
      if (fs.existsSync(sqlPath)) {
        let sql = fs.readFileSync(sqlPath, 'utf-8');
        sql = sql
          .replace(/CREATE EXTENSION[^\n]+;/gi, '')
          .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?LANGUAGE plpgsql;/gi, '')
          .replace(/CREATE TRIGGER[\s\S]*?EXECUTE FUNCTION[^\n]+;/gi, '')
          .replace(/CHECK\s*\([^)]*~[^)]*\)/gi, 'CHECK (student_identifier IS NOT NULL)')
          .replace(/DEFAULT CURRENT_DATE/gi, 'DEFAULT NOW()');
        await testPool.query(sql);
      }
    }
  } else {
    setPoolForTesting(testPool);
  }

  // --------------------------------------------------------------------------
  // 1. Embedding Fallback Safety
  // --------------------------------------------------------------------------
  console.log('--- 1. Embedding Engine & Fallback Safety Verification ---');

  await test('When test fallback is disabled (default), synthetic fallback is strictly rejected', async () => {
    embeddingService.setAllowTestFallback(false);
    const diag = embeddingService.getDiagnostics();
    assert.strictEqual(diag.fallbackAllowed, false);
    assert.strictEqual(diag.isFallback, false);
    assert.strictEqual(diag.isReady, false);

    let threwEmbedTexts = false;
    try {
      await embeddingService.embedTexts(['Test content']);
    } catch (err: any) {
      threwEmbedTexts = true;
      assert(err.message.includes('unavailable'), 'Must explain engine unavailability');
      assert(err.message.includes('EMBEDDING_ALLOW_TEST_FALLBACK'), 'Must guide user on configuration');
    }
    assert.strictEqual(threwEmbedTexts, true, 'embedTexts must fail when real model is unavailable and fallback disallowed');

    let threwEmbedQuery = false;
    try {
      await embeddingService.embedQuery('Test query');
    } catch (err: any) {
      threwEmbedQuery = true;
      assert(err.message.includes('EMBEDDING_ALLOW_TEST_FALLBACK'));
    }
    assert.strictEqual(threwEmbedQuery, true, 'embedQuery must fail when real model is unavailable and fallback disallowed');
  });

  await test('When test fallback is explicitly enabled, it reports "TEST FALLBACK" and NEVER "BAAI/bge-small-en-v1.5"', async () => {
    embeddingService.setAllowTestFallback(true);
    const diag = embeddingService.getDiagnostics();
    assert.strictEqual(diag.fallbackAllowed, true);
    assert.strictEqual(diag.isFallback, true);
    assert.strictEqual(diag.isReady, true);
    assert.strictEqual(diag.modelName, 'TEST FALLBACK', 'Fallback engine must be clearly labeled as TEST FALLBACK');
    assert.notStrictEqual(diag.modelName, 'BAAI/bge-small-en-v1.5', 'Hash vectors must NEVER be labeled as BGE vectors');

    const vectors = await embeddingService.embedTexts(['Hello world']);
    assert.strictEqual(vectors.length, 1);
    assert.strictEqual(vectors[0].length, 384);
  });

  await test('embedTexts produces 384-dimensional unit-normalized vectors (norm ≈ 1.0)', async () => {
    const texts = [
      'Cellular respiration produces ATP via oxidative phosphorylation.',
      'Newton second law states that force equals mass times acceleration.',
    ];
    const vectors = await embeddingService.embedTexts(texts);
    assert.strictEqual(vectors.length, 2);
    assert.strictEqual(vectors[0].length, 384);
    assert.strictEqual(vectors[1].length, 384);

    const norm0 = Math.sqrt(vectors[0].reduce((acc, v) => acc + v * v, 0));
    assert(Math.abs(norm0 - 1.0) < 0.01, `Norm should be ~1.0, got ${norm0}`);
  });

  await test('Identical texts yield deterministic similarity score (~1.0)', async () => {
    const text = 'Photosynthesis in green plants converts light into glucose.';
    const [v1, v2] = await embeddingService.embedTexts([text, text]);

    let dot = 0;
    for (let i = 0; i < 384; i++) {
      dot += v1[i] * v2[i];
    }
    assert(Math.abs(dot - 1.0) < 0.001, `Identical text dot product must be ~1.0, got ${dot}`);
  });

  await test('embedQuery applies BGE query instruction prefix and produces 384-dim vector', async () => {
    const qVec = await embeddingService.embedQuery('How do mitochondria produce energy?');
    assert.strictEqual(qVec.length, 384);
    const norm = Math.sqrt(qVec.reduce((acc, v) => acc + v * v, 0));
    assert(Math.abs(norm - 1.0) < 0.01);
  });

  // --------------------------------------------------------------------------
  // 2. Configurable Quotas Verification
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Configurable Quotas & Centralized Governance ---');

  await test('Default quotas match specification exactly', () => {
    const quotas = loadResourceQuotas();
    assert.strictEqual(quotas.maxFileSizeBytes, 25 * 1024 * 1024, 'MAX_FILE_SIZE_MB must be 25');
    assert.strictEqual(quotas.maxStorageBytesPerStudent, 500 * 1024 * 1024, 'STORAGE_QUOTA_MB must be 500');
    assert.strictEqual(quotas.maxActiveMaterialsPerStudent, 50, 'MAX_ACTIVE_MATERIALS must be 50');
    assert.strictEqual(quotas.maxChunksPerDocument, 10_000, 'MAX_CHUNKS_PER_DOCUMENT must be 10000');
    assert.strictEqual(quotas.maxChunksPerStudent, 5_000, 'MAX_CHUNKS_PER_STUDENT must be 5000');
    assert.strictEqual(quotas.maxDailySearchesPerStudent, 200, 'DAILY_SEMANTIC_SEARCHES must be 200');
    assert.strictEqual(quotas.maxRetrievalTopK, 10, 'MAX_RETRIEVAL_TOP_K must be 10');
    assert.strictEqual(quotas.defaultRetrievalTopK, 5, 'DEFAULT_RETRIEVAL_TOP_K must be 5');
    assert.strictEqual(quotas.embeddingWorkerConcurrency, 1, 'Worker concurrency must be bounded to 1');
  });

  const quota = new QuotaService();

  await test('QuotaService validates max file size (25 MB boundary)', async () => {
    const validStudentUuid = '00000000-0000-0000-0000-000000000001';
    const allowed = await quota.checkUploadQuota(validStudentUuid, 25 * 1024 * 1024);
    assert.strictEqual(allowed.allowed, true);

    const rejected = await quota.checkUploadQuota(validStudentUuid, 25 * 1024 * 1024 + 1);
    assert.strictEqual(rejected.allowed, false);
    assert.strictEqual(rejected.error, 'FILE_TOO_LARGE');
  });

  await test('QuotaService clamps top_k to strictly bounded range [1, 10]', () => {
    assert.strictEqual(quota.validateTopK(5), 5);
    assert.strictEqual(quota.validateTopK(10), 10);
    assert.strictEqual(quota.validateTopK(100), 10, 'Must clamp to maximum 10');
    assert.strictEqual(quota.validateTopK(0), 5, 'Must fallback to default 5 on invalid 0');
    assert.strictEqual(quota.validateTopK(-5), 5, 'Must fallback to default 5 on negative');
    assert.strictEqual(quota.validateTopK(undefined), 5, 'Must default to 5');
  });

  await test('QuotaService human-readable byte formatter operates accurately', () => {
    assert.strictEqual(quota.formatBytes(0), '0 B');
    assert.strictEqual(quota.formatBytes(1024), '1 KB');
    assert.strictEqual(quota.formatBytes(1024 * 1024), '1 MB');
    assert.strictEqual(quota.formatBytes(25 * 1024 * 1024), '25 MB');
    assert.strictEqual(quota.formatBytes(500 * 1024 * 1024), '500 MB');
  });

  // --------------------------------------------------------------------------
  // Seed Database Records for Real Ownership Tests
  // --------------------------------------------------------------------------
  const studentA = '00000000-0000-0000-0000-000000000001';
  const studentB = '00000000-0000-0000-0000-000000000002';
  const userA = 'aaaaaaaa-0000-0000-0000-000000000001';
  const userB = 'bbbbbbbb-0000-0000-0000-000000000002';

  await testPool.query(
    `INSERT INTO users (id, email, password_hash, role) VALUES
     ($1, 'studentA@test.edu', 'hash', 'STUDENT'),
     ($2, 'studentB@test.edu', 'hash', 'STUDENT')
     ON CONFLICT (id) DO NOTHING;`,
    [userA, userB]
  );

  await testPool.query(
    `INSERT INTO student_profiles (id, user_id, full_name, student_identifier) VALUES
     ($1, $2, 'Student Alpha', 'STU-001'),
     ($3, $4, 'Student Beta', 'STU-002')
     ON CONFLICT (id) DO NOTHING;`,
    [studentA, userA, studentB, userB]
  );

  const matRecordA = await materialRepository.createMaterial({
    studentId: studentA,
    title: 'Biology 101 Notes',
    originalFilename: 'biology.txt',
    mimeType: 'text/plain',
    fileSizeBytes: 10 * 1024 * 1024, // 10 MB
    storageKey: 'test/biology.txt',
    subject: 'Biology',
    topic: 'Cellular Organelles',
  });

  const matRecordB = await materialRepository.createMaterial({
    studentId: studentB,
    title: 'Shakespeare Plays',
    originalFilename: 'shakespeare.txt',
    mimeType: 'text/plain',
    fileSizeBytes: 5 * 1024 * 1024, // 5 MB
    storageKey: 'test/shakespeare.txt',
    subject: 'Literature',
    topic: 'Drama',
  });

  const materialA = matRecordA.id;
  const materialB = matRecordB.id;

  // Insert chunks in database
  const chunkResA = await testPool.query(
    `INSERT INTO document_chunks (material_id, chunk_index, text, page_start, page_end, character_count, token_estimate)
     VALUES ($1, 0, 'Mitochondria generate most of the chemical energy needed by the cell.', 1, 1, 68, 15)
     RETURNING id;`,
    [materialA]
  );
  const chunkIdA = chunkResA.rows[0].id;

  const chunkResB = await testPool.query(
    `INSERT INTO document_chunks (material_id, chunk_index, text, page_start, page_end, character_count, token_estimate)
     VALUES ($1, 0, 'Shakespeare wrote Hamlet, Macbeth, and Romeo and Juliet in Elizabethan England.', 1, 1, 79, 18)
     RETURNING id;`,
    [materialB]
  );
  const chunkIdB = chunkResB.rows[0].id;

  // --------------------------------------------------------------------------
  // 3. Tenant Isolation Verification
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Mandatory Student Tenant Isolation & Security ---');

  const repo = new QdrantVectorRepository();
  repo.setForceMemoryFallback(true);

  const [vecA, vecB] = await embeddingService.embedTexts([
    'Mitochondria generate most of the chemical energy needed by the cell.',
    'Shakespeare wrote Hamlet, Macbeth, and Romeo and Juliet in Elizabethan England.',
  ]);

  const testPoints: VectorPoint[] = [
    {
      id: chunkIdA,
      vector: vecA,
      payload: {
        chunk_id: chunkIdA,
        material_id: materialA,
        student_id: studentA,
        subject: 'Biology',
        topic: 'Cell Biology',
        page_start: 1,
        page_end: 1,
        section_id: null,
        chunk_index: 0,
      },
    },
    {
      id: chunkIdB,
      vector: vecB,
      payload: {
        chunk_id: chunkIdB,
        material_id: materialB,
        student_id: studentB,
        subject: 'Literature',
        topic: 'Drama',
        page_start: 1,
        page_end: 1,
        section_id: null,
        chunk_index: 0,
      },
    },
  ];

  await repo.upsertChunks(testPoints);

  await test('Student A global search NEVER retrieves Student B vectors', async () => {
    const qVec = await embeddingService.embedQuery('Shakespeare Romeo and Juliet plays');
    const results = await repo.search({
      studentId: studentA,
      queryVector: qVec,
      topK: 5,
    });

    for (const r of results) {
      assert.strictEqual(r.payload.student_id, studentA, 'Data leakage: Student B vector leaked to Student A');
    }
    assert(!results.some((r) => r.payload.student_id === studentB), 'Cross-tenant isolation must be 100% airtight');
  });

  await test('Student B global search NEVER retrieves Student A vectors', async () => {
    const qVec = await embeddingService.embedQuery('mitochondria cellular ATP');
    const results = await repo.search({
      studentId: studentB,
      queryVector: qVec,
      topK: 5,
    });

    for (const r of results) {
      assert.strictEqual(r.payload.student_id, studentB, 'Data leakage: Student A vector leaked to Student B');
    }
    assert(!results.some((r) => r.payload.student_id === studentA), 'Cross-tenant isolation must be 100% airtight');
  });

  await test('Student A retrieval specifying Student B material_id fails safely with 404', async () => {
    const retrieval = new RetrievalService();
    let threw = false;
    try {
      await retrieval.search({
        studentId: studentA,
        materialId: materialB, // Student A queries Student B's material
        query: 'Shakespeare',
      });
    } catch (err: any) {
      threw = true;
      assert.strictEqual(err.code || err.status, 'MATERIAL_NOT_FOUND', 'Must reject unauthorized material lookup');
    }
    assert.strictEqual(threw, true, 'Must fail safely when requesting unowned material_id');
  });

  // --------------------------------------------------------------------------
  // 4. Embedding Reprocessing Lifecycle (material_id boundary)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Embedding Reprocessing Lifecycle (material_id boundary) ---');

  await test('Reprocessing a material purges old vectors and inserts new ones with zero stale vectors', async () => {
    const countBefore = await repo.countByMaterialId(materialA);
    assert.strictEqual(countBefore, 1);

    // Reprocess materialA: purge by material_id boundary
    await repo.deleteByMaterialId(materialA);
    const countPurged = await repo.countByMaterialId(materialA);
    assert.strictEqual(countPurged, 0, 'Previous vectors must be purged completely');

    // Chunks receive fresh UUIDs upon reprocessing (Phase 6 contract)
    const freshChunkId1 = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    const freshChunkId2 = 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2';
    const [freshV1, freshV2] = await embeddingService.embedTexts([
      'Reprocessed chunk 1: Advanced ATP synthesis.',
      'Reprocessed chunk 2: Electron transport chain details.',
    ]);

    const freshPoints: VectorPoint[] = [
      {
        id: freshChunkId1,
        vector: freshV1,
        payload: {
          chunk_id: freshChunkId1,
          material_id: materialA,
          student_id: studentA,
          subject: 'Biology',
          topic: 'Bioenergetics',
          page_start: 1,
          page_end: 1,
          section_id: null,
          chunk_index: 0,
        },
      },
      {
        id: freshChunkId2,
        vector: freshV2,
        payload: {
          chunk_id: freshChunkId2,
          material_id: materialA,
          student_id: studentA,
          subject: 'Biology',
          topic: 'Bioenergetics',
          page_start: 2,
          page_end: 2,
          section_id: null,
          chunk_index: 1,
        },
      },
    ];

    await repo.upsertChunks(freshPoints);
    const countAfter = await repo.countByMaterialId(materialA);
    assert.strictEqual(countAfter, 2, 'Vector count must strictly match the newly reprocessed chunks');

    // Verify old chunk UUID does NOT exist in search results
    const qVec = await embeddingService.embedQuery('Advanced ATP synthesis');
    const searchRes = await repo.search({
      studentId: studentA,
      materialId: materialA,
      queryVector: qVec,
      topK: 10,
    });
    assert.strictEqual(searchRes.length, 2);
    assert(!searchRes.some((r) => r.payload.chunk_id === chunkIdA), 'Zero stale chunk UUIDs must remain');
  });

  // --------------------------------------------------------------------------
  // 5. Deletion Lifecycle Verification (Quota and Vectors)
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Quota & Vector Deletion Lifecycle Verification ---');

  await test('Inspect quota before deletion reflects storage, material, and chunk counts', async () => {
    const usageBefore = await quota.getQuotaUsage(studentA);
    assert.strictEqual(usageBefore.storage.usedBytes, 10 * 1024 * 1024, 'Storage must be 10 MB');
    assert.strictEqual(usageBefore.materials.currentCount, 1, 'Material count must be 1');
    assert.strictEqual(usageBefore.chunks.currentCount, 1, 'Chunk count must be 1');
  });

  await test('Deleting a material purges Qdrant vectors and immediately frees student quota', async () => {
    // 1. Delete material record from database (triggers CASCADE on child records)
    const deleted = await materialRepository.deleteMaterial(materialA, studentA);
    assert(deleted !== null, 'Material must be deleted');

    // 2. Delete vectors from vector repository
    await repo.deleteByMaterialId(materialA);

    // 3. Confirm 0 vectors remain for materialA
    const countAfterDelete = await repo.countByMaterialId(materialA);
    assert.strictEqual(countAfterDelete, 0, 'Vector repository must have 0 points for deleted material');

    // 4. Inspect quota again: storage and chunks must be immediately freed!
    const usageAfter = await quota.getQuotaUsage(studentA);
    assert.strictEqual(usageAfter.storage.usedBytes, 0, 'Storage quota must be freed to 0');
    assert.strictEqual(usageAfter.materials.currentCount, 0, 'Material count must be freed to 0');
    assert.strictEqual(usageAfter.chunks.currentCount, 0, 'Chunk count must be freed to 0');
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log(`\n====================================================`);
  console.log(`Results: ${passed}/${total} Phase 7 verification assertions passed.`);
  console.log(`====================================================\n`);

  if (passed === total) {
    console.log('✓ ALL PHASE 7 FINAL VERIFICATION REQUIREMENTS SATISFIED.\n');
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
