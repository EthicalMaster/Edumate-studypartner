/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PDFParse } from 'pdf-parse';
import { ExtractedPage } from './types.js';

export class DocumentExtractionError extends Error {
  constructor(
    public code: 'EMPTY_FILE' | 'UNSUPPORTED_FORMAT' | 'CORRUPT_DOCUMENT' | 'NO_EXTRACTABLE_TEXT' | 'PARSING_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'DocumentExtractionError';
  }
}

export class DocumentExtractor {
  /**
   * Normalizes raw extracted text:
   * - Standardizes line breaks (\r\n -> \n, \r -> \n)
   * - Strips non-printable control characters except standard whitespace (\n, \t)
   * - Normalizes excessive horizontal whitespace (multiple spaces/tabs to single space, unless indented)
   * - Collapses more than 2 consecutive blank lines to 2
   * - Trims leading/trailing whitespace
   * - Preserves academic content, symbols, and formulas exactly as extracted
   */
  normalizeText(rawText: string): string {
    if (!rawText) return '';

    return rawText
      // Standardize newlines
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove non-printable control characters (keep \t and \n)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Replace non-breaking spaces with standard space
      .replace(/\u00A0/g, ' ')
      // Normalize horizontal whitespace on each line while preserving line breaks
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      // Collapse 3 or more consecutive blank lines to 2
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Extracts text and page boundaries from supported file formats (PDF, TXT, MD).
   */
  async extract(buffer: Buffer, originalFilename: string, mimeType?: string): Promise<ExtractedPage[]> {
    if (!buffer || buffer.length === 0) {
      throw new DocumentExtractionError('EMPTY_FILE', 'The provided document is empty (0 bytes).');
    }

    const ext = (originalFilename.split('.').pop() || '').toLowerCase();

    if (ext === 'pdf' || mimeType === 'application/pdf') {
      return this.extractPdf(buffer);
    } else if (ext === 'txt' || mimeType === 'text/plain') {
      return this.extractTxt(buffer);
    } else if (ext === 'md' || mimeType === 'text/markdown' || mimeType === 'text/x-markdown') {
      return this.extractMarkdown(buffer);
    } else {
      throw new DocumentExtractionError(
        'UNSUPPORTED_FORMAT',
        `Unsupported document format '.${ext}'. Only PDF, TXT, and Markdown are supported.`
      );
    }
  }

  /**
   * Extracts text page-by-page from a PDF buffer using PDFParse.
   */
  private async extractPdf(buffer: Buffer): Promise<ExtractedPage[]> {
    let parser: any = null;
    try {
      parser = new PDFParse({ data: buffer });
      await parser.load();

      const textResult = await parser.getText();
      const rawPages: Array<{ text: string; num: number }> = textResult.pages || [];

      if (!rawPages || rawPages.length === 0) {
        throw new DocumentExtractionError(
          'NO_EXTRACTABLE_TEXT',
          'The PDF contains no pages or has an unreadable document catalog.'
        );
      }

      const pages: ExtractedPage[] = [];
      let totalExtractedLength = 0;

      for (let i = 0; i < rawPages.length; i++) {
        const rawPage = rawPages[i];
        const pageNumber = rawPage.num || i + 1;
        const normalized = this.normalizeText(rawPage.text || '');

        pages.push({
          pageNumber,
          text: normalized,
          characterCount: normalized.length,
        });

        totalExtractedLength += normalized.length;
      }

      // Check if PDF is a scanned image or contains zero extractable text
      if (totalExtractedLength === 0) {
        throw new DocumentExtractionError(
          'NO_EXTRACTABLE_TEXT',
          'No extractable text found in PDF. The document may be a scanned image or bitmap requiring OCR.'
        );
      }

      return pages;
    } catch (err: any) {
      if (err instanceof DocumentExtractionError) {
        throw err;
      }
      const msg = err.message || '';
      if (msg.includes('Invalid PDF') || msg.includes('FormatError') || msg.includes('trailer')) {
        throw new DocumentExtractionError(
          'CORRUPT_DOCUMENT',
          'The PDF file is malformed or corrupted and could not be parsed.'
        );
      }
      throw new DocumentExtractionError(
        'PARSING_FAILED',
        `Failed to parse PDF document: ${msg || 'Unknown error'}`
      );
    } finally {
      if (parser && typeof parser.destroy === 'function') {
        try {
          await parser.destroy();
        } catch {
          // ignore destroy cleanup errors
        }
      }
    }
  }

  /**
   * Extracts text from Plain Text buffer (deterministic single logical page representation).
   */
  private extractTxt(buffer: Buffer): ExtractedPage[] {
    const rawText = buffer.toString('utf-8');
    const normalized = this.normalizeText(rawText);

    if (normalized.length === 0) {
      throw new DocumentExtractionError('NO_EXTRACTABLE_TEXT', 'The text document contains no readable text.');
    }

    return [
      {
        pageNumber: 1,
        text: normalized,
        characterCount: normalized.length,
      },
    ];
  }

  /**
   * Extracts text from Markdown buffer (deterministic single logical page representation).
   */
  private extractMarkdown(buffer: Buffer): ExtractedPage[] {
    const rawText = buffer.toString('utf-8');
    const normalized = this.normalizeText(rawText);

    if (normalized.length === 0) {
      throw new DocumentExtractionError('NO_EXTRACTABLE_TEXT', 'The markdown document contains no readable text.');
    }

    return [
      {
        pageNumber: 1,
        text: normalized,
        characterCount: normalized.length,
      },
    ];
  }
}

export const documentExtractor = new DocumentExtractor();
