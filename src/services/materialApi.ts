/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StudyMaterial } from '../types';

export interface MaterialFilters {
  subject?: string;
  topic?: string;
  status?: string;
  search?: string;
}

export const materialApi = {
  /**
   * Upload a new study material using XMLHttpRequest to support real progress reporting.
   */
  async uploadMaterial(
    formData: FormData,
    onProgress?: (percent: number) => void
  ): Promise<{ material: StudyMaterial; message: string }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/materials');
      xhr.withCredentials = true;

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data.message || data.error || `Upload failed with status ${xhr.status}`));
          }
        } catch {
          reject(new Error(`Server error: ${xhr.status} ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error occurred during file upload. Please verify your connection.'));
      };

      xhr.send(formData);
    });
  },

  /**
   * Fetch all study materials for the current authenticated student.
   */
  async getMaterials(filters: MaterialFilters = {}): Promise<{ materials: StudyMaterial[]; total: number }> {
    const params = new URLSearchParams();
    if (filters.subject && filters.subject !== 'All') params.append('subject', filters.subject);
    if (filters.topic) params.append('topic', filters.topic);
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);

    const qs = params.toString();
    const url = `/api/materials${qs ? `?${qs}` : ''}`;

    const res = await fetch(url, {
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to fetch materials: ${res.statusText}`);
    }

    return res.json();
  },

  /**
   * Fetch a single study material by ID.
   */
  async getMaterial(id: string): Promise<{ material: StudyMaterial }> {
    const res = await fetch(`/api/materials/${id}`, {
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Study material not found.');
    }

    return res.json();
  },

  /**
   * Delete a study material by ID.
   */
  async deleteMaterial(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/materials/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to delete study material.');
    }

    return res.json();
  },

  /**
   * Helper to construct download/preview URL.
   */
  getDownloadUrl(id: string): string {
    return `/api/materials/${id}/download`;
  },

  /**
   * (Re)process an uploaded study material using deterministic document intelligence.
   */
  async reprocessMaterial(id: string): Promise<{ success: boolean; material: StudyMaterial; stats: any; message: string }> {
    const res = await fetch(`/api/materials/${id}/process`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to reprocess study material.');
    }

    return res.json();
  },

  /**
   * Fetch processing details and structural metrics.
   */
  async getProcessingDetails(id: string): Promise<{ processing: any }> {
    const res = await fetch(`/api/materials/${id}/processing`, {
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch processing details.');
    }

    return res.json();
  },

  /**
   * Fetch extracted pages.
   */
  async getPages(id: string): Promise<{ pages: any[]; total: number }> {
    const res = await fetch(`/api/materials/${id}/pages`, {
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch document pages.');
    }

    return res.json();
  },

  /**
   * Fetch detected sections outline.
   */
  async getSections(id: string): Promise<{ sections: any[]; total: number }> {
    const res = await fetch(`/api/materials/${id}/sections`, {
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch document sections.');
    }

    return res.json();
  },

  /**
   * Fetch extracted chunks with preserved source traceability.
   */
  async getChunks(id: string): Promise<{ chunks: any[]; total: number }> {
    const res = await fetch(`/api/materials/${id}/chunks`, {
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch document chunks.');
    }

    return res.json();
  },
};
