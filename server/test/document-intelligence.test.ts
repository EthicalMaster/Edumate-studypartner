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
import { MaterialRepository } from '../repositories/material.repository.js';
import { DocumentRepository } from '../repositories/document.repository.js';
import { DocumentExtractor, DocumentExtractionError } from '../services/document-intelligence/extractor.js';
import { StructureAnalyzer } from '../services/document-intelligence/structure-analyzer.js';
import { Chunker } from '../services/document-intelligence/chunker.js';
import { DocumentProcessingService } from '../services/document-intelligence/processing.service.js';
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
  console.log(`[Phase 6 Test ${num}] ${symbol} ${name}${details ? ` - ${details}` : ''}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runDocumentIntelligenceTests() {
  console.log('====================================================');
  console.log('AVEN PHASE 6: DOCUMENT INTELLIGENCE FOUNDATION');
  console.log('====================================================\n');

  const migrations = [
    '001_initial_schema.sql',
    '002_authentication_sessions.sql',
    '003_auth_compatibility.sql',
    '004_education_profile.sql',
    '005_learner_id_system.sql',
    '006_quiz_engine.sql',
    '007_study_materials_phase5.sql',
    '008_document_intelligence.sql',
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
      console.log('[Test Harness] Live DB not available. Using in-memory pg-mem.');
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
    console.log('[Test Harness] Applied migrations 001 through 008 to pg-mem successfully.');
  } else {
    setPoolForTesting(new pg.Pool({ connectionString: process.env.DATABASE_URL }));
  }

  // Setup test sandbox storage
  const testStorageDir = path.join(process.cwd(), 'uploads', 'test_doc_intel_' + Date.now());
  const storage = new LocalStorageService(testStorageDir);
  const materialRepo = new MaterialRepository();
  const documentRepo = new DocumentRepository();
  const extractor = new DocumentExtractor();
  const analyzer = new StructureAnalyzer();
  const chunker = new Chunker();

  // Seed two distinct students
  const u1 = await client.query(
    `INSERT INTO users (email, password_hash, role) VALUES ('docA@test.edu', 'hashA', 'STUDENT') RETURNING id;`
  );
  const userAId = u1.rows[0].id;
  const p1 = await client.query(
    `INSERT INTO student_profiles (user_id, full_name, student_identifier) VALUES ($1, 'Doc Student A', 'DOC001') RETURNING id;`,
    [userAId]
  );
  const studentA = p1.rows[0].id;

  const u2 = await client.query(
    `INSERT INTO users (email, password_hash, role) VALUES ('docB@test.edu', 'hashB', 'STUDENT') RETURNING id;`
  );
  const userBId = u2.rows[0].id;
  const p2 = await client.query(
    `INSERT INTO student_profiles (user_id, full_name, student_identifier) VALUES ($1, 'Doc Student B', 'DOC002') RETURNING id;`,
    [userBId]
  );
  const studentB = p2.rows[0].id;

  let testCount = 1;

  // --------------------------------------------------------------------------
  // TEST 1: Plain Text File Extraction & Normalization
  // --------------------------------------------------------------------------
  try {
    const rawText = "Chapter 1: Mechanics\r\n\r\nNewton's laws of motion are fundamental.\fChapter 2: Thermodynamics\r\nEnergy is conserved.";
    const buffer = Buffer.from(rawText, 'utf-8');
    const pages = await extractor.extract(buffer, 'physics.txt', 'text/plain');

    assert(pages.length >= 1, 'Expected at least 1 page');
    assert(pages[0].pageNumber === 1, 'Page number should start at 1');
    assert(pages[0].characterCount > 0, 'Character count should be positive');
    assert(!pages[0].text.includes('\r\n'), 'Carriage returns must be normalized to \\n');
    assert(!pages[0].text.includes('\f'), 'Form feed characters should be cleaned or split');
    record(testCount++, 'Plain text extraction & text normalization', true);
  } catch (err: any) {
    record(testCount++, 'Plain text extraction & text normalization', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Markdown File Extraction & Structure Detection
  // --------------------------------------------------------------------------
  try {
    const mdContent = `# Chapter 1: Differential Calculus\n\nCalculus studies rates of change.\n\n## 1.1 Limits and Continuity\n\nA limit defines behavior near a point.\n\n### 1.1.1 Epsilon-Delta Definition\n\nFormal definition of limits.\n\n# Chapter 2: Integral Calculus\n\nIntegration sums infinitesimal parts.`;
    const buffer = Buffer.from(mdContent, 'utf-8');
    const pages = await extractor.extract(buffer, 'calculus.md', 'text/markdown');
    const sections = analyzer.analyze(pages, true);

    assert(sections.length === 4, `Expected 4 sections, got ${sections.length}`);
    assert(sections[0].sectionType === 'chapter', 'Section 0 should be a chapter');
    assert(sections[0].title.includes('Differential Calculus'), 'Title should match markdown H1');
    assert(sections[1].sectionType === 'section', 'Section 1 should be a section');
    assert(sections[1].headingLevel === 2, 'Section 1 headingLevel should be 2');
    assert(sections[2].sectionType === 'subsection', 'Section 2 should be a subsection');
    assert(sections[3].sectionType === 'chapter', 'Section 3 should be a chapter');
    record(testCount++, 'Markdown extraction & hierarchical heading detection', true);
  } catch (err: any) {
    record(testCount++, 'Markdown extraction & hierarchical heading detection', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Deterministic Chunking Logic (Page boundaries, token estimates, section linkage)
  // --------------------------------------------------------------------------
  try {
    const mdContent = `# Chapter 1: Vectors\n\n` +
      `Vectors have magnitude and direction. `.repeat(15) + `\n\n` +
      `Vector addition follows the parallelogram law. `.repeat(20) + `\n\n` +
      `## 1.1 Dot Product\n\n` +
      `The dot product represents projection. `.repeat(25);

    const buffer = Buffer.from(mdContent, 'utf-8');
    const pages = await extractor.extract(buffer, 'vectors.md', 'text/markdown');
    const sections = analyzer.analyze(pages, true);
    const chunks = chunker.chunk(pages, sections);

    assert(chunks.length >= 2, `Expected multiple chunks for long content, got ${chunks.length}`);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      assert(c.chunkIndex === i, `Chunk index must be strictly sequential (expected ${i}, got ${c.chunkIndex})`);
      assert(c.characterCount === c.text.length, 'characterCount must match text length');
      assert(c.tokenEstimate > 0, 'tokenEstimate must be positive');
      assert(c.pageStart >= 1 && c.pageEnd >= c.pageStart, 'Valid page boundary range');
    }
    record(testCount++, 'Deterministic chunking (sequential indices, token estimates, section context)', true);
  } catch (err: any) {
    record(testCount++, 'Deterministic chunking', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Fallback Document Structure (Unstructured content without headings)
  // --------------------------------------------------------------------------
  try {
    const unformattedText = `This is a raw block of text without any obvious headers or numbered points. Just sentences flowing into each other describing biological taxonomy and kingdoms of life without standard chapter marks.`;
    const buffer = Buffer.from(unformattedText, 'utf-8');
    const pages = await extractor.extract(buffer, 'notes.txt', 'text/plain');
    const sections = analyzer.analyze(pages, false);

    assert(sections.length === 1, 'Should fallback to a single document section');
    assert(sections[0].sectionType === 'document', 'Section type should be document');
    assert(sections[0].title === 'Document Content', 'Fallback title should be Document Content');
    record(testCount++, 'Fallback structure for unformatted text', true);
  } catch (err: any) {
    record(testCount++, 'Fallback structure for unformatted text', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Error Handling - Empty File (Zero bytes)
  // --------------------------------------------------------------------------
  try {
    const emptyBuffer = Buffer.alloc(0);
    let threw = false;
    try {
      await extractor.extract(emptyBuffer, 'empty.txt', 'text/plain');
    } catch (e: any) {
      threw = true;
      assert(e instanceof DocumentExtractionError, 'Expected DocumentExtractionError');
      assert(e.code === 'EMPTY_FILE', `Expected EMPTY_FILE code, got ${e.code}`);
    }
    assert(threw, 'Extractor should throw for zero-byte file');
    record(testCount++, 'Safe error handling for empty file (EMPTY_FILE)', true);
  } catch (err: any) {
    record(testCount++, 'Safe error handling for empty file', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Error Handling - Corrupted / Invalid PDF
  // --------------------------------------------------------------------------
  try {
    const corruptBuffer = Buffer.from('%PDF-1.4\n CORRUPTED JUNK DATA THAT CANNOT BE PARSED BY PDF ENGINE', 'utf-8');
    let threw = false;
    try {
      await extractor.extract(corruptBuffer, 'corrupted.pdf', 'application/pdf');
    } catch (e: any) {
      threw = true;
      assert(e instanceof DocumentExtractionError, 'Expected DocumentExtractionError');
    }
    assert(threw, 'Extractor should catch and reject corrupted PDF');
    record(testCount++, 'Safe error handling for corrupted PDF', true);
  } catch (err: any) {
    record(testCount++, 'Safe error handling for corrupted PDF', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Error Handling - Unsupported File Type
  // --------------------------------------------------------------------------
  try {
    const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'binary');
    let threw = false;
    try {
      await extractor.extract(exeBuffer, 'malicious.exe', 'application/x-msdownload');
    } catch (e: any) {
      threw = true;
      assert(e instanceof DocumentExtractionError, 'Expected DocumentExtractionError');
      assert(e.code === 'UNSUPPORTED_FORMAT', `Expected UNSUPPORTED_FORMAT, got ${e.code}`);
    }
    assert(threw, 'Extractor should reject unsupported file type');
    record(testCount++, 'Safe error handling for unsupported file types (UNSUPPORTED_FORMAT)', true);
  } catch (err: any) {
    record(testCount++, 'Safe error handling for unsupported file types', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Full Pipeline & Atomic Database Persistence
  // --------------------------------------------------------------------------
  let testMaterialId = '';
  try {
    const content = `# Chapter 1: Introduction\n\nWelcome to Computer Architecture.\n\n# Chapter 2: Logic Gates\n\nAND, OR, NOT, XOR gates.`;
    const saved = await storage.save(Buffer.from(content, 'utf-8'), 'arch.md', 'text/markdown');

    const recordCreated = await materialRepo.createMaterial({
      studentId: studentA,
      title: 'Computer Architecture Notes',
      originalFilename: 'arch.md',
      mimeType: 'text/markdown',
      fileSizeBytes: saved.fileSizeBytes,
      storageKey: saved.storageKey,
      subject: 'Computer Science',
      topic: 'Architecture',
      processingStatus: 'uploaded',
      processingError: null,
    });
    testMaterialId = recordCreated.id;

    // Process using DocumentProcessingService with test storage
    const procService = new DocumentProcessingService(storage);
    const result = await procService.processMaterial(testMaterialId, studentA);

    assert(result.totalPages === 1, 'Should have 1 page');
    assert(result.sections.length === 2, 'Should have 2 sections');
    assert(result.totalChunks >= 1, 'Should have at least 1 chunk');

    // Verify DB records
    const pagesInDb = await documentRepo.getPagesByMaterial(testMaterialId, studentA);
    const sectionsInDb = await documentRepo.getSectionsByMaterial(testMaterialId, studentA);
    const chunksInDb = await documentRepo.getChunksByMaterial(testMaterialId, studentA);
    const details = await documentRepo.getProcessingDetails(testMaterialId, studentA);

    assert(pagesInDb.length === 1, 'DB should have 1 page');
    assert(sectionsInDb.length === 2, 'DB should have 2 sections');
    assert(chunksInDb.length >= 1, 'DB should have chunks');
    assert(details?.status === 'ready', `Status should be 'ready', got ${details?.status}`);
    assert(details?.error === null, 'Error should be null');

    record(testCount++, 'Full pipeline execution & atomic PostgreSQL persistence', true);
  } catch (err: any) {
    record(testCount++, 'Full pipeline execution & atomic PostgreSQL persistence', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Strict Student Ownership Enforcement (Anti-IDOR)
  // --------------------------------------------------------------------------
  try {
    // Student B attempts to access Student A's extracted pages, sections, chunks, and details
    const bPages = await documentRepo.getPagesByMaterial(testMaterialId, studentB);
    const bSections = await documentRepo.getSectionsByMaterial(testMaterialId, studentB);
    const bChunks = await documentRepo.getChunksByMaterial(testMaterialId, studentB);
    const bDetails = await documentRepo.getProcessingDetails(testMaterialId, studentB);

    assert(bPages.length === 0, 'Student B should not see Student A pages');
    assert(bSections.length === 0, 'Student B should not see Student A sections');
    assert(bChunks.length === 0, 'Student B should not see Student A chunks');
    assert(bDetails === null, 'Student B should not see Student A processing details');

    // Student B attempts to trigger reprocessing on Student A material
    const procService = new DocumentProcessingService(storage);
    let idorBlocked = false;
    try {
      await procService.processMaterial(testMaterialId, studentB);
    } catch {
      idorBlocked = true;
    }
    assert(idorBlocked, 'Student B must be rejected when attempting to reprocess Student A document');

    record(testCount++, 'Strict student ownership enforcement across pages, sections, chunks & reprocessing', true);
  } catch (err: any) {
    record(testCount++, 'Strict student ownership enforcement', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Idempotent Reprocessing (Safe Replacement of Child Records)
  // --------------------------------------------------------------------------
  try {
    const procService = new DocumentProcessingService(storage);
    // Reprocess material twice
    await procService.processMaterial(testMaterialId, studentA);
    const detailsAfterFirst = await documentRepo.getProcessingDetails(testMaterialId, studentA);

    await procService.processMaterial(testMaterialId, studentA);
    const detailsAfterSecond = await documentRepo.getProcessingDetails(testMaterialId, studentA);

    // Counts should remain identical without duplicating child records!
    assert(detailsAfterFirst?.pageCount === detailsAfterSecond?.pageCount, `Page counts should match after reprocessing: ${detailsAfterFirst?.pageCount} vs ${detailsAfterSecond?.pageCount}`);
    assert(detailsAfterFirst?.sectionCount === detailsAfterSecond?.sectionCount, 'Section counts should match');
    assert(detailsAfterFirst?.chunkCount === detailsAfterSecond?.chunkCount, 'Chunk counts should match');

    record(testCount++, 'Idempotent document reprocessing (no duplicate child records)', true);
  } catch (err: any) {
    record(testCount++, 'Idempotent document reprocessing', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 11: Failure State & Sanitized Error Storage
  // --------------------------------------------------------------------------
  try {
    // Create a material pointing to a missing storage key
    const missingStorageKey = 'uploads/non_existent_key_9999.pdf';
    const brokenMaterial = await materialRepo.createMaterial({
      studentId: studentA,
      title: 'Broken Document Test',
      originalFilename: 'broken.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 100,
      storageKey: missingStorageKey,
      subject: 'Testing',
      topic: 'Error Handling',
      processingStatus: 'uploaded',
      processingError: null,
    });

    const procService = new DocumentProcessingService(storage);
    let processFailed = false;
    try {
      await procService.processMaterial(brokenMaterial.id, studentA);
    } catch {
      processFailed = true;
    }
    assert(processFailed, 'Processing should fail for missing file');

    const updated = await materialRepo.getMaterialById(brokenMaterial.id, studentA);
    assert(updated?.processing_status === 'failed', 'Status should be marked failed');
    assert(Boolean(updated?.processing_error), 'Error should be recorded');
    assert(!updated?.processing_error?.includes('/uploads/'), 'Internal storage path should be sanitized from error message');

    record(testCount++, 'Processing failure handling & sanitized error message storage', true);
  } catch (err: any) {
    record(testCount++, 'Processing failure handling & sanitized error message storage', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 12: Migration 008 Up & Down Rollback Verification
  // --------------------------------------------------------------------------
  try {
    const downSqlPath = path.join(__dirname, '..', 'db', 'migrations', '008_document_intelligence_down.sql');
    const downSql = fs.readFileSync(downSqlPath, 'utf-8');
    await client.query(downSql);

    // Verify tables are dropped
    const checkRes = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('document_pages', 'document_sections', 'document_chunks');
    `);
    assert(checkRes.rows.length === 0, 'Tables should be dropped after down migration');

    if (!isLive) {
      await client.query('DROP INDEX IF EXISTS document_pages_pkey;');
      await client.query('DROP INDEX IF EXISTS document_sections_pkey;');
      await client.query('DROP INDEX IF EXISTS document_chunks_pkey;');
      await client.query('DROP INDEX IF EXISTS idx_document_pages_material;');
      await client.query('DROP INDEX IF EXISTS idx_document_sections_material;');
      await client.query('DROP INDEX IF EXISTS idx_document_chunks_material;');
      await client.query('DROP INDEX IF EXISTS idx_document_chunks_section;');
    }

    // Reapply migration 008 to leave DB in clean state
    const upSqlPath = path.join(__dirname, '..', 'db', 'migrations', '008_document_intelligence.sql');
    const upSql = fs.readFileSync(upSqlPath, 'utf-8');
    if (!isLive) {
      const strippedUpSql = upSql
        .replace(/CONSTRAINT\s+uq_[^\s]+\s+UNIQUE\s*\([^)]+\),?/gi, '');
      await client.query(strippedUpSql);
    } else {
      await client.query(upSql);
    }

    const recheckRes = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('document_pages', 'document_sections', 'document_chunks');
    `);
    assert(recheckRes.rows.length === 3, 'Tables should be recreated after up migration');

    record(testCount++, 'Migration 008 up and down rollback cleanly verified', true);
  } catch (err: any) {
    record(testCount++, 'Migration 008 rollback verification', false, err.message);
  }

  // Cleanup test storage
  if (fs.existsSync(testStorageDir)) {
    fs.rmSync(testStorageDir, { recursive: true, force: true });
  }

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  console.log('\n----------------------------------------------------');
  console.log(`PHASE 6 DOCUMENT INTELLIGENCE RESULTS: ${passedCount}/${results.length} PASSED`);
  console.log('----------------------------------------------------\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runDocumentIntelligenceTests().catch((err) => {
  console.error('Fatal error in document intelligence test runner:', err);
  process.exit(1);
});
