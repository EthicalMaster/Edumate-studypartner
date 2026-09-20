/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ChunkVectorPayload {
  chunk_id: string;
  material_id: string;
  student_id: string;
  subject: string;
  topic: string;
  page_start: number;
  page_end: number;
  section_id: string | null;
  chunk_index: number;
}

export interface VectorPoint {
  id: string; // UUID
  vector: number[]; // 384-dimensional
  payload: ChunkVectorPayload;
}

export interface VectorSearchParams {
  studentId: string; // MANDATORY: Student tenant isolation
  queryVector: number[];
  materialId?: string;
  subject?: string;
  topic?: string;
  topK: number;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: ChunkVectorPayload;
}

export interface IVectorRepository {
  ensureCollection(): Promise<void>;
  upsertChunks(points: VectorPoint[]): Promise<void>;
  deleteByMaterialId(materialId: string): Promise<void>;
  deleteByChunkIds(chunkIds: string[]): Promise<void>;
  countByMaterialId(materialId: string): Promise<number>;
  search(params: VectorSearchParams): Promise<VectorSearchResult[]>;
  isQdrantAvailable(): Promise<boolean>;
}
