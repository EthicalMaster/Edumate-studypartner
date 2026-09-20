/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPool } from '../../db/connection.js';
import { DEFAULT_RESOURCE_QUOTAS, ResourceQuotaConfig, loadResourceQuotas } from './quota.config.js';

export interface QuotaCheckResult {
  allowed: boolean;
  error?: string;
  message?: string;
  currentUsage?: number;
  quota?: number;
  requestedSize?: number;
  remainingSpace?: number;
  limit?: number;
  remaining?: number;
}

export interface StudentQuotaUsage {
  storage: {
    usedBytes: number;
    quotaBytes: number;
    usedFormatted: string;
    quotaFormatted: string;
    percentage: number;
  };
  materials: {
    currentCount: number;
    maxCount: number;
  };
  chunks: {
    currentCount: number;
    maxCount: number;
  };
  searches: {
    usedToday: number;
    maxDaily: number;
    remainingToday: number;
  };
}

export class QuotaService {
  private config: ResourceQuotaConfig;

  constructor(customConfig?: Partial<ResourceQuotaConfig>) {
    this.config = { ...DEFAULT_RESOURCE_QUOTAS, ...customConfig };
  }

  public getConfig(): ResourceQuotaConfig {
    return { ...this.config };
  }

  public reloadConfig(): void {
    this.config = loadResourceQuotas();
  }

  public setConfig(newConfig: Partial<ResourceQuotaConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Formats bytes into a human-readable string (e.g. "24.5 MB")
   */
  public formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  /**
   * Retrieves comprehensive real-time quota usage for a student.
   */
  public async getQuotaUsage(studentId: string): Promise<StudentQuotaUsage> {
    const pool = getPool();
    if (!pool) {
      return {
        storage: {
          usedBytes: 0,
          quotaBytes: this.config.maxStorageBytesPerStudent,
          usedFormatted: '0 B',
          quotaFormatted: this.formatBytes(this.config.maxStorageBytesPerStudent),
          percentage: 0,
        },
        materials: { currentCount: 0, maxCount: this.config.maxActiveMaterialsPerStudent },
        chunks: { currentCount: 0, maxCount: this.config.maxChunksPerStudent },
        searches: {
          usedToday: 0,
          maxDaily: this.config.maxDailySearchesPerStudent,
          remainingToday: this.config.maxDailySearchesPerStudent,
        },
      };
    }

    // 1. Storage bytes & active material count
    const matRes = await pool.query<{ total_bytes: string; total_count: string }>(
      `SELECT
         COALESCE(SUM(file_size_bytes), 0) as total_bytes,
         COUNT(id) as total_count
       FROM study_materials
       WHERE student_id = $1`,
      [studentId]
    );

    const usedBytes = parseInt(matRes.rows[0]?.total_bytes || '0', 10);
    const materialCount = parseInt(matRes.rows[0]?.total_count || '0', 10);

    // 2. Chunks count across all student's materials
    const chunkRes = await pool.query<{ chunk_count: string }>(
      `SELECT COUNT(c.id) as chunk_count
       FROM document_chunks c
       JOIN study_materials m ON c.material_id = m.id
       WHERE m.student_id = $1`,
      [studentId]
    );
    const chunkCount = parseInt(chunkRes.rows[0]?.chunk_count || '0', 10);

    // 3. Daily search usage
    let searchesToday = 0;
    try {
      const searchRes = await pool.query<{ search_count: number }>(
        `SELECT search_count
         FROM student_retrieval_quotas
         WHERE student_id = $1 AND search_date = CURRENT_DATE`,
        [studentId]
      );
      searchesToday = searchRes.rows[0]?.search_count || 0;
    } catch {
      // Table may not exist yet in fresh migration environments
      searchesToday = 0;
    }

    const storageQuota = this.config.maxStorageBytesPerStudent;
    const storagePercent = Math.min(100, Math.round((usedBytes / storageQuota) * 100));

    return {
      storage: {
        usedBytes,
        quotaBytes: storageQuota,
        usedFormatted: this.formatBytes(usedBytes),
        quotaFormatted: this.formatBytes(storageQuota),
        percentage: storagePercent,
      },
      materials: {
        currentCount: materialCount,
        maxCount: this.config.maxActiveMaterialsPerStudent,
      },
      chunks: {
        currentCount: chunkCount,
        maxCount: this.config.maxChunksPerStudent,
      },
      searches: {
        usedToday: searchesToday,
        maxDaily: this.config.maxDailySearchesPerStudent,
        remainingToday: Math.max(0, this.config.maxDailySearchesPerStudent - searchesToday),
      },
    };
  }

  /**
   * Enforces storage size, file size, and material count quota before an upload is saved.
   */
  public async checkUploadQuota(
    studentId: string,
    incomingFileSizeBytes: number
  ): Promise<QuotaCheckResult> {
    // 1. Check individual file size limit
    if (incomingFileSizeBytes > this.config.maxFileSizeBytes) {
      return {
        allowed: false,
        error: 'FILE_TOO_LARGE',
        requestedSize: incomingFileSizeBytes,
        limit: this.config.maxFileSizeBytes,
        message: `File size exceeds the allowed limit of ${this.formatBytes(
          this.config.maxFileSizeBytes
        )}.`,
      };
    }

    const pool = getPool();
    if (!pool) {
      return { allowed: true };
    }

    // 2. Check material count and cumulative storage
    const matRes = await pool.query<{ total_bytes: string; total_count: string }>(
      `SELECT
         COALESCE(SUM(file_size_bytes), 0) as total_bytes,
         COUNT(id) as total_count
       FROM study_materials
       WHERE student_id = $1`,
      [studentId]
    );

    const currentUsage = parseInt(matRes.rows[0]?.total_bytes || '0', 10);
    const currentMaterials = parseInt(matRes.rows[0]?.total_count || '0', 10);

    if (currentMaterials >= this.config.maxActiveMaterialsPerStudent) {
      return {
        allowed: false,
        error: 'MATERIAL_LIMIT_EXCEEDED',
        currentUsage: currentMaterials,
        limit: this.config.maxActiveMaterialsPerStudent,
        message: `Maximum material limit of ${this.config.maxActiveMaterialsPerStudent} reached. Please delete old materials to upload new ones.`,
      };
    }

    const projectedUsage = currentUsage + incomingFileSizeBytes;
    if (projectedUsage > this.config.maxStorageBytesPerStudent) {
      const remainingSpace = Math.max(0, this.config.maxStorageBytesPerStudent - currentUsage);
      return {
        allowed: false,
        error: 'STORAGE_QUOTA_EXCEEDED',
        currentUsage,
        quota: this.config.maxStorageBytesPerStudent,
        requestedSize: incomingFileSizeBytes,
        remainingSpace,
        message:
          'Your storage limit has been reached. Delete unwanted materials from your library to free up space.',
      };
    }

    return { allowed: true };
  }

  /**
   * Enforces chunk bounds per document and per student.
   */
  public async checkChunkQuota(
    studentId: string,
    newChunksCount: number
  ): Promise<QuotaCheckResult> {
    if (newChunksCount > this.config.maxChunksPerDocument) {
      return {
        allowed: false,
        error: 'DOCUMENT_CHUNK_LIMIT_EXCEEDED',
        requestedSize: newChunksCount,
        limit: this.config.maxChunksPerDocument,
        message: `Document produced ${newChunksCount} chunks, exceeding the maximum allowable chunks per document (${this.config.maxChunksPerDocument}).`,
      };
    }

    const pool = getPool();
    if (!pool) {
      return { allowed: true };
    }

    const chunkRes = await pool.query<{ chunk_count: string }>(
      `SELECT COUNT(c.id) as chunk_count
       FROM document_chunks c
       JOIN study_materials m ON c.material_id = m.id
       WHERE m.student_id = $1`,
      [studentId]
    );

    const currentTotalChunks = parseInt(chunkRes.rows[0]?.chunk_count || '0', 10);
    if (currentTotalChunks + newChunksCount > this.config.maxChunksPerStudent) {
      return {
        allowed: false,
        error: 'STUDENT_CHUNK_QUOTA_EXCEEDED',
        currentUsage: currentTotalChunks,
        quota: this.config.maxChunksPerStudent,
        requestedSize: newChunksCount,
        message: `Uploading this document would exceed your overall chunk quota (${this.config.maxChunksPerStudent} chunks).`,
      };
    }

    return { allowed: true };
  }

  /**
   * Enforces and atomically increments daily search quota (100 searches/student/day).
   */
  public async checkAndIncrementSearchQuota(studentId: string): Promise<QuotaCheckResult> {
    const pool = getPool();
    if (!pool) {
      return {
        allowed: true,
        limit: this.config.maxDailySearchesPerStudent,
        remaining: this.config.maxDailySearchesPerStudent,
      };
    }

    // Upsert today's count atomically
    const res = await pool.query<{ search_count: number }>(
      `INSERT INTO student_retrieval_quotas (student_id, search_date, search_count)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (student_id, search_date)
       DO UPDATE SET search_count = student_retrieval_quotas.search_count + 1, updated_at = NOW()
       RETURNING search_count`,
      [studentId]
    );

    const newCount = res.rows[0]?.search_count || 1;
    const maxDaily = this.config.maxDailySearchesPerStudent;

    if (newCount > maxDaily) {
      return {
        allowed: false,
        error: 'SEARCH_RATE_LIMIT_EXCEEDED',
        limit: maxDaily,
        remaining: 0,
        message: `You have reached your daily limit of ${maxDaily} semantic searches. Quota resets tomorrow.`,
      };
    }

    return {
      allowed: true,
      limit: maxDaily,
      remaining: Math.max(0, maxDaily - newCount),
    };
  }

  /**
   * Clamps and validates the top_k parameter between 1 and maxRetrievalTopK (10).
   */
  public validateTopK(requestedTopK?: number): number {
    if (typeof requestedTopK !== 'number' || isNaN(requestedTopK) || requestedTopK <= 0) {
      return this.config.defaultRetrievalTopK;
    }
    return Math.min(Math.max(1, Math.floor(requestedTopK)), this.config.maxRetrievalTopK);
  }
}

export const quotaService = new QuotaService();
