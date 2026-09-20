/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  characterCount: number;
}

export type SectionType = 'document' | 'chapter' | 'section' | 'topic' | 'subsection';

export interface ExtractedSection {
  tempId: string; // temporary identifier to resolve parent-child hierarchy before DB insertion
  parentTempId: string | null;
  sectionType: SectionType;
  title: string;
  sectionOrder: number;
  pageStart: number;
  pageEnd: number;
  headingLevel: number;
}

export interface ExtractedChunk {
  chunkIndex: number;
  text: string;
  sectionTempId: string | null;
  pageStart: number;
  pageEnd: number;
  characterCount: number;
  tokenEstimate: number;
}

export interface ProcessedDocument {
  pages: ExtractedPage[];
  sections: ExtractedSection[];
  chunks: ExtractedChunk[];
  totalPages: number;
  totalCharacters: number;
  totalChunks: number;
}

export interface DocumentPageRecord {
  id: string;
  material_id: string;
  page_number: number;
  text: string;
  character_count: number;
  created_at: Date;
}

export interface DocumentSectionRecord {
  id: string;
  material_id: string;
  parent_section_id: string | null;
  section_type: SectionType;
  title: string;
  section_order: number;
  page_start: number;
  page_end: number;
  heading_level: number;
  created_at: Date;
}

export interface DocumentChunkRecord {
  id: string;
  material_id: string;
  section_id: string | null;
  chunk_index: number;
  text: string;
  page_start: number;
  page_end: number;
  character_count: number;
  token_estimate: number;
  created_at: Date;
}

export interface DocumentProcessingDetails {
  materialId: string;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  error: string | null;
  pageCount: number;
  sectionCount: number;
  chunkCount: number;
  totalCharacters: number;
  updatedAt: string;
}
