/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { quotaService } from '../governance/quota.service.js';
import { embeddingService } from './embedding.service.js';
import { vectorRepository } from '../../repositories/vector/qdrant.repository.js';
import { embeddingRepository } from '../../repositories/embedding.repository.js';
import { documentRepository } from '../../repositories/document.repository.js';
import { materialRepository } from '../../repositories/material.repository.js';
import { VectorPoint } from '../../repositories/vector/types.js';

export interface EmbeddingJobStats {
  queued: number;
  active: number;
  completed: number;
  failed: number;
  maxConcurrency: number;
}

interface QueuedJob {
  materialId: string;
  studentId: string;
  resolve: (value: boolean) => void;
  reject: (err: any) => void;
}

export class EmbeddingQueueService {
  private queue: QueuedJob[] = [];
  private activeWorkers = 0;
  private completedCount = 0;
  private failedCount = 0;

  /**
   * Enqueues a material for embedding generation.
   * Returns a promise that resolves when embedding completes.
   */
  public async enqueue(materialId: string, studentId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        materialId,
        studentId,
        resolve,
        reject,
      });
      this.processNext();
    });
  }

  /**
   * Trigger worker to process next job if under concurrency limit.
   */
  private processNext(): void {
    const maxConcurrency = quotaService.getConfig().embeddingWorkerConcurrency;
    if (this.activeWorkers >= maxConcurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeWorkers++;
    this.executeJob(job.materialId, job.studentId)
      .then((success) => {
        this.completedCount++;
        job.resolve(success);
      })
      .catch((err) => {
        this.failedCount++;
        job.reject(err);
      })
      .finally(() => {
        this.activeWorkers--;
        this.processNext();
      });
  }

  /**
   * Executes embedding extraction, vector upsert, and metadata updates for a single material.
   */
  public async executeJob(materialId: string, studentId: string): Promise<boolean> {
    try {
      // 1. Set material embedding status to 'processing'
      await embeddingRepository.updateMaterialEmbeddingStatus(materialId, 'processing', null);

      // 2. Fetch parent material record
      const material = await materialRepository.getMaterialById(materialId, studentId);
      if (!material) {
        throw new Error('Study material not found or inaccessible.');
      }

      // 3. Stale vector cleanup: Invalidate previous Qdrant vectors and PostgreSQL embedding metadata
      await vectorRepository.deleteByMaterialId(materialId);
      await embeddingRepository.deleteByMaterialId(materialId);

      // 4. Retrieve Phase 6 document chunks
      const chunks = await documentRepository.getChunksByMaterial(materialId, studentId);
      if (chunks.length === 0) {
        // No text chunks present in document (e.g., empty or unparsed)
        await embeddingRepository.updateMaterialEmbeddingStatus(materialId, 'completed', null);
        return true;
      }

      // 5. Initialize chunk metadata records in PostgreSQL as 'processing'
      const initRecords = chunks.map((c) => ({
        chunkId: c.id,
        materialId,
        studentId,
        status: 'processing' as const,
      }));
      await embeddingRepository.upsertBatch(initRecords);

      // Ensure real BGE embedding engine is ready before attempting the first embedding operation
      await embeddingService.waitUntilReady();

      // 6. Process in bounded batches to preserve memory
      const batchSize = quotaService.getConfig().embeddingBatchSize;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const texts = batch.map((c) => c.text);

        // Compute dense embeddings
        const vectors = await embeddingService.embedTexts(texts);

        // Prepare Qdrant vector points
        const points: VectorPoint[] = batch.map((c, idx) => ({
          id: c.id,
          vector: vectors[idx],
          payload: {
            chunk_id: c.id,
            material_id: materialId,
            student_id: studentId,
            subject: material.subject || 'General Studies',
            topic: material.topic || 'General',
            page_start: c.page_start,
            page_end: c.page_end,
            section_id: c.section_id,
            chunk_index: c.chunk_index,
          },
        }));

        // Upsert into vector store
        await vectorRepository.upsertChunks(points);

        // Mark batch completed in PostgreSQL
        const completedRecords = batch.map((c) => ({
          chunkId: c.id,
          materialId,
          studentId,
          status: 'completed' as const,
          model: embeddingService.modelName,
        }));
        await embeddingRepository.upsertBatch(completedRecords);
      }

      // 7. Mark overall material embedding completed
      await embeddingRepository.updateMaterialEmbeddingStatus(materialId, 'completed', null);
      return true;
    } catch (err: any) {
      const sanitized = this.sanitizeErrorMessage(err);
      await embeddingRepository.updateMaterialEmbeddingStatus(materialId, 'failed', sanitized);
      throw new Error(sanitized);
    }
  }

  public getQueueStats(): EmbeddingJobStats {
    return {
      queued: this.queue.length,
      active: this.activeWorkers,
      completed: this.completedCount,
      failed: this.failedCount,
      maxConcurrency: quotaService.getConfig().embeddingWorkerConcurrency,
    };
  }

  private sanitizeErrorMessage(err: any): string {
    const raw = String(err?.message || 'Embedding processing error.');
    const cleaned = raw.replace(/[\r\n\t]+/g, ' ').trim();
    return cleaned.slice(0, 200);
  }
}

export const embeddingQueueService = new EmbeddingQueueService();

