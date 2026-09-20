/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { embeddingService } from '../embedding/embedding.service.js';
import { vectorRepository } from '../../repositories/vector/qdrant.repository.js';
import { documentRepository } from '../../repositories/document.repository.js';
import { materialRepository } from '../../repositories/material.repository.js';
import { quotaService } from '../governance/quota.service.js';

export interface RetrievalQuery {
  studentId: string;
  query: string;
  materialId?: string;
  subject?: string;
  topic?: string;
  topK?: number;
}

export interface RetrievedChunkResult {
  chunkId: string;
  materialId: string;
  score: number;
  text: string;
  materialTitle: string;
  subject: string;
  topic: string;
  pageStart: number;
  pageEnd: number;
  sectionId: string | null;
  sectionTitle: string | null;
  sectionType: string | null;
  headingLevel: number | null;
  chunkIndex: number;
}

export interface RetrievalResponse {
  results: RetrievedChunkResult[];
  totalRetrieved: number;
  query: string;
  topK: number;
  remainingSearchesToday: number;
}

export class RetrievalService {
  /**
   * Executes a semantic search with mandatory student isolation,
   * source traceability, and canonical PostgreSQL text lookup.
   */
  public async search(queryInput: RetrievalQuery): Promise<RetrievalResponse> {
    const { studentId, query, materialId, subject, topic } = queryInput;

    if (!studentId) {
      throw new Error('Mandatory security violation: studentId is required.');
    }

    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
      throw new Error('Search query cannot be empty.');
    }
    if (trimmedQuery.length > 1000) {
      throw new Error('Search query cannot exceed 1000 characters.');
    }

    // 1. Enforce daily retrieval rate-limiting quota
    const quotaRes = await quotaService.checkAndIncrementSearchQuota(studentId);
    if (!quotaRes.allowed) {
      const err: any = new Error(quotaRes.message || 'Daily semantic search quota exceeded.');
      err.code = 'SEARCH_RATE_LIMIT_EXCEEDED';
      err.status = 429;
      err.limit = quotaRes.limit;
      throw err;
    }

    // 2. Validate and clamp top_k (1 to 10)
    const effectiveTopK = quotaService.validateTopK(queryInput.topK);

    // 3. If materialId is provided, enforce student ownership strictly
    if (materialId) {
      const material = await materialRepository.getMaterialById(materialId, studentId);
      if (!material) {
        const err: any = new Error('Study material not found.');
        err.code = 'MATERIAL_NOT_FOUND';
        err.status = 404;
        throw err;
      }
    }

    // 4. Generate query embedding with BGE query instruction prefix
    const queryVector = await embeddingService.embedQuery(trimmedQuery);

    // 5. Search vector repository with mandatory student_id filter
    const vectorHits = await vectorRepository.search({
      studentId,
      queryVector,
      materialId,
      subject,
      topic,
      topK: effectiveTopK,
    });

    if (vectorHits.length === 0) {
      return {
        results: [],
        totalRetrieved: 0,
        query: trimmedQuery,
        topK: effectiveTopK,
        remainingSearchesToday: quotaRes.remaining ?? 100,
      };
    }

    // 6. Resolve canonical chunks and section hierarchy from PostgreSQL
    const chunkIds = vectorHits.map((h) => h.payload.chunk_id);
    const pgChunks = await documentRepository.getChunksByIdsWithMetadata(chunkIds, studentId);
    const pgChunkMap = new Map(pgChunks.map((c) => [c.chunkId, c]));

    const results: RetrievedChunkResult[] = [];
    for (const hit of vectorHits) {
      const canonical = pgChunkMap.get(hit.payload.chunk_id);
      if (!canonical) {
        // Chunk may have been removed or reprocessed; skip stale vector hit safely
        continue;
      }

      results.push({
        chunkId: canonical.chunkId,
        materialId: canonical.materialId,
        score: hit.score,
        text: canonical.text,
        materialTitle: canonical.materialTitle,
        subject: canonical.subject,
        topic: canonical.topic,
        pageStart: canonical.pageStart,
        pageEnd: canonical.pageEnd,
        sectionId: canonical.sectionId,
        sectionTitle: canonical.sectionTitle,
        sectionType: canonical.sectionType,
        headingLevel: canonical.headingLevel,
        chunkIndex: canonical.chunkIndex,
      });
    }

    return {
      results,
      totalRetrieved: results.length,
      query: trimmedQuery,
      topK: effectiveTopK,
      remainingSearchesToday: quotaRes.remaining ?? 100,
    };
  }
}

export const retrievalService = new RetrievalService();
