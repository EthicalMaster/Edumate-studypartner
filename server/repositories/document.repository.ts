/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRequiredPool } from '../db/connection.js';
import {
  ExtractedPage,
  ExtractedSection,
  ExtractedChunk,
  DocumentPageRecord,
  DocumentSectionRecord,
  DocumentChunkRecord,
  DocumentProcessingDetails,
} from '../services/document-intelligence/types.js';

export class DocumentRepository {
  /**
   * Atomically persists the complete extracted document structure in a single transaction.
   * If the document was previously processed, cleans up previous extractions safely (idempotent replacement).
   */
  async saveDocumentStructure(
    materialId: string,
    pages: ExtractedPage[],
    sections: ExtractedSection[],
    chunks: ExtractedChunk[]
  ): Promise<void> {
    const pool = getRequiredPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Delete previous extracted child records for this material (safe replacement)
      await client.query('DELETE FROM document_chunks WHERE material_id = $1;', [materialId]);
      await client.query('DELETE FROM document_sections WHERE material_id = $1;', [materialId]);
      await client.query('DELETE FROM document_pages WHERE material_id = $1;', [materialId]);

      // 2. Insert extracted pages
      for (const page of pages) {
        await client.query(
          `INSERT INTO document_pages (material_id, page_number, text, character_count, created_at)
           VALUES ($1, $2, $3, $4, NOW());`,
          [materialId, page.pageNumber, page.text, page.characterCount]
        );
      }

      // 3. Insert sections and map temporary IDs to actual generated database UUIDs
      const tempIdToUuidMap = new Map<string, string>();

      // Insert top-level sections first (parentTempId === null)
      for (const sec of sections.filter((s) => !s.parentTempId)) {
        const secRes = await client.query<{ id: string }>(
          `INSERT INTO document_sections (
             material_id, parent_section_id, section_type, title, section_order, page_start, page_end, heading_level, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           RETURNING id;`,
          [
            materialId,
            null,
            sec.sectionType,
            sec.title,
            sec.sectionOrder,
            sec.pageStart,
            sec.pageEnd,
            sec.headingLevel,
          ]
        );
        tempIdToUuidMap.set(sec.tempId, secRes.rows[0].id);
      }

      // Insert child sections referencing their parent UUIDs
      for (const sec of sections.filter((s) => Boolean(s.parentTempId))) {
        const parentUuid = sec.parentTempId ? tempIdToUuidMap.get(sec.parentTempId) || null : null;
        const secRes = await client.query<{ id: string }>(
          `INSERT INTO document_sections (
             material_id, parent_section_id, section_type, title, section_order, page_start, page_end, heading_level, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           RETURNING id;`,
          [
            materialId,
            parentUuid,
            sec.sectionType,
            sec.title,
            sec.sectionOrder,
            sec.pageStart,
            sec.pageEnd,
            sec.headingLevel,
          ]
        );
        tempIdToUuidMap.set(sec.tempId, secRes.rows[0].id);
      }

      // 4. Insert chunks linking to resolved section UUIDs
      for (const chunk of chunks) {
        const sectionUuid = chunk.sectionTempId ? tempIdToUuidMap.get(chunk.sectionTempId) || null : null;
        await client.query(
          `INSERT INTO document_chunks (
             material_id, section_id, chunk_index, text, page_start, page_end, character_count, token_estimate, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW());`,
          [
            materialId,
            sectionUuid,
            chunk.chunkIndex,
            chunk.text,
            chunk.pageStart,
            chunk.pageEnd,
            chunk.characterCount,
            chunk.tokenEstimate,
          ]
        );
      }

      // 5. Update study_materials record to 'ready' with zero error
      await client.query(
        `UPDATE study_materials
         SET processing_status = 'ready', processing_error = NULL, updated_at = NOW()
         WHERE id = $1;`,
        [materialId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves extracted pages, verifying student ownership strictly.
   */
  async getPagesByMaterial(materialId: string, studentId: string): Promise<DocumentPageRecord[]> {
    const pool = getRequiredPool();
    const query = `
      SELECT p.*
      FROM document_pages p
      JOIN study_materials m ON p.material_id = m.id
      WHERE p.material_id = $1 AND m.student_id = $2
      ORDER BY p.page_number ASC;
    `;
    const res = await pool.query<DocumentPageRecord>(query, [materialId, studentId]);
    return res.rows;
  }

  /**
   * Retrieves detected sections, verifying student ownership strictly.
   */
  async getSectionsByMaterial(materialId: string, studentId: string): Promise<DocumentSectionRecord[]> {
    const pool = getRequiredPool();
    const query = `
      SELECT s.*
      FROM document_sections s
      JOIN study_materials m ON s.material_id = m.id
      WHERE s.material_id = $1 AND m.student_id = $2
      ORDER BY s.section_order ASC;
    `;
    const res = await pool.query<DocumentSectionRecord>(query, [materialId, studentId]);
    return res.rows;
  }

  /**
   * Retrieves extracted document chunks, verifying student ownership strictly.
   */
  async getChunksByMaterial(materialId: string, studentId: string): Promise<DocumentChunkRecord[]> {
    const pool = getRequiredPool();
    const query = `
      SELECT c.*
      FROM document_chunks c
      JOIN study_materials m ON c.material_id = m.id
      WHERE c.material_id = $1 AND m.student_id = $2
      ORDER BY c.chunk_index ASC;
    `;
    const res = await pool.query<DocumentChunkRecord>(query, [materialId, studentId]);
    return res.rows;
  }

  /**
   * Retrieves processing summary details for a material.
   */
  async getProcessingDetails(materialId: string, studentId: string): Promise<DocumentProcessingDetails | null> {
    const pool = getRequiredPool();
    const matQuery = `
      SELECT id, processing_status, processing_error, updated_at
      FROM study_materials
      WHERE id = $1 AND student_id = $2;
    `;
    const matRes = await pool.query(matQuery, [materialId, studentId]);
    if (matRes.rows.length === 0) return null;

    const mat = matRes.rows[0];

    const countsQuery = `
      SELECT
        (SELECT COUNT(*)::int FROM document_pages WHERE material_id = $1) AS page_count,
        (SELECT COUNT(*)::int FROM document_sections WHERE material_id = $1) AS section_count,
        (SELECT COUNT(*)::int FROM document_chunks WHERE material_id = $1) AS chunk_count,
        (SELECT COALESCE(SUM(character_count), 0)::int FROM document_pages WHERE material_id = $1) AS total_characters;
    `;
    const countsRes = await pool.query(countsQuery, [materialId]);
    const counts = countsRes.rows[0] || { page_count: 0, section_count: 0, chunk_count: 0, total_characters: 0 };

    return {
      materialId: mat.id,
      status: mat.processing_status,
      error: mat.processing_error,
      pageCount: parseInt(counts.page_count, 10) || 0,
      sectionCount: parseInt(counts.section_count, 10) || 0,
      chunkCount: parseInt(counts.chunk_count, 10) || 0,
      totalCharacters: parseInt(counts.total_characters, 10) || 0,
      updatedAt: mat.updated_at ? new Date(mat.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Retrieves a single chunk joined with its section hierarchy and parent material metadata,
   * strictly enforcing student ownership.
   */
  async getChunkWithMetadata(chunkId: string, studentId: string) {
    const pool = getRequiredPool();
    const query = `
      SELECT 
        c.id as chunk_id,
        c.material_id,
        c.chunk_index,
        c.text,
        c.page_start,
        c.page_end,
        c.character_count,
        c.token_estimate,
        c.section_id,
        s.title as section_title,
        s.section_type,
        s.heading_level,
        m.title as material_title,
        m.subject,
        m.topic
      FROM document_chunks c
      JOIN study_materials m ON c.material_id = m.id
      LEFT JOIN document_sections s ON c.section_id = s.id
      WHERE c.id = $1 AND m.student_id = $2;
    `;
    const res = await pool.query(query, [chunkId, studentId]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      chunkId: r.chunk_id,
      materialId: r.material_id,
      chunkIndex: r.chunk_index,
      text: r.text,
      pageStart: r.page_start,
      pageEnd: r.page_end,
      characterCount: r.character_count,
      tokenEstimate: r.token_estimate,
      sectionId: r.section_id,
      sectionTitle: r.section_title || null,
      sectionType: r.section_type || null,
      headingLevel: r.heading_level || null,
      materialTitle: r.material_title,
      subject: r.subject,
      topic: r.topic,
    };
  }

  /**
   * Retrieves multiple chunks joined with metadata in a single query,
   * strictly scoped to studentId.
   */
  async getChunksByIdsWithMetadata(chunkIds: string[], studentId: string) {
    if (chunkIds.length === 0) return [];
    const pool = getRequiredPool();
    const query = `
      SELECT 
        c.id as chunk_id,
        c.material_id,
        c.chunk_index,
        c.text,
        c.page_start,
        c.page_end,
        c.character_count,
        c.token_estimate,
        c.section_id,
        s.title as section_title,
        s.section_type,
        s.heading_level,
        m.title as material_title,
        m.subject,
        m.topic
      FROM document_chunks c
      JOIN study_materials m ON c.material_id = m.id
      LEFT JOIN document_sections s ON c.section_id = s.id
      WHERE c.id = ANY($1::uuid[]) AND m.student_id = $2;
    `;
    const res = await pool.query(query, [chunkIds, studentId]);
    return res.rows.map((r) => ({
      chunkId: r.chunk_id,
      materialId: r.material_id,
      chunkIndex: r.chunk_index,
      text: r.text,
      pageStart: r.page_start,
      pageEnd: r.page_end,
      characterCount: r.character_count,
      tokenEstimate: r.token_estimate,
      sectionId: r.section_id,
      sectionTitle: r.section_title || null,
      sectionType: r.section_type || null,
      headingLevel: r.heading_level || null,
      materialTitle: r.material_title,
      subject: r.subject,
      topic: r.topic,
    }));
  }
}

export const documentRepository = new DocumentRepository();
