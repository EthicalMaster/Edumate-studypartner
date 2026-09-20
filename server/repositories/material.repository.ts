/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRequiredPool } from '../db/connection.js';

export interface StudyMaterialRecord {
  id: string;
  student_id: string;
  title: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  storage_key: string;
  storage_location: string;
  subject: string;
  topic: string;
  processing_status: 'uploaded' | 'processing' | 'ready' | 'failed';
  processing_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface StudyMaterialDTO {
  id: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  subject: string;
  topic: string;
  processingStatus: 'uploaded' | 'processing' | 'ready' | 'failed';
  processingError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaterialInput {
  studentId: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
  subject: string;
  topic: string;
  processingStatus?: 'uploaded' | 'processing' | 'ready' | 'failed';
  processingError?: string | null;
}

export interface MaterialFilters {
  subject?: string;
  topic?: string;
  processingStatus?: string;
  search?: string;
}

export class MaterialRepository {
  /**
   * Transforms an internal database record into a secure, sanitized DTO.
   * Strips all internal filesystem storage keys, locations, and system internals.
   */
  toDTO(record: StudyMaterialRecord): StudyMaterialDTO {
    return {
      id: record.id,
      title: record.title || record.original_filename || record.topic,
      originalFilename: record.original_filename,
      mimeType: record.mime_type,
      fileSizeBytes: Number(record.file_size_bytes),
      subject: record.subject,
      topic: record.topic,
      processingStatus: record.processing_status,
      processingError: record.processing_error || null,
      createdAt: record.created_at.toISOString(),
      updatedAt: record.updated_at.toISOString(),
    };
  }

  /**
   * Inserts a new study material record associated strictly with the authenticated student's profile ID.
   */
  async createMaterial(input: CreateMaterialInput): Promise<StudyMaterialRecord> {
    const pool = getRequiredPool();
    const query = `
      INSERT INTO study_materials (
        student_id,
        filename,
        file_type,
        file_size_bytes,
        storage_location,
        title,
        original_filename,
        mime_type,
        storage_key,
        subject,
        topic,
        processing_status,
        processing_error,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING *;
    `;

    const values = [
      input.studentId,
      input.originalFilename,
      input.mimeType,
      input.fileSizeBytes,
      input.storageKey, // storage_location legacy mirror
      input.title,
      input.originalFilename,
      input.mimeType,
      input.storageKey,
      input.subject,
      input.topic,
      input.processingStatus || 'uploaded',
      input.processingError || null,
    ];

    const result = await pool.query<StudyMaterialRecord>(query, values);
    return result.rows[0];
  }

  /**
   * Retrieves all study materials owned by the student, with optional filtering.
   * Strictly scopes to the student profile ID to enforce ownership isolation.
   */
  async getMaterialsByStudent(studentId: string, filters: MaterialFilters = {}): Promise<StudyMaterialRecord[]> {
    const pool = getRequiredPool();
    const conditions: string[] = ['student_id = $1'];
    const values: any[] = [studentId];
    let paramIndex = 2;

    if (filters.subject && filters.subject !== 'All') {
      conditions.push(`LOWER(subject) = LOWER($${paramIndex})`);
      values.push(filters.subject);
      paramIndex++;
    }

    if (filters.topic) {
      conditions.push(`LOWER(topic) LIKE LOWER($${paramIndex})`);
      values.push(`%${filters.topic}%`);
      paramIndex++;
    }

    if (filters.processingStatus) {
      conditions.push(`processing_status = $${paramIndex}`);
      values.push(filters.processingStatus);
      paramIndex++;
    }

    if (filters.search) {
      conditions.push(
        `(LOWER(title) LIKE LOWER($${paramIndex}) OR LOWER(original_filename) LIKE LOWER($${paramIndex}) OR LOWER(topic) LIKE LOWER($${paramIndex}) OR LOWER(subject) LIKE LOWER($${paramIndex}))`
      );
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const query = `
      SELECT *
      FROM study_materials
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC;
    `;

    const result = await pool.query<StudyMaterialRecord>(query, values);
    return result.rows;
  }

  /**
   * Retrieves a single study material by ID, enforcing strict student ownership.
   * Returns null if not found or if owned by another student (anti-IDOR).
   */
  async getMaterialById(id: string, studentId: string): Promise<StudyMaterialRecord | null> {
    const pool = getRequiredPool();
    const query = `
      SELECT *
      FROM study_materials
      WHERE id = $1 AND student_id = $2;
    `;
    const result = await pool.query<StudyMaterialRecord>(query, [id, studentId]);
    return result.rows[0] || null;
  }

  /**
   * Updates processing status and optional error message for a student's material.
   */
  async updateStatus(
    id: string,
    studentId: string,
    status: 'uploaded' | 'processing' | 'ready' | 'failed',
    error: string | null = null
  ): Promise<StudyMaterialRecord | null> {
    const pool = getRequiredPool();
    const query = `
      UPDATE study_materials
      SET processing_status = $1, processing_error = $2, updated_at = NOW()
      WHERE id = $3 AND student_id = $4
      RETURNING *;
    `;
    const result = await pool.query<StudyMaterialRecord>(query, [status, error, id, studentId]);
    return result.rows[0] || null;
  }

  /**
   * Deletes a study material record owned by the student.
   * Returns the deleted record so the caller can safely delete the underlying storage file.
   */
  async deleteMaterial(id: string, studentId: string): Promise<StudyMaterialRecord | null> {
    const pool = getRequiredPool();
    const query = `
      DELETE FROM study_materials
      WHERE id = $1 AND student_id = $2
      RETURNING *;
    `;
    const result = await pool.query<StudyMaterialRecord>(query, [id, studentId]);
    return result.rows[0] || null;
  }

  /**
   * Counts total materials uploaded by a student.
   */
  async countByStudent(studentId: string): Promise<number> {
    const pool = getRequiredPool();
    const query = `SELECT COUNT(*)::int AS count FROM study_materials WHERE student_id = $1;`;
    const result = await pool.query<{ count: number }>(query, [studentId]);
    return result.rows[0]?.count || 0;
  }
}

export const materialRepository = new MaterialRepository();
