/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { StudyMaterial, DocumentSection, DocumentChunk, DocumentProcessingDetails } from '../types';
import { materialApi } from '../services/materialApi';

interface DocumentInspectModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: StudyMaterial | null;
  onReprocessSuccess?: () => void;
}

export const DocumentInspectModal: React.FC<DocumentInspectModalProps> = ({
  isOpen,
  onClose,
  material,
  onReprocessSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'sections' | 'chunks'>('sections');
  const [loading, setLoading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [details, setDetails] = useState<DocumentProcessingDetails | null>(null);
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);

  useEffect(() => {
    if (!isOpen || !material) {
      setDetails(null);
      setSections([]);
      setChunks([]);
      setError(null);
      return;
    }

    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [detailsRes, sectionsRes, chunksRes] = await Promise.all([
          materialApi.getProcessingDetails(material.id).catch(() => ({ processing: null })),
          materialApi.getSections(material.id).catch(() => ({ sections: [] })),
          materialApi.getChunks(material.id).catch(() => ({ chunks: [] })),
        ]);

        if (isMounted) {
          setDetails(detailsRes.processing);
          setSections(sectionsRes.sections || []);
          setChunks(chunksRes.chunks || []);
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
  }, [isOpen, material]);

  if (!isOpen || !material) return null;

  const handleReprocess = async () => {
    setReprocessing(true);
    setError(null);
    try {
      await materialApi.reprocessMaterial(material.id);
      // Refresh current modal data
      const [detailsRes, sectionsRes, chunksRes] = await Promise.all([
        materialApi.getProcessingDetails(material.id),
        materialApi.getSections(material.id),
        materialApi.getChunks(material.id),
      ]);
      setDetails(detailsRes.processing);
      setSections(sectionsRes.sections || []);
      setChunks(chunksRes.chunks || []);
      if (onReprocessSuccess) {
        onReprocessSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reprocess document.');
    } finally {
      setReprocessing(false);
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
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="w-8 h-8 border-3 border-[#0051d5] border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-[13px] text-[#44474d] font-medium">Loading document intelligence structure...</p>
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
