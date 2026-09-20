/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth } from '../middleware/auth.middleware.js';
import { materialRepository } from '../repositories/material.repository.js';
import { storageService } from '../services/storage.service.js';

export const materialRouter = express.Router();

// All study materials endpoints strictly require student session authentication
materialRouter.use(requireAuth);

/**
 * Helper to safely extract student profile ID from authenticated session.
 * Guaranteed to exist by requireAuth. Client-provided user_id/student_id is never trusted.
 */
function getStudentProfileId(req: Request): string {
  if (!req.user?.profile?.id) {
    throw new Error('MISSING_PROFILE: Authenticated user has no student profile.');
  }
  return req.user.profile.id;
}

// ----------------------------------------------------------------------------
// Multer Configuration & Upload Security
// ----------------------------------------------------------------------------

// Max file size: 25 Megabytes
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// Conservative supported extensions and MIME types
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.txt', '.md']);
const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/octet-stream', // validated alongside extension and magic bytes
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      const err: any = new Error(
        `UNSUPPORTED_FILE_TYPE: Only PDF (.pdf), Plain Text (.txt), and Markdown (.md) files are supported. Received: ${ext || 'unknown'}`
      );
      err.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(err, false);
    }

    if (file.mimetype && !SUPPORTED_MIME_TYPES.has(file.mimetype)) {
      const err: any = new Error(
        `UNSUPPORTED_MIME_TYPE: File MIME type '${file.mimetype}' is not permitted.`
      );
      err.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(err, false);
    }

    cb(null, true);
  },
});

/**
 * Non-AI content verification: checks magic bytes and content integrity.
 */
function verifyFileContent(buffer: Buffer, ext: string, mimeType: string): { isValid: boolean; normalizedMime: string; error?: string } {
  if (!buffer || buffer.length === 0) {
    return { isValid: false, normalizedMime: mimeType, error: 'Uploaded file is empty (0 bytes).' };
  }

  if (ext === '.pdf') {
    // Standard PDF header magic bytes: '%PDF-'
    const header = buffer.subarray(0, 5).toString('ascii');
    if (!header.startsWith('%PDF-')) {
      return {
        isValid: false,
        normalizedMime: 'application/pdf',
        error: 'Invalid PDF content: Missing standard %PDF- file header signature.',
      };
    }
    return { isValid: true, normalizedMime: 'application/pdf' };
  }

  if (ext === '.txt') {
    return { isValid: true, normalizedMime: 'text/plain' };
  }

  if (ext === '.md') {
    return { isValid: true, normalizedMime: 'text/markdown' };
  }

  return { isValid: false, normalizedMime: mimeType, error: 'Unsupported file format.' };
}

// ----------------------------------------------------------------------------
// Endpoints
// ----------------------------------------------------------------------------

/**
 * POST /api/materials
 * Upload a new study document with optional metadata.
 */
materialRouter.post(
  '/',
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            error: 'FILE_TOO_LARGE',
            message: `File size exceeds the 25MB limit. Current limit is 25MB.`,
          });
          return;
        }
        if (err.code === 'UNSUPPORTED_FILE_TYPE') {
          res.status(400).json({
            error: 'UNSUPPORTED_FILE_TYPE',
            message: err.message,
          });
          return;
        }
        res.status(400).json({
          error: 'UPLOAD_FAILED',
          message: err.message || 'File upload error.',
        });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    try {
      const studentId = getStudentProfileId(req);
      const file = req.file;

      if (!file) {
        res.status(400).json({
          error: 'MISSING_FILE',
          message: 'No file was provided in the multipart/form-data upload.',
        });
        return;
      }

      const originalFilename = file.originalname || 'document.pdf';
      const ext = path.extname(originalFilename).toLowerCase();

      // Content integrity verification (Non-AI magic bytes / format check)
      const contentCheck = verifyFileContent(file.buffer, ext, file.mimetype);
      if (!contentCheck.isValid) {
        res.status(400).json({
          error: 'INVALID_FILE_CONTENT',
          message: contentCheck.error,
        });
        return;
      }

      // Metadata normalization
      const defaultTitle = path.basename(originalFilename, ext).replace(/[_-]+/g, ' ').trim() || 'Untitled Material';
      const title = (req.body.title && String(req.body.title).trim()) || defaultTitle;
      const subject = (req.body.subject && String(req.body.subject).trim()) || 'General Studies';
      const topic = (req.body.topic && String(req.body.topic).trim()) || 'General';

      if (title.length > 255) {
        res.status(400).json({
          error: 'INVALID_METADATA',
          message: 'Title must not exceed 255 characters.',
        });
        return;
      }

      // Save file safely through storage abstraction (isolated collision-free key)
      const saveResult = await storageService.save(file.buffer, originalFilename, contentCheck.normalizedMime);

      // Create persistent database record
      // Status lifecycle: starts as 'uploaded', non-AI validation passes -> 'ready'
      const record = await materialRepository.createMaterial({
        studentId,
        title,
        originalFilename,
        mimeType: contentCheck.normalizedMime,
        fileSizeBytes: saveResult.fileSizeBytes,
        storageKey: saveResult.storageKey,
        subject,
        topic,
        processingStatus: 'ready',
        processingError: null,
      });

      const materialDTO = materialRepository.toDTO(record);

      res.status(201).json({
        material: materialDTO,
        message: 'Study document successfully uploaded, validated, and indexed.',
      });
    } catch (err: any) {
      console.error('[Material Routes] POST /api/materials error:', err);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: err.message || 'Failed to process material upload.',
      });
    }
  }
);

/**
 * GET /api/materials
 * Retrieve the authenticated student's personal study material library.
 */
materialRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentProfileId(req);
    const { subject, topic, status, search } = req.query;

    const materials = await materialRepository.getMaterialsByStudent(studentId, {
      subject: typeof subject === 'string' ? subject : undefined,
      topic: typeof topic === 'string' ? topic : undefined,
      processingStatus: typeof status === 'string' ? status : undefined,
      search: typeof search === 'string' ? search : undefined,
    });

    const dtos = materials.map((m) => materialRepository.toDTO(m));

    res.json({
      materials: dtos,
      total: dtos.length,
    });
  } catch (err: any) {
    console.error('[Material Routes] GET /api/materials error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to retrieve materials library.',
    });
  }
});

/**
 * GET /api/materials/:id
 * Retrieve details of a specific study material owned by the authenticated student.
 */
materialRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentProfileId(req);
    const { id } = req.params;

    const record = await materialRepository.getMaterialById(id, studentId);
    if (!record) {
      // Safe 404 response to avoid disclosing existence of materials owned by other students
      res.status(404).json({
        error: 'MATERIAL_NOT_FOUND',
        message: 'Study material not found.',
      });
      return;
    }

    res.json({
      material: materialRepository.toDTO(record),
    });
  } catch (err: any) {
    console.error('[Material Routes] GET /api/materials/:id error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to retrieve material details.',
    });
  }
});

/**
 * GET /api/materials/:id/download
 * Download or stream the authenticated student's stored file.
 */
materialRouter.get('/:id/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentProfileId(req);
    const { id } = req.params;

    const record = await materialRepository.getMaterialById(id, studentId);
    if (!record) {
      res.status(404).json({
        error: 'MATERIAL_NOT_FOUND',
        message: 'Study material not found.',
      });
      return;
    }

    const filePath = storageService.getFilePath(record.storage_key);
    if (!filePath) {
      res.status(404).json({
        error: 'FILE_NOT_FOUND',
        message: 'The requested file could not be located in storage.',
      });
      return;
    }

    res.setHeader('Content-Type', record.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(record.original_filename)}"`
    );

    const stream = storageService.getStream(record.storage_key);
    if (!stream) {
      res.status(404).json({
        error: 'FILE_NOT_FOUND',
        message: 'The requested file stream could not be opened.',
      });
      return;
    }

    stream.pipe(res);
  } catch (err: any) {
    console.error('[Material Routes] GET /api/materials/:id/download error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to download study material.',
    });
  }
});

/**
 * DELETE /api/materials/:id
 * Delete a study material record and its underlying storage file.
 */
materialRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentProfileId(req);
    const { id } = req.params;

    // Delete database record first, verifying ownership
    const deletedRecord = await materialRepository.deleteMaterial(id, studentId);
    if (!deletedRecord) {
      res.status(404).json({
        error: 'MATERIAL_NOT_FOUND',
        message: 'Study material not found or already deleted.',
      });
      return;
    }

    // Safely delete file from storage (does not fail if file was already missing)
    if (deletedRecord.storage_key) {
      await storageService.delete(deletedRecord.storage_key);
    }

    res.json({
      success: true,
      message: 'Study material deleted successfully.',
    });
  } catch (err: any) {
    console.error('[Material Routes] DELETE /api/materials/:id error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to delete study material.',
    });
  }
});
