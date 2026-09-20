/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IVectorRepository,
  VectorPoint,
  VectorSearchParams,
  VectorSearchResult,
  ChunkVectorPayload,
} from './types.js';

export class QdrantVectorRepository implements IVectorRepository {
  private readonly qdrantUrl: string;
  private readonly collectionName: string;
  private readonly dimension = 384;
  private readonly distance = 'Cosine';

  // Internal resilient fallback store for environments without live Qdrant daemon
  private memoryStore = new Map<string, VectorPoint>();
  private useMemoryFallback = false;
  private checkedAvailability = false;

  constructor(url?: string, collection?: string) {
    this.qdrantUrl = (url || process.env.QDRANT_URL || 'http://localhost:6333').replace(/\/+$/, '');
    this.collectionName = collection || process.env.QDRANT_COLLECTION || 'edumate_documents';
  }

  public async isQdrantAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const res = await fetch(`${this.qdrantUrl}/readyz`, { signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async getActiveBackend(): Promise<'qdrant' | 'memory'> {
    if (!this.checkedAvailability) {
      const available = await this.isQdrantAvailable();
      this.useMemoryFallback = !available;
      this.checkedAvailability = true;
    }
    return this.useMemoryFallback ? 'memory' : 'qdrant';
  }

  public setForceMemoryFallback(force: boolean): void {
    this.useMemoryFallback = force;
    this.checkedAvailability = true;
  }

  public async ensureCollection(): Promise<void> {
    const backend = await this.getActiveBackend();
    if (backend === 'memory') {
      return;
    }

    try {
      const checkRes = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`);
      if (checkRes.status === 404) {
        const createRes = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vectors: {
              size: this.dimension,
              distance: this.distance,
            },
          }),
        });
        if (!createRes.ok) {
          const errText = await createRes.text();
          console.warn(`[Qdrant] Failed to create collection, using memory fallback: ${errText}`);
          this.useMemoryFallback = true;
        }
      }
    } catch (err: any) {
      console.warn(`[Qdrant] Network error during ensureCollection, using memory fallback: ${err.message}`);
      this.useMemoryFallback = true;
    }
  }

  public async upsertChunks(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;

    // Validate 384 dimensions on all points
    for (const p of points) {
      if (!Array.isArray(p.vector) || p.vector.length !== this.dimension) {
        throw new Error(
          `Invalid vector dimension for point ${p.id}. Expected ${this.dimension}, got ${p.vector?.length}`
        );
      }
    }

    const backend = await this.getActiveBackend();
    if (backend === 'qdrant') {
      try {
        await this.ensureCollection();
        const res = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points?wait=true`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: points.map((p) => ({
              id: p.id,
              vector: p.vector,
              payload: p.payload,
            })),
          }),
        });
        if (res.ok) {
          // Also keep in memory mirror for instant synchronization
          for (const p of points) {
            this.memoryStore.set(p.id, p);
          }
          return;
        }
        console.warn('[Qdrant] Upsert failed on Qdrant, syncing to memory store.');
      } catch {
        this.useMemoryFallback = true;
      }
    }

    // Memory store fallback
    for (const p of points) {
      this.memoryStore.set(p.id, p);
    }
  }

  public async deleteByMaterialId(materialId: string): Promise<void> {
    const backend = await this.getActiveBackend();
    if (backend === 'qdrant') {
      try {
        await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/delete?wait=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: {
              must: [{ key: 'material_id', match: { value: materialId } }],
            },
          }),
        });
      } catch {
        // Continue to clear memory store
      }
    }

    // Memory store purge
    for (const [id, point] of this.memoryStore.entries()) {
      if (point.payload.material_id === materialId) {
        this.memoryStore.delete(id);
      }
    }
  }

  public async deleteByChunkIds(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return;

    const backend = await this.getActiveBackend();
    if (backend === 'qdrant') {
      try {
        await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/delete?wait=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: chunkIds }),
        });
      } catch {
        // Continue to clear memory store
      }
    }

    for (const id of chunkIds) {
      this.memoryStore.delete(id);
    }
  }

  public async countByMaterialId(materialId: string): Promise<number> {
    const backend = await this.getActiveBackend();
    if (backend === 'qdrant') {
      try {
        const res = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/count`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: {
              must: [{ key: 'material_id', match: { value: materialId } }],
            },
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          return data.result?.count ?? 0;
        }
      } catch {
        // Fall back to memory count
      }
    }

    let count = 0;
    for (const point of this.memoryStore.values()) {
      if (point.payload.material_id === materialId) {
        count++;
      }
    }
    return count;
  }

  public async search(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    if (!params.studentId) {
      throw new Error('Mandatory security violation: studentId is required for all vector searches.');
    }
    if (!Array.isArray(params.queryVector) || params.queryVector.length !== this.dimension) {
      throw new Error(`Query vector must have exactly ${this.dimension} dimensions.`);
    }

    const topK = Math.min(Math.max(1, params.topK || 5), 10);

    const backend = await this.getActiveBackend();
    if (backend === 'qdrant') {
      try {
        const filterMust: any[] = [
          { key: 'student_id', match: { value: params.studentId } },
        ];
        if (params.materialId) {
          filterMust.push({ key: 'material_id', match: { value: params.materialId } });
        }
        if (params.subject) {
          filterMust.push({ key: 'subject', match: { value: params.subject } });
        }
        if (params.topic) {
          filterMust.push({ key: 'topic', match: { value: params.topic } });
        }

        const res = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: params.queryVector,
            limit: topK,
            filter: { must: filterMust },
            with_payload: true,
          }),
        });

        if (res.ok) {
          const data: any = await res.json();
          const hits = data.result || [];
          return hits.map((hit: any) => ({
            id: String(hit.id),
            score: Number(hit.score),
            payload: hit.payload as ChunkVectorPayload,
          }));
        }
      } catch {
        // Fall back to memory search
      }
    }

    // High-performance deterministic in-memory Cosine search
    const candidates: Array<{ id: string; score: number; payload: ChunkVectorPayload }> = [];

    for (const point of this.memoryStore.values()) {
      // 1. Mandatory Student Ownership Isolation Filter
      if (point.payload.student_id !== params.studentId) {
        continue;
      }
      // 2. Optional Material Scope Filter
      if (params.materialId && point.payload.material_id !== params.materialId) {
        continue;
      }
      // 3. Optional Subject Scope Filter
      if (params.subject && point.payload.subject.toLowerCase() !== params.subject.toLowerCase()) {
        continue;
      }
      // 4. Optional Topic Scope Filter
      if (params.topic && point.payload.topic.toLowerCase() !== params.topic.toLowerCase()) {
        continue;
      }

      // Compute Cosine similarity (dot product of L2-normalized vectors)
      let dot = 0;
      const v = point.vector;
      const q = params.queryVector;
      for (let i = 0; i < this.dimension; i++) {
        dot += v[i] * q[i];
      }

      candidates.push({
        id: point.id,
        score: parseFloat(dot.toFixed(5)),
        payload: point.payload,
      });
    }

    // Sort descending by similarity score
    candidates.sort((a, b) => b.score - a.score);

    return candidates.slice(0, topK);
  }
}

export const vectorRepository: IVectorRepository = new QdrantVectorRepository();
