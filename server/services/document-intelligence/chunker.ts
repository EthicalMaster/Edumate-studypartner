/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtractedPage, ExtractedSection, ExtractedChunk } from './types.js';

export interface ChunkerConfig {
  targetChunkChars: number;
  maxChunkChars: number;
  minChunkChars: number;
  overlapChars: number;
}

export const DEFAULT_CHUNKER_CONFIG: ChunkerConfig = {
  targetChunkChars: 900,
  maxChunkChars: 1400,
  minChunkChars: 150,
  overlapChars: 100,
};

export class Chunker {
  private config: ChunkerConfig;

  constructor(config: Partial<ChunkerConfig> = {}) {
    this.config = { ...DEFAULT_CHUNKER_CONFIG, ...config };
  }

  /**
   * Estimates token count using standard deterministic heuristic (4 chars per token).
   */
  static estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  /**
   * Splits extracted pages into structured, section-aware chunks with preserved source traceability.
   */
  chunk(pages: ExtractedPage[], sections: ExtractedSection[]): ExtractedChunk[] {
    if (!pages || pages.length === 0) {
      return [];
    }

    const chunks: ExtractedChunk[] = [];
    let currentChunkIndex = 0;

    // Map each page to its most specific section
    // If no sections, default to null
    const pageToSectionMap = new Map<number, string | null>();
    for (const page of pages) {
      // Find section whose page range covers this page, preferring the deepest headingLevel
      let matchedSec: ExtractedSection | null = null;
      for (const sec of sections) {
        if (page.pageNumber >= sec.pageStart && page.pageNumber <= sec.pageEnd) {
          if (!matchedSec || sec.headingLevel >= matchedSec.headingLevel) {
            matchedSec = sec;
          }
        }
      }
      pageToSectionMap.set(page.pageNumber, matchedSec?.tempId || null);
    }

    // Process page-by-page, accumulating text blocks into chunks
    let currentText = '';
    let chunkStartPage = pages[0].pageNumber;
    let chunkEndPage = pages[0].pageNumber;
    let activeSectionTempId: string | null = pageToSectionMap.get(pages[0].pageNumber) || null;

    for (const page of pages) {
      const pageNum = page.pageNumber;
      const pageSecTempId = pageToSectionMap.get(pageNum) || null;
      const pageText = page.text.trim();

      if (!pageText) continue;

      // If we crossed into a major new section and already accumulated enough text, finalize chunk
      if (
        pageSecTempId !== activeSectionTempId &&
        currentText.length >= this.config.minChunkChars
      ) {
        chunks.push({
          chunkIndex: currentChunkIndex++,
          text: currentText.trim(),
          sectionTempId: activeSectionTempId,
          pageStart: chunkStartPage,
          pageEnd: chunkEndPage,
          characterCount: currentText.trim().length,
          tokenEstimate: Chunker.estimateTokens(currentText.trim()),
        });

        // Compute overlap
        const overlap = this.extractOverlap(currentText);
        currentText = overlap;
        chunkStartPage = pageNum;
        activeSectionTempId = pageSecTempId;
      }

      // Split page into natural paragraph segments
      const paragraphs = pageText.split(/\n\n+/);

      for (const para of paragraphs) {
        const cleanPara = para.trim();
        if (!cleanPara) continue;

        // If a single paragraph is larger than maxChunkChars, split it by sentences
        if (cleanPara.length > this.config.maxChunkChars) {
          const sentences = this.splitIntoSentences(cleanPara);
          for (const sentence of sentences) {
            if (currentText.length + sentence.length > this.config.targetChunkChars) {
              if (currentText.length >= this.config.minChunkChars) {
                chunks.push({
                  chunkIndex: currentChunkIndex++,
                  text: currentText.trim(),
                  sectionTempId: activeSectionTempId,
                  pageStart: chunkStartPage,
                  pageEnd: chunkEndPage,
                  characterCount: currentText.trim().length,
                  tokenEstimate: Chunker.estimateTokens(currentText.trim()),
                });

                const overlap = this.extractOverlap(currentText);
                currentText = overlap + (overlap ? ' ' : '') + sentence;
                chunkStartPage = pageNum;
                chunkEndPage = pageNum;
                continue;
              }
            }

            currentText = currentText ? `${currentText} ${sentence}` : sentence;
            chunkEndPage = pageNum;
          }
          continue;
        }

        // Standard paragraph accumulation
        if (currentText.length + cleanPara.length > this.config.targetChunkChars) {
          if (currentText.length >= this.config.minChunkChars) {
            chunks.push({
              chunkIndex: currentChunkIndex++,
              text: currentText.trim(),
              sectionTempId: activeSectionTempId,
              pageStart: chunkStartPage,
              pageEnd: chunkEndPage,
              characterCount: currentText.trim().length,
              tokenEstimate: Chunker.estimateTokens(currentText.trim()),
            });

            const overlap = this.extractOverlap(currentText);
            currentText = overlap ? `${overlap}\n\n${cleanPara}` : cleanPara;
            chunkStartPage = pageNum;
            chunkEndPage = pageNum;
            activeSectionTempId = pageSecTempId;
            continue;
          }
        }

        currentText = currentText ? `${currentText}\n\n${cleanPara}` : cleanPara;
        chunkEndPage = pageNum;
      }
    }

    // Finalize any remaining text
    if (currentText.trim().length > 0) {
      chunks.push({
        chunkIndex: currentChunkIndex++,
        text: currentText.trim(),
        sectionTempId: activeSectionTempId,
        pageStart: chunkStartPage,
        pageEnd: chunkEndPage,
        characterCount: currentText.trim().length,
        tokenEstimate: Chunker.estimateTokens(currentText.trim()),
      });
    }

    return chunks;
  }

  /**
   * Deterministically splits large paragraphs by sentence boundary.
   */
  private splitIntoSentences(text: string): string[] {
    const rawSentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
    if (!rawSentences) return [text];
    return rawSentences.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  /**
   * Deterministically extracts overlap text from the tail of a chunk up to overlapChars.
   */
  private extractOverlap(chunkText: string): string {
    if (this.config.overlapChars <= 0 || chunkText.length <= this.config.overlapChars) {
      return '';
    }

    const tail = chunkText.slice(-this.config.overlapChars);
    // Find first sentence boundary or space in the tail to prevent cutting words
    const spaceIndex = tail.indexOf(' ');
    if (spaceIndex !== -1 && spaceIndex < tail.length - 20) {
      return tail.slice(spaceIndex + 1).trim();
    }
    return tail.trim();
  }
}

export const chunker = new Chunker();
