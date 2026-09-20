/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ResourceQuotaConfig {
  maxStorageBytesPerStudent: number;    // STORAGE_QUOTA_MB (default 500 MB)
  maxFileSizeBytes: number;             // MAX_FILE_SIZE_MB (default 25 MB)
  maxActiveMaterialsPerStudent: number; // MAX_ACTIVE_MATERIALS (default 50)
  maxChunksPerDocument: number;         // MAX_CHUNKS_PER_DOCUMENT (default 10,000)
  maxChunksPerStudent: number;          // MAX_CHUNKS_PER_STUDENT (default 5,000)
  maxDailySearchesPerStudent: number;   // DAILY_SEMANTIC_SEARCHES (default 200)
  maxRetrievalTopK: number;             // MAX_RETRIEVAL_TOP_K (default 10)
  defaultRetrievalTopK: number;         // DEFAULT_RETRIEVAL_TOP_K (default 5)
  embeddingWorkerConcurrency: number;   // EMBEDDING_WORKER_CONCURRENCY (default 1)
  embeddingBatchSize: number;           // EMBEDDING_BATCH_SIZE (default 16)
}

function parseEnvInt(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

export function loadResourceQuotas(): ResourceQuotaConfig {
  const maxFileMB = parseEnvInt(process.env.MAX_FILE_SIZE_MB, 25);
  const storageQuotaMB = parseEnvInt(process.env.STORAGE_QUOTA_MB, 500);
  const maxActiveMaterials = parseEnvInt(process.env.MAX_ACTIVE_MATERIALS, 50);
  const maxChunksPerDoc = parseEnvInt(process.env.MAX_CHUNKS_PER_DOCUMENT, 10_000);
  const maxChunksPerStud = parseEnvInt(process.env.MAX_CHUNKS_PER_STUDENT, 5_000);
  const dailySearches = parseEnvInt(process.env.DAILY_SEMANTIC_SEARCHES, 200);
  const maxTopK = parseEnvInt(process.env.MAX_RETRIEVAL_TOP_K, 10);
  const defaultTopK = parseEnvInt(process.env.DEFAULT_RETRIEVAL_TOP_K, 5);
  const workerConcurrency = parseEnvInt(process.env.EMBEDDING_WORKER_CONCURRENCY, 1);
  const batchSize = parseEnvInt(process.env.EMBEDDING_BATCH_SIZE, 16);

  return {
    maxStorageBytesPerStudent: storageQuotaMB * 1024 * 1024,
    maxFileSizeBytes: maxFileMB * 1024 * 1024,
    maxActiveMaterialsPerStudent: maxActiveMaterials,
    maxChunksPerDocument: maxChunksPerDoc,
    maxChunksPerStudent: maxChunksPerStud,
    maxDailySearchesPerStudent: dailySearches,
    maxRetrievalTopK: maxTopK,
    defaultRetrievalTopK: defaultTopK,
    embeddingWorkerConcurrency: workerConcurrency,
    embeddingBatchSize: batchSize,
  };
}

export const DEFAULT_RESOURCE_QUOTAS: ResourceQuotaConfig = loadResourceQuotas();

