/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  RetrievalSearchResponse,
  StudentQuotaUsage,
  MaterialEmbeddingSummary,
} from '../types';

export interface SearchParams {
  query: string;
  materialId?: string;
  subject?: string;
  topic?: string;
  topK?: number;
}

export const retrievalApi = {
  /**
   * Performs semantic retrieval scoped strictly to the student's materials.
   */
  async search(params: SearchParams): Promise<RetrievalSearchResponse> {
    const res = await fetch('/api/retrieval/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Retrieval search failed.');
    }
    return data;
  },

  /**
   * Fetches real-time student quota usage (storage, materials, chunks, daily searches).
   */
  async getQuotas(): Promise<{ usage: StudentQuotaUsage }> {
    const res = await fetch('/api/quotas');
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to load resource quotas.');
    }
    return data;
  },

  /**
   * Retrieves embedding generation summary for a study material.
   */
  async getEmbeddingStatus(materialId: string): Promise<{ embedding: MaterialEmbeddingSummary }> {
    const res = await fetch(`/api/retrieval/materials/${materialId}/embedding-status`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to load embedding status.');
    }
    return data;
  },

  /**
   * Triggers background re-embedding generation for a material.
   */
  async reEmbed(materialId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/retrieval/materials/${materialId}/re-embed`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to queue re-embedding.');
    }
    return data;
  },
};
