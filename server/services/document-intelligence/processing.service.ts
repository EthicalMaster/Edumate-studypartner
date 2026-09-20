/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { materialRepository } from '../../repositories/material.repository.js';
import { storageService, IStorageService } from '../storage.service.js';
import { documentExtractor, DocumentExtractionError } from './extractor.js';
import { structureAnalyzer } from './structure-analyzer.js';
import { chunker } from './chunker.js';
import { documentRepository } from '../../repositories/document.repository.js';
import { ProcessedDocument } from './types.js';

export class DocumentProcessingService {
  private storage: IStorageService;

  constructor(storage: IStorageService = storageService) {
    this.storage = storage;
  }

  /**
   * Executes the full deterministic document intelligence pipeline:
   * 1. Validate & load stored file
   * 2. Extract & normalize text with page boundaries
   * 3. Detect sections, chapters, topics
   * 4. Split into section-aware chunks with source page mapping
   * 5. Atomically persist to PostgreSQL & mark ready
   *
   * On failure, updates status to 'failed' with a sanitized error message.
   */
  async processMaterial(materialId: string, studentId: string): Promise<ProcessedDocument> {
    // 1. Fetch material record verifying student ownership
    const material = await materialRepository.getMaterialById(materialId, studentId);
    if (!material) {
      throw new Error('MATERIAL_NOT_FOUND: Material does not exist or does not belong to the student.');
    }

    // 2. Transition status to 'processing'
    await materialRepository.updateStatus(materialId, studentId, 'processing', null);

    try {
      // 3. Load file from storage
      const fileBuffer = await this.storage.load(material.storage_key);
      if (!fileBuffer) {
        throw new DocumentExtractionError('EMPTY_FILE', 'The stored file could not be read from storage.');
      }

      // 4. Extract content and normalize text
      const isMarkdown =
        material.original_filename.toLowerCase().endsWith('.md') ||
        material.mime_type === 'text/markdown' ||
        material.mime_type === 'text/x-markdown';

      const pages = await documentExtractor.extract(
        fileBuffer,
        material.original_filename,
        material.mime_type
      );

      // 5. Structure detection (sections, chapters, topics)
      const sections = structureAnalyzer.analyze(pages, isMarkdown);

      // 6. Section-aware deterministic chunking
      const chunks = chunker.chunk(pages, sections);

      // 7. Atomic persistence in PostgreSQL
      await documentRepository.saveDocumentStructure(materialId, pages, sections, chunks);

      const totalCharacters = pages.reduce((acc, p) => acc + p.characterCount, 0);

      return {
        pages,
        sections,
        chunks,
        totalPages: pages.length,
        totalCharacters,
        totalChunks: chunks.length,
      };
    } catch (err: any) {
      const sanitizedError = this.sanitizeErrorMessage(err);
      await materialRepository.updateStatus(materialId, studentId, 'failed', sanitizedError);
      throw new Error(sanitizedError);
    }
  }

  /**
   * Sanitizes error messages to ensure zero internal filesystem paths, stack traces,
   * or server internals leak to the client or database.
   */
  private sanitizeErrorMessage(err: any): string {
    if (err instanceof DocumentExtractionError) {
      return err.message;
    }

    const msg = String(err?.message || '');

    if (msg.includes('ENOENT') || msg.includes('/uploads/')) {
      return 'The document file is inaccessible or missing from storage.';
    }
    if (msg.includes('Invalid PDF') || msg.includes('FormatError') || msg.includes('trailer')) {
      return 'The PDF file is malformed or corrupted and could not be parsed.';
    }
    if (msg.includes('NO_EXTRACTABLE_TEXT')) {
      return 'No extractable text found in document.';
    }

    // Strip any potential absolute file paths
    const cleaned = msg.replace(/\/[a-zA-Z0-9_\.\-]+/g, '').trim();
    return cleaned.length > 0 ? cleaned.slice(0, 255) : 'Document processing encountered an unexpected error.';
  }
}

export const documentProcessingService = new DocumentProcessingService();
