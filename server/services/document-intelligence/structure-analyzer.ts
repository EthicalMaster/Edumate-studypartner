/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtractedPage, ExtractedSection, SectionType } from './types.js';

interface HeadingCandidate {
  rawLine: string;
  title: string;
  sectionType: SectionType;
  headingLevel: number;
  pageNumber: number;
  lineIndex: number;
}

export class StructureAnalyzer {
  /**
   * Deterministically analyzes extracted pages to detect document hierarchy
   * (chapters, sections, subsections, and topics).
   */
  analyze(pages: ExtractedPage[], isMarkdown: boolean = false): ExtractedSection[] {
    if (!pages || pages.length === 0) {
      return [];
    }

    const maxPage = pages[pages.length - 1].pageNumber || 1;
    const candidates: HeadingCandidate[] = [];

    for (const page of pages) {
      const lines = page.text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const heading = isMarkdown
          ? this.detectMarkdownHeading(line, page.pageNumber, i)
          : this.detectStandardHeading(line, page.pageNumber, i, lines);

        if (heading) {
          candidates.push(heading);
        }
      }
    }

    // If no headings could be deterministically detected, return fallback document structure
    if (candidates.length === 0) {
      return [
        {
          tempId: 'sec-0',
          parentTempId: null,
          sectionType: 'document',
          title: 'Document Content',
          sectionOrder: 0,
          pageStart: 1,
          pageEnd: maxPage,
          headingLevel: 1,
        },
      ];
    }

    // Build hierarchy and calculate page ranges
    const sections: ExtractedSection[] = [];
    const parentStack: { tempId: string; headingLevel: number }[] = [];

    for (let idx = 0; idx < candidates.length; idx++) {
      const candidate = candidates[idx];
      const tempId = `sec-${idx}`;

      // Pop stack until we find a parent with a strictly lower heading level
      while (parentStack.length > 0 && parentStack[parentStack.length - 1].headingLevel >= candidate.headingLevel) {
        parentStack.pop();
      }

      const parentTempId = parentStack.length > 0 ? parentStack[parentStack.length - 1].tempId : null;

      // Determine pageEnd based on the start of the next section
      let pageEnd = maxPage;
      if (idx < candidates.length - 1) {
        const nextCandidate = candidates[idx + 1];
        pageEnd = Math.max(candidate.pageNumber, nextCandidate.pageNumber);
      }

      sections.push({
        tempId,
        parentTempId,
        sectionType: candidate.sectionType,
        title: candidate.title,
        sectionOrder: idx,
        pageStart: candidate.pageNumber,
        pageEnd,
        headingLevel: candidate.headingLevel,
      });

      parentStack.push({ tempId, headingLevel: candidate.headingLevel });
    }

    return sections;
  }

  /**
   * Deterministic Markdown heading detection (#, ##, ###, ####).
   */
  private detectMarkdownHeading(line: string, pageNumber: number, lineIndex: number): HeadingCandidate | null {
    const mdMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (!mdMatch) return null;

    const hashes = mdMatch[1];
    const headingLevel = hashes.length;
    const title = mdMatch[2].trim();

    if (!title) return null;

    let sectionType: SectionType = 'section';
    if (headingLevel === 1) {
      sectionType = /chapter|unit|module/i.test(title) ? 'chapter' : 'document';
    } else if (headingLevel === 2) {
      sectionType = /topic/i.test(title) ? 'topic' : 'section';
    } else if (headingLevel >= 3) {
      sectionType = 'subsection';
    }

    return {
      rawLine: line,
      title,
      sectionType,
      headingLevel,
      pageNumber,
      lineIndex,
    };
  }

  /**
   * Deterministic heading detection for PDF and Plain Text.
   * Checks numbering patterns, explicit keywords, and short standalone title lines.
   */
  private detectStandardHeading(
    line: string,
    pageNumber: number,
    lineIndex: number,
    lines: string[]
  ): HeadingCandidate | null {
    // 1. Chapter / Unit / Module pattern
    // e.g. "Chapter 1: Electrostatics", "CHAPTER IV", "Unit 2 - Wave Optics", "Module 3: Calculus"
    const chapterMatch = line.match(/^(chapter|unit|module)\s+([0-9ivxlcdm]+|\w+)[\s:.-]*(.*)$/i);
    if (chapterMatch) {
      const label = `${chapterMatch[1]} ${chapterMatch[2]}`.trim();
      const rest = chapterMatch[3]?.trim();
      const title = rest ? `${label}: ${rest}` : label;
      return {
        rawLine: line,
        title,
        sectionType: 'chapter',
        headingLevel: 1,
        pageNumber,
        lineIndex,
      };
    }

    // 2. Explicit Topic pattern
    // e.g. "Topic: Gauss's Law", "TOPIC 2.1: Surface Integrals"
    const topicMatch = line.match(/^topic[\s:.-]+(.*)$/i);
    if (topicMatch) {
      const title = topicMatch[1].trim() || line;
      return {
        rawLine: line,
        title: title.length > 255 ? title.slice(0, 252) + '...' : title,
        sectionType: 'topic',
        headingLevel: 2,
        pageNumber,
        lineIndex,
      };
    }

    // 3. Hierarchical Numbering patterns:
    // e.g. "1.1.2 Coulomb Force" -> subsection (level 3)
    const subSubSecMatch = line.match(/^(\d+\.\d+\.\d+)[\s.-]+(.+)$/);
    if (subSubSecMatch) {
      const title = `${subSubSecMatch[1]} ${subSubSecMatch[2].trim()}`;
      return {
        rawLine: line,
        title: title.slice(0, 255),
        sectionType: 'subsection',
        headingLevel: 3,
        pageNumber,
        lineIndex,
      };
    }

    // e.g. "1.1 Electric Field Lines" -> section (level 2)
    const subSecMatch = line.match(/^(\d+\.\d+)[\s.-]+(.+)$/);
    if (subSecMatch) {
      const title = `${subSecMatch[1]} ${subSecMatch[2].trim()}`;
      return {
        rawLine: line,
        title: title.slice(0, 255),
        sectionType: 'section',
        headingLevel: 2,
        pageNumber,
        lineIndex,
      };
    }

    // e.g. "1. Introduction to Electromagnetism" -> chapter/major section (level 1)
    const numSecMatch = line.match(/^(\d+)[\.\)]\s+([A-Z][^.!?\n]{2,80})$/);
    if (numSecMatch && numSecMatch[2].length <= 80) {
      const title = `${numSecMatch[1]}. ${numSecMatch[2].trim()}`;
      return {
        rawLine: line,
        title: title.slice(0, 255),
        sectionType: 'section',
        headingLevel: 2,
        pageNumber,
        lineIndex,
      };
    }

    // 4. Standalone Short Uppercase / Title-Case Header Line
    // Criteria:
    // - Short length (between 4 and 65 characters)
    // - Not ending in a full stop / period
    // - Either ALL UPPERCASE or Title Case
    // - Surrounded by blank lines or start of page
    if (line.length >= 4 && line.length <= 65 && !line.endsWith('.') && !line.endsWith(',')) {
      const isAllUpper = line === line.toUpperCase() && /[A-Z]/.test(line);
      const isTitleCase = /^[A-Z][a-zA-Z0-9\s:,\-–—()]{3,65}$/.test(line) && !line.includes('  ');
      
      const prevLineBlank = lineIndex === 0 || lines[lineIndex - 1].trim() === '';
      const nextLineBlank = lineIndex === lines.length - 1 || lines[lineIndex + 1].trim() === '';

      if (prevLineBlank && (isAllUpper || (isTitleCase && nextLineBlank))) {
        // Avoid common non-header patterns (e.g. Page numbers, Figure captions)
        if (!/^(page\s+\d+|figure\s+\d+|table\s+\d+|ref\.|references)/i.test(line)) {
          return {
            rawLine: line,
            title: line,
            sectionType: isAllUpper ? 'chapter' : 'section',
            headingLevel: isAllUpper ? 1 : 2,
            pageNumber,
            lineIndex,
          };
        }
      }
    }

    return null;
  }
}

export const structureAnalyzer = new StructureAnalyzer();
