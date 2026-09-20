/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRequiredPool } from '../db/connection.js';
import { embeddingService } from '../services/embedding/embedding.service.js';

export interface ChunkEmbeddingRecord {
  id: string;
  chunk_id: string;
  material_id: string;
  student_id: string;
  embedding_model: string;
  embedding_dimension: number;
  embedding_version: string;
  embedding_status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialEmbeddingSummary {
  materialId: string;
  embeddingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  embeddingError: string | null;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  model: string;
  dimension: number;
  isFallback: boolean;
}

export class EmbeddingRepository {
  /**
   * Batch upserts chunk embedding status records.
   */
  public async upsertBatch(
    records: Array<{
      chunkId: string;
      materialId: string;
      studentId: string;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      errorMessage?: string;
      model?: string;
    }>
  ): Promise<void> {
    if (records.length === 0) return;
    const pool = getRequiredPool();

    for (const r of records) {
      const modelToUse = r.model || embeddingService.modelName;
      await pool.query(
        `INSERT INTO chunk_embeddings (
           chunk_id, material_id, student_id, embedding_model, embedding_dimension,
           embedding_version, embedding_status, error_message, updated_at
         )
         VALUES ($1, $2, $3, $4, 384, '1.5', $5, $6, NOW())
         ON CONFLICT (chunk_id)
         DO UPDATE SET
           embedding_model = EXCLUDED.embedding_model,
           embedding_status = EXCLUDED.embedding_status,
           error_message = EXCLUDED.error_message,
           updated_at = NOW()`,
        [r.chunkId, r.materialId, r.studentId, modelToUse, r.status, r.errorMessage || null]
      );
    }
  }

  /**
   * Updates embedding status and optional sanitized error on study_materials.
   */
  public async updateMaterialEmbeddingStatus(
    materialId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    errorMessage?: string | null
  ): Promise<void> {
    const pool = getRequiredPool();
    await pool.query(
      `UPDATE study_materials
       SET embedding_status = $1,
           embedding_error = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [status, errorMessage || null, materialId]
    );
  }

  /**
   * Retrieves overall embedding summary for a student's study material.
   */
  public async getMaterialEmbeddingSummary(
    materialId: string,
    studentId: string
  ): Promise<MaterialEmbeddingSummary | null> {
    const pool = getRequiredPool();

    const matRes = await pool.query<{
      id: string;
      embedding_status: 'pending' | 'processing' | 'completed' | 'failed';
      embedding_error: string | null;
    }>(
      `SELECT id, embedding_status, embedding_error
       FROM study_materials
       WHERE id = $1 AND student_id = $2`,
      [materialId, studentId]
    );

    if (matRes.rows.length === 0) return null;
    const mat = matRes.rows[0];

    const statsRes = await pool.query<{
      total_chunks: string;
      completed_chunks: string;
      failed_chunks: string;
      active_model: string | null;
    }>(
      `SELECT
         COUNT(c.id) as total_chunks,
         COUNT(CASE WHEN e.embedding_status = 'completed' THEN 1 END) as completed_chunks,
         COUNT(CASE WHEN e.embedding_status = 'failed' THEN 1 END) as failed_chunks,
         MAX(e.embedding_model) as active_model
       FROM document_chunks c
       LEFT JOIN chunk_embeddings e ON c.id = e.chunk_id
       WHERE c.material_id = $1`,
      [materialId]
    );

    const stats = statsRes.rows[0];
    const reportedModel = stats?.active_model || embeddingService.modelName;
    const isFallback = reportedModel === 'TEST FALLBACK' || (!stats?.active_model && embeddingService.isFallback);

    return {
      materialId: mat.id,
      embeddingStatus: mat.embedding_status || 'pending',
      embeddingError: mat.embedding_error,
      totalChunks: parseInt(stats?.total_chunks || '0', 10),
      completedChunks: parseInt(stats?.completed_chunks || '0', 10),
      failedChunks: parseInt(stats?.failed_chunks || '0', 10),
      model: reportedModel,
      dimension: 384,
      isFallback,
    };
  }

  /**
   * Purges embedding records for a given material.
   */
  public async deleteByMaterialId(materialId: string): Promise<void> {
    const pool = getRequiredPool();
    await pool.query('DELETE FROM chunk_embeddings WHERE material_id = $1', [materialId]);
  }
}

export const embeddingRepository = new EmbeddingRepository();
