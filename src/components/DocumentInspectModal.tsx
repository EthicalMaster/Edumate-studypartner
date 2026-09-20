/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { StudyMaterial, DocumentSection, DocumentChunk, DocumentProcessingDetails, MaterialEmbeddingSummary, RetrievedChunkResult } from '../types';
import { materialApi } from '../services/materialApi';
import { retrievalApi } from '../services/retrievalApi';

interface DocumentInspectModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: StudyMaterial | null;
  onReprocessSuccess?: () => void;
  initialTab?: 'sections' | 'chunks' | 'embeddings';
}

export const DocumentInspectModal: React.FC<DocumentInspectModalProps> = ({
  isOpen,
  onClose,
  material,
  onReprocessSuccess,
  initialTab = 'sections',
}) => {
  const [activeTab, setActiveTab] = useState<'sections' | 'chunks' | 'embeddings'>(initialTab);
  const [loading, setLoading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [reEmbedding, setReEmbedding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [details, setDetails] = useState<DocumentProcessingDetails | null>(null);
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [embeddingSummary, setEmbeddingSummary] = useState<MaterialEmbeddingSummary | null>(null);

  // Live Semantic Search Simulator State
  const [searchQuery, setSearchQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<RetrievedChunkResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !material) {
      setDetails(null);
      setSections([]);
      setChunks([]);
      setEmbeddingSummary(null);
      setSearchResults(null);
      setSearchQuery('');
      setError(null);
      return;
    }

    setActiveTab(initialTab);

    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [detailsRes, sectionsRes, chunksRes, embedRes] = await Promise.all([
          materialApi.getProcessingDetails(material.id).catch(() => ({ processing: null })),
          materialApi.getSections(material.id).catch(() => ({ sections: [] })),
          materialApi.getChunks(material.id).catch(() => ({ chunks: [] })),
          retrievalApi.getEmbeddingStatus(material.id).catch(() => ({ embedding: null })),
        ]);

        if (isMounted) {
          setDetails(detailsRes.processing);
          setSections(sectionsRes.sections || []);
          setChunks(chunksRes.chunks || []);
          setEmbeddingSummary(embedRes.embedding);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load document structure.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, material, initialTab]);

  if (!isOpen || !material) return null;

  const handleReprocess = async () => {
    setReprocessing(true);
    setError(null);
    try {
      await materialApi.reprocessMaterial(material.id);
      // Refresh current modal data
      const [detailsRes, sectionsRes, chunksRes, embedRes] = await Promise.all([
        materialApi.getProcessingDetails(material.id),
        materialApi.getSections(material.id),
        materialApi.getChunks(material.id),
        retrievalApi.getEmbeddingStatus(material.id).catch(() => ({ embedding: null })),
      ]);
      setDetails(detailsRes.processing);
      setSections(sectionsRes.sections || []);
      setChunks(chunksRes.chunks || []);
      setEmbeddingSummary(embedRes.embedding);
      if (onReprocessSuccess) {
        onReprocessSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reprocess document.');
    } finally {
      setReprocessing(false);
    }
  };

  const handleReEmbed = async () => {
    setReEmbedding(true);
    setError(null);
    try {
      await retrievalApi.reEmbed(material.id);
      // Refresh embedding status
      const embedRes = await retrievalApi.getEmbeddingStatus(material.id).catch(() => ({ embedding: null }));
      setEmbeddingSummary(embedRes.embedding);
      if (onReprocessSuccess) {
        onReprocessSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to trigger re-embedding.');
    } finally {
      setReEmbedding(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await retrievalApi.search({
        query: searchQuery.trim(),
        materialId: material.id,
        topK,
      });
      setSearchResults(res.results || []);
    } catch (err: any) {
      setSearchError(err.message || 'Semantic search failed.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div
        className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-[#c5c6ce]/40 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#c5c6ce]/30 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#eff4ff] text-[#0051d5] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">schema</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-bold text-[#0b1c30] truncate">{material.title}</h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    material.processingStatus === 'ready'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : material.processingStatus === 'failed'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {material.processingStatus.toUpperCase()}
                </span>
              </div>
              <p className="text-[12px] text-[#75777e] truncate">{material.originalFilename}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReprocess}
              disabled={reprocessing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold bg-[#eff4ff] text-[#0051d5] hover:bg-[#dbe6fd] transition-colors cursor-pointer disabled:opacity-50"
              title="Rerun deterministic document processing"
            >
              <span className={`material-symbols-outlined text-[16px] ${reprocessing ? 'animate-spin' : ''}`}>
                refresh
              </span>
              <span>{reprocessing ? 'Reprocessing...' : 'Reprocess'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-[#75777e] hover:bg-[#eff4ff] hover:text-[#0b1c30] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Structural Metrics Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3.5 bg-slate-50 border-b border-[#c5c6ce]/20 text-[12px]">
          <div className="bg-white p-2.5 rounded-xl border border-[#c5c6ce]/30">
            <span className="text-[#75777e] block text-[11px]">Pages Extracted</span>
            <span className="text-[16px] font-bold text-[#0b1c30]">{details?.pageCount ?? '—'}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-[#c5c6ce]/30">
            <span className="text-[#75777e] block text-[11px]">Sections Detected</span>
            <span className="text-[16px] font-bold text-[#0051d5]">{details?.sectionCount ?? '—'}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-[#c5c6ce]/30">
            <span className="text-[#75777e] block text-[11px]">Knowledge Chunks</span>
            <span className="text-[16px] font-bold text-emerald-700">{details?.chunkCount ?? '—'}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-[#c5c6ce]/30">
            <span className="text-[#75777e] block text-[11px]">Characters Extracted</span>
            <span className="text-[16px] font-bold text-[#44474d]">
              {details?.totalCharacters ? details.totalCharacters.toLocaleString() : '—'}
            </span>
          </div>
        </div>

        {/* Error Notification (if failed) */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[12px] flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-[#c5c6ce]/20">
          <button
            onClick={() => setActiveTab('sections')}
            className={`pb-2.5 px-3 text-[13px] font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'sections'
                ? 'border-[#0051d5] text-[#0051d5]'
                : 'border-transparent text-[#75777e] hover:text-[#0b1c30]'
            }`}
          >
            Detected Outline & Sections ({sections.length})
          </button>
          <button
            onClick={() => setActiveTab('chunks')}
            className={`pb-2.5 px-3 text-[13px] font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'chunks'
                ? 'border-[#0051d5] text-[#0051d5]'
                : 'border-transparent text-[#75777e] hover:text-[#0b1c30]'
            }`}
          >
            Structured Chunks (RAG-Ready) ({chunks.length})
          </button>
          <button
            onClick={() => setActiveTab('embeddings')}
            className={`pb-2.5 px-3 text-[13px] font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'embeddings'
                ? 'border-[#0051d5] text-[#0051d5]'
                : 'border-transparent text-[#75777e] hover:text-[#0b1c30]'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">hub</span>
            Vector Embeddings & Retrieval ({embeddingSummary?.completedChunks ?? 0}/{embeddingSummary?.totalChunks ?? chunks.length})
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="w-8 h-8 border-3 border-[#0051d5] border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-[13px] text-[#44474d] font-medium">Loading document intelligence structure...</p>
            </div>
          ) : activeTab === 'embeddings' ? (
            <div className="space-y-4">
              {/* Embedding System Overview Card */}
              <div className="p-4 rounded-2xl bg-white border border-[#c5c6ce]/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#c5c6ce]/20 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[14px] text-[#0b1c30]">Vector Embedding Index</span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          embeddingSummary?.embeddingStatus === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : embeddingSummary?.embeddingStatus === 'processing'
                            ? 'bg-blue-100 text-blue-800 animate-pulse'
                            : embeddingSummary?.embeddingStatus === 'failed'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {embeddingSummary?.embeddingStatus ? embeddingSummary.embeddingStatus.toUpperCase() : 'PENDING'}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#75777e] mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                          embeddingSummary?.isFallback || embeddingSummary?.model === 'TEST FALLBACK'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        }`}
                      >
                        Engine: {embeddingSummary?.model || 'BAAI/bge-small-en-v1.5'}
                      </span>
                      <span>• 384-dimensional dense vectors • Cosine metric</span>
                    </p>
                  </div>

                  <button
                    onClick={handleReEmbed}
                    disabled={reEmbedding || embeddingSummary?.embeddingStatus === 'processing'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold bg-[#eff4ff] text-[#0051d5] hover:bg-[#dbe6fd] transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <span className={`material-symbols-outlined text-[16px] ${reEmbedding ? 'animate-spin' : ''}`}>
                      sync
                    </span>
                    <span>{reEmbedding ? 'Re-embedding...' : 'Re-generate Vectors'}</span>
                  </button>
                </div>

                {(embeddingSummary?.isFallback || embeddingSummary?.model === 'TEST FALLBACK') && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[12px] flex items-start gap-2">
                    <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0">science</span>
                    <div>
                      <strong>Test Mode Fallback Active:</strong> Vectors are generated using the deterministic semantic-hash test engine (<code>EMBEDDING_ALLOW_TEST_FALLBACK=true</code>). Explicitly recorded and reported as <code>TEST FALLBACK</code>.
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                    <span className="text-[#75777e] block text-[11px]">Indexed Vectors</span>
                    <span className="text-[15px] font-bold text-emerald-700">
                      {embeddingSummary?.completedChunks ?? 0} / {embeddingSummary?.totalChunks ?? chunks.length}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                    <span className="text-[#75777e] block text-[11px]">Embedding Dimension</span>
                    <span className="text-[15px] font-bold text-[#0b1c30]">
                      {embeddingSummary?.dimension ?? 384}d
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                    <span className="text-[#75777e] block text-[11px]">Lifecycle Boundary</span>
                    <span className="text-[15px] font-bold text-[#0051d5]">material_id scoped</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                    <span className="text-[#75777e] block text-[11px]">Isolation Level</span>
                    <span className="text-[15px] font-bold text-purple-700">Student Tenant</span>
                  </div>
                </div>

                {embeddingSummary?.embeddingError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[12px]">
                    <strong>Embedding Notice:</strong> {embeddingSummary.embeddingError}
                  </div>
                )}
              </div>

              {/* Live Semantic Search Simulator */}
              <div className="p-4 rounded-2xl bg-white border border-[#c5c6ce]/30 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13.5px] font-bold text-[#0b1c30]">Live Semantic Retrieval Test</h4>
                  <span className="text-[11px] text-[#75777e]">Tests Qdrant vector retrieval with Cosine scoring</span>
                </div>

                <form onSubmit={handleSearch} className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Ask a question or enter keywords (e.g., 'What are the main cell organelles?')..."
                      className="flex-1 px-3.5 py-2 rounded-xl border border-[#c5c6ce] text-[13px] focus:outline-hidden focus:border-[#0051d5] focus:ring-1 focus:ring-[#0051d5]"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={topK}
                        onChange={(e) => setTopK(Number(e.target.value))}
                        className="px-2.5 py-2 rounded-xl border border-[#c5c6ce] text-[12.5px] bg-white text-[#44474d]"
                        title="Top K retrieved chunks"
                      >
                        <option value={3}>Top 3</option>
                        <option value={5}>Top 5</option>
                        <option value={10}>Top 10</option>
                      </select>
                      <button
                        type="submit"
                        disabled={isSearching || !searchQuery.trim()}
                        className="px-4 py-2 rounded-xl bg-[#0051d5] text-white font-bold text-[13px] hover:bg-[#0040a8] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                      >
                        <span className={`material-symbols-outlined text-[16px] ${isSearching ? 'animate-spin' : ''}`}>
                          {isSearching ? 'progress_activity' : 'search'}
                        </span>
                        <span>{isSearching ? 'Retrieving...' : 'Search Vectors'}</span>
                      </button>
                    </div>
                  </div>
                </form>

                {searchError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[12px]">
                    {searchError}
                  </div>
                )}

                {/* Search Results Display */}
                {searchResults !== null && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-[12px] text-[#75777e] border-t border-[#c5c6ce]/20 pt-3">
                      <span>
                        Retrieved <strong>{searchResults.length}</strong> knowledge chunk(s) for "{searchQuery}"
                      </span>
                      <span>Ranked by Cosine Similarity</span>
                    </div>

                    {searchResults.length === 0 ? (
                      <div className="py-8 text-center text-[#75777e] text-[12.5px] bg-slate-50 rounded-xl border border-dashed border-[#c5c6ce]/60">
                        No matching chunks found above threshold.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {searchResults.map((hit, idx) => (
                          <div
                            key={hit.chunkId || idx}
                            className="p-3.5 rounded-xl bg-slate-50 border border-[#c5c6ce]/40 space-y-2 hover:border-[#0051d5]/50 transition-colors"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#0051d5] bg-blue-100 px-2 py-0.5 rounded-md">
                                  #{idx + 1} Match
                                </span>
                                <span className="font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                                  Score: {(hit.score * 100).toFixed(1)}% ({hit.score.toFixed(4)})
                                </span>
                                <span className="text-[#44474d] font-medium">
                                  {hit.pageStart === hit.pageEnd ? `Page ${hit.pageStart}` : `Pages ${hit.pageStart}–${hit.pageEnd}`}
                                </span>
                              </div>
                              {hit.sectionTitle && (
                                <span className="text-[#75777e] truncate max-w-xs" title={hit.sectionTitle}>
                                  § {hit.sectionTitle}
                                </span>
                              )}
                            </div>

                            <p className="text-[12.5px] text-[#2c3038] font-mono leading-relaxed bg-white p-3 rounded-lg border border-slate-200/60 whitespace-pre-wrap">
                              {hit.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'sections' ? (
            sections.length === 0 ? (
              <div className="py-12 text-center text-[#75777e] text-[13px]">
                No structured sections available for this document.
              </div>
            ) : (
              <div className="space-y-2">
                {sections.map((sec, i) => (
                  <div
                    key={sec.id || i}
                    className="p-3.5 rounded-2xl bg-white border border-[#c5c6ce]/30 hover:border-[#0051d5]/40 transition-colors"
                    style={{ marginLeft: `${Math.max(0, (sec.headingLevel - 1) * 16)}px` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            sec.sectionType === 'chapter'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : sec.sectionType === 'topic'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : sec.sectionType === 'subsection'
                              ? 'bg-slate-100 text-slate-700 border border-slate-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {sec.sectionType}
                        </span>
                        <h4 className="text-[13.5px] font-bold text-[#0b1c30] truncate">{sec.title}</h4>
                      </div>
                      <span className="text-[11px] font-mono text-[#75777e] shrink-0">
                        {sec.pageStart === sec.pageEnd ? `Page ${sec.pageStart}` : `Pages ${sec.pageStart}–${sec.pageEnd}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : chunks.length === 0 ? (
            <div className="py-12 text-center text-[#75777e] text-[13px]">
              No chunks generated for this document yet.
            </div>
          ) : (
            <div className="space-y-3">
              {chunks.map((chunk) => (
                <div
                  key={chunk.id || chunk.chunkIndex}
                  className="p-4 rounded-2xl bg-white border border-[#c5c6ce]/30 hover:border-[#0051d5]/40 transition-all space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] text-[#75777e] border-b border-[#c5c6ce]/20 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#0051d5] bg-[#eff4ff] px-2 py-0.5 rounded-md">
                        Chunk #{chunk.chunkIndex + 1}
                      </span>
                      <span>
                        {chunk.pageStart === chunk.pageEnd
                          ? `Page ${chunk.pageStart}`
                          : `Pages ${chunk.pageStart}–${chunk.pageEnd}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 font-mono">
                      <span>{chunk.characterCount} chars</span>
                      <span>•</span>
                      <span>~{chunk.tokenEstimate} tokens</span>
                    </div>
                  </div>
                  <p className="text-[12.5px] text-[#2c3038] font-mono leading-relaxed whitespace-pre-wrap bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                    {chunk.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#c5c6ce]/30 bg-slate-50 flex items-center justify-between text-[12px] text-[#75777e]">
          <span>Phase 6 Deterministic Intelligence • Source Traceability Guaranteed</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white border border-[#c5c6ce] text-[#0b1c30] font-bold hover:bg-slate-100 cursor-pointer shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
