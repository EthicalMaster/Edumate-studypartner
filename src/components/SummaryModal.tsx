/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { materialApi } from '../services/materialApi';
import { quizApi } from '../services/quizApi';
import type { StudyMaterial, DocumentSection, QuestionBankMeta } from '../types';

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  onStartQuiz?: () => void;
  onPracticeFlashcards?: () => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({
  isOpen,
  onClose,
  title = 'AI Study Summary & Key Takeaways',
  onStartQuiz,
  onPracticeFlashcards,
}) => {
  const [sourceType, setSourceType] = useState<'materials' | 'curriculum'>('materials');
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [loadingSections, setLoadingSections] = useState<boolean>(false);

  // Curriculum state
  const [meta, setMeta] = useState<QuestionBankMeta | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [matRes, metaRes] = await Promise.all([
          materialApi.getMaterials().catch(() => ({ materials: [] })),
          quizApi.getQuestionBankMeta().catch(() => null),
        ]);

        if (isMounted) {
          const readyMaterials = (matRes.materials || []).filter((m) => m.processingStatus === 'ready');
          setMaterials(readyMaterials);
          setMeta(metaRes);

          if (readyMaterials.length > 0) {
            setSourceType('materials');
            setSelectedMaterialId(readyMaterials[0].id);
            fetchSections(readyMaterials[0].id);
          } else if (metaRes && metaRes.subjects && metaRes.subjects.length > 0) {
            setSourceType('curriculum');
            const sub = metaRes.subjects[0];
            setSelectedSubject(sub.name);
            if (sub.topics && sub.topics.length > 0) {
              setSelectedTopic(sub.topics[0]);
            }
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const fetchSections = async (matId: string) => {
    try {
      setLoadingSections(true);
      const res = await materialApi.getSections(matId);
      setSections(res.sections || []);
    } catch {
      setSections([]);
    } finally {
      setLoadingSections(false);
    }
  };

  const handleMaterialChange = (matId: string) => {
    setSelectedMaterialId(matId);
    fetchSections(matId);
  };

  const handleSubjectChange = (subName: string) => {
    setSelectedSubject(subName);
    const sub = meta?.subjects.find((s) => s.name === subName);
    if (sub && sub.topics && sub.topics.length > 0) {
      setSelectedTopic(sub.topics[0]);
    } else {
      setSelectedTopic('');
    }
  };

  if (!isOpen) return null;

  const currentMaterial = materials.find((m) => m.id === selectedMaterialId);
  const activeSubjectObj = meta?.subjects.find((s) => s.name === selectedSubject);

  const handleCopy = () => {
    let textToCopy = '';
    if (sourceType === 'materials' && currentMaterial) {
      textToCopy = `${currentMaterial.title} (${currentMaterial.subject})\n\n` +
        sections.map((s, idx) => `${idx + 1}. ${s.title}\n${s.summary || 'Extracted section from document.'}`).join('\n\n');
    } else if (selectedTopic) {
      textToCopy = `${selectedSubject} - ${selectedTopic}\nAvailable Question Bank challenges: ${activeSubjectObj?.total_questions || 0}`;
    }

    if (textToCopy) {
      navigator.clipboard?.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-[#c5c6ce]/50 max-h-[88vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#c5c6ce]/30">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0051d5] text-[11px] font-bold mb-1.5">
              <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
              <span>Structured Study Takeaways & Summaries</span>
            </div>
            <h3 className="text-[20px] font-bold text-[#0b1c30]">{title}</h3>
            <p className="text-[13px] text-[#44474d] mt-0.5">
              Synthesized directly from your verified course documents and curriculum question bank.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#75777e] hover:text-[#0b1c30] p-1.5 rounded-xl hover:bg-[#eff4ff] transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Source Selector (Materials vs Curriculum) */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pb-3 border-b border-[#c5c6ce]/30">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSourceType('materials')}
              className={`px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                sourceType === 'materials'
                  ? 'bg-[#0051d5] text-white shadow-xs'
                  : 'text-[#44474d] hover:bg-[#eff4ff]'
              }`}
            >
              My Documents ({materials.length})
            </button>
            <button
              onClick={() => setSourceType('curriculum')}
              className={`px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                sourceType === 'curriculum'
                  ? 'bg-[#0051d5] text-white shadow-xs'
                  : 'text-[#44474d] hover:bg-[#eff4ff]'
              }`}
            >
              Academic Curriculum
            </button>
          </div>

          {/* Document / Subject Dropdown */}
          {sourceType === 'materials' && materials.length > 0 && (
            <select
              value={selectedMaterialId}
              onChange={(e) => handleMaterialChange(e.target.value)}
              className="bg-[#eff4ff] border border-[#c5c6ce]/40 rounded-xl px-3 py-1.5 text-[12px] text-[#0b1c30] font-semibold outline-none max-w-xs truncate"
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} ({m.subject})
                </option>
              ))}
            </select>
          )}

          {sourceType === 'curriculum' && meta && (
            <div className="flex items-center gap-2">
              <select
                value={selectedSubject}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="bg-[#eff4ff] border border-[#c5c6ce]/40 rounded-xl px-3 py-1.5 text-[12px] text-[#0b1c30] font-semibold outline-none"
              >
                {meta.subjects.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>

              {activeSubjectObj && (
                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  className="bg-[#eff4ff] border border-[#c5c6ce]/40 rounded-xl px-3 py-1.5 text-[12px] text-[#0b1c30] font-semibold outline-none max-w-[180px] truncate"
                >
                  {activeSubjectObj.topics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 text-[13px] text-[#334155] leading-relaxed pr-2">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-8 h-8 border-3 border-[#0051d5] border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-[13px] text-[#75777e]">Loading structured study takeaways...</p>
            </div>
          ) : sourceType === 'materials' ? (
            materials.length === 0 ? (
              <div className="py-12 text-center flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-dashed border-[#c5c6ce]">
                <span className="material-symbols-outlined text-[32px] text-[#0051d5] mb-2">
                  upload_file
                </span>
                <p className="font-bold text-[#0b1c30] text-[15px]">No Processed Documents Yet</p>
                <p className="text-[12px] text-[#75777e] mt-1 max-w-sm">
                  Upload lecture notes, textbooks, or research papers in the Study Kits tab to extract structured outlines and AI summaries.
                </p>
              </div>
            ) : loadingSections ? (
              <div className="py-8 text-center text-[#75777e] text-[13px]">
                Loading extracted sections...
              </div>
            ) : sections.length === 0 ? (
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-[13px]">
                No structured sections found for this document. Try re-processing in Study Kits.
              </div>
            ) : (
              sections.map((sec, idx) => (
                <div key={sec.id || idx} className="bg-[#eff4ff] p-4 rounded-2xl border border-[#dbe1ff]">
                  <h4 className="font-bold text-[#0051d5] text-[14px] mb-1.5 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    {idx + 1}. {sec.title}
                  </h4>
                  <p className="text-[#334155] leading-relaxed">
                    {sec.summary || 'Summary generated during document analysis.'}
                  </p>
                  {sec.pageStart && (
                    <span className="inline-block mt-2 text-[11px] font-semibold text-[#75777e]">
                      Pages {sec.pageStart} - {sec.pageEnd || sec.pageStart}
                    </span>
                  )}
                </div>
              ))
            )
          ) : (
            /* Curriculum Topic View */
            <div className="space-y-4">
              <div className="bg-[#eff4ff] p-5 rounded-2xl border border-[#dbe1ff]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-[#0051d5] shadow-2xs">
                    {selectedSubject}
                  </span>
                  <span className="text-[12px] font-semibold text-[#0051d5]">
                    {activeSubjectObj?.total_questions || 0} Questions Available in Curriculum
                  </span>
                </div>
                <h4 className="text-[16px] font-bold text-[#0b1c30]">{selectedTopic || 'Selected Curriculum Topic'}</h4>
                <p className="text-[13px] text-[#44474d] mt-1">
                  This core curriculum unit is calibrated to your academic stage. Practice through adaptive quizzes and flashcards to build high-conviction retention.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-[12px] text-[#44474d] flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-[#0051d5]">
                  psychology
                </span>
                <span>
                  All performance data from testing this topic feeds directly into your personal Bayesian Knowledge Tracing model.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-[#c5c6ce]/30">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#c5c6ce]/60 text-[#44474d] hover:bg-slate-50 text-[12px] font-semibold transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">
              {copied ? 'check' : 'content_copy'}
            </span>
            <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
          </button>

          <div className="flex items-center gap-2">
            {onPracticeFlashcards && (
              <button
                onClick={() => {
                  onClose();
                  onPracticeFlashcards();
                }}
                className="px-4 py-2 rounded-xl bg-[#eff4ff] text-[#0051d5] hover:bg-[#dbe1ff] text-[13px] font-bold transition-all cursor-pointer"
              >
                Practice Flashcards
              </button>
            )}

            {onStartQuiz && (
              <button
                onClick={() => {
                  onClose();
                  onStartQuiz();
                }}
                className="px-4 py-2 rounded-xl bg-[#0051d5] text-white hover:bg-[#316bf3] text-[13px] font-bold transition-all shadow-xs cursor-pointer"
              >
                Take Quiz
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
