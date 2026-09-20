/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { StudyKit, ActiveNavTab, StudyMaterial } from '../../types';
import { materialApi } from '../../services/materialApi';

interface StudyKitsViewProps {
  studyKits: StudyKit[];
  onSelectKit: (kit: StudyKit) => void;
  onNavigate: (tab: ActiveNavTab) => void;
  onOpenUpload: () => void;
  onOpenSummary: () => void;
  onPlayAudioTrack: () => void;
  materialsRefreshTrigger?: number;
}

export const StudyKitsView: React.FC<StudyKitsViewProps> = ({
  studyKits,
  onNavigate,
  onOpenUpload,
  onOpenSummary,
  materialsRefreshTrigger = 0,
}) => {
  // Tab within this view: 'materials' (Phase 5 real documents) or 'curriculum' (Study Kits)
  const [activeSubTab, setActiveSubTab] = useState<'materials' | 'curriculum'>('materials');

  // Real Materials State
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(true);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [materialToDelete, setMaterialToDelete] = useState<StudyMaterial | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filters for Materials
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [searchFilter, setSearchFilter] = useState('');

  const subjects = ['All', 'Physics', 'Mathematics', 'Chemistry', 'Computer Science', 'General Studies'];

  // Load Real Materials
  const fetchMaterials = useCallback(async () => {
    setIsLoadingMaterials(true);
    setMaterialsError(null);
    try {
      const res = await materialApi.getMaterials();
      setMaterials(res.materials || []);
    } catch (err: any) {
      console.error('Failed to load materials:', err);
      setMaterialsError(err.message || 'Could not load your study materials.');
    } finally {
      setIsLoadingMaterials(false);
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials, materialsRefreshTrigger]);

  // Handle Delete Material
  const handleDeleteConfirm = async () => {
    if (!materialToDelete) return;
    setIsDeleting(true);
    try {
      await materialApi.deleteMaterial(materialToDelete.id);
      setMaterials((prev) => prev.filter((m) => m.id !== materialToDelete.id));
      setMaterialToDelete(null);
    } catch (err: any) {
      alert(err.message || 'Failed to delete material');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered Materials
  const filteredMaterials = materials.filter((m) => {
    const matchSubject = selectedSubject === 'All' || m.subject.toLowerCase() === selectedSubject.toLowerCase();
    const matchStatus = selectedStatus === 'All' || m.processingStatus.toLowerCase() === selectedStatus.toLowerCase();
    const matchSearch =
      m.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.originalFilename.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.topic.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.subject.toLowerCase().includes(searchFilter.toLowerCase());
    return matchSubject && matchStatus && matchSearch;
  });

  // Filtered Curriculum Kits
  const filteredKits = studyKits.filter((kit) => {
    const matchSubject = selectedSubject === 'All' || kit.subject === selectedSubject;
    const matchSearch =
      kit.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      kit.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
      kit.tags.some((t) => t.toLowerCase().includes(searchFilter.toLowerCase()));
    return matchSubject && matchSearch;
  });

  // Format File Size
  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format Date
  const formatDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  };

  // Total storage calculated
  const totalStorageBytes = materials.reduce((acc, m) => acc + (m.fileSizeBytes || 0), 0);

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-bold text-[#0b1c30] tracking-tight">
            Study Materials & Knowledge Base
          </h2>
          <p className="text-[13px] text-[#44474d] mt-0.5">
            Store, organize, and access course documents in your private student repository.
          </p>
        </div>

        <button
          onClick={onOpenUpload}
          className="inline-flex items-center gap-2 bg-[#0051d5] hover:bg-[#316bf3] text-white px-4 py-2.5 rounded-xl text-[13px] font-bold shadow-xs transition-all cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[20px]">upload_file</span>
          <span>Upload Study Material</span>
        </button>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#c5c6ce]/40 pb-2">
        <button
          onClick={() => setActiveSubTab('materials')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
            activeSubTab === 'materials'
              ? 'bg-[#0051d5] text-white shadow-xs'
              : 'text-[#44474d] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">folder</span>
          <span>My Uploaded Materials</span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-bold ${
              activeSubTab === 'materials' ? 'bg-white/20 text-white' : 'bg-[#eff4ff] text-[#0051d5]'
            }`}
          >
            {materials.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('curriculum')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${
            activeSubTab === 'curriculum'
              ? 'bg-[#0051d5] text-white shadow-xs'
              : 'text-[#44474d] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">auto_stories</span>
          <span>Curriculum Modules</span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-bold ${
              activeSubTab === 'curriculum' ? 'bg-white/20 text-white' : 'bg-[#eff4ff] text-[#0051d5]'
            }`}
          >
            {studyKits.length}
          </span>
        </button>
      </div>

      {/* Filters & Search Row */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-[#c5c6ce]/30 shadow-xs">
        {/* Subject Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {subjects.map((sub) => (
            <button
              key={sub}
              onClick={() => setSelectedSubject(sub)}
              className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedSubject === sub
                  ? 'bg-[#0051d5] text-white shadow-xs'
                  : 'text-[#44474d] hover:bg-[#eff4ff]'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-[#eff4ff] px-3.5 py-1.5 rounded-xl md:w-72">
          <span className="material-symbols-outlined text-[#75777e] text-[18px]">search</span>
          <input
            type="text"
            placeholder="Search title, topic, or file..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="bg-transparent border-none outline-none text-[13px] text-[#0b1c30] placeholder:text-[#75777e] w-full"
          />
          {searchFilter && (
            <button onClick={() => setSearchFilter('')} className="text-[#75777e] hover:text-[#0b1c30]">
              <span className="material-symbols-outlined text-[16px]">clear</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: REAL UPLOADED STUDY MATERIALS (PHASE 5) */}
      {/* ========================================================================= */}
      {activeSubTab === 'materials' && (
        <div className="space-y-4">
          {/* Quick Metrics & Architecture Notice */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-[#c5c6ce]/40 px-4 py-3 rounded-2xl text-[12px] text-[#44474d]">
            <div className="flex items-center gap-4">
              <span>
                <strong>{materials.length}</strong> Document{materials.length === 1 ? '' : 's'} Stored
              </span>
              <span>•</span>
              <span>
                <strong>{formatFileSize(totalStorageBytes)}</strong> Total Storage
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>PostgreSQL & Storage Boundary Isolated</span>
              <button
                onClick={fetchMaterials}
                title="Refresh library"
                className="ml-2 text-[#0051d5] hover:text-[#316bf3] p-1 rounded-lg hover:bg-white"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isLoadingMaterials && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 border-3 border-[#0051d5] border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-[13px] text-[#44474d] font-medium">Loading your study repository...</p>
            </div>
          )}

          {/* Error State */}
          {!isLoadingMaterials && materialsError && (
            <div className="p-5 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3">
              <span className="material-symbols-outlined text-[32px] text-red-600">error</span>
              <p className="text-[14px] font-bold text-red-800">{materialsError}</p>
              <button
                onClick={fetchMaterials}
                className="px-4 py-2 bg-white text-red-700 border border-red-300 rounded-xl text-[12px] font-bold hover:bg-red-50 cursor-pointer shadow-xs"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isLoadingMaterials && !materialsError && filteredMaterials.length === 0 && (
            <div className="bg-white rounded-3xl border border-dashed border-[#c5c6ce] p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-[#eff4ff] text-[#0051d5] flex items-center justify-center mb-4 shadow-xs">
                <span className="material-symbols-outlined text-[32px]">folder_open</span>
              </div>
              <h3 className="text-[17px] font-bold text-[#0b1c30]">
                {materials.length === 0 ? 'No Study Materials Uploaded Yet' : 'No Matching Documents Found'}
              </h3>
              <p className="text-[13px] text-[#44474d] mt-1.5 max-w-sm leading-relaxed">
                {materials.length === 0
                  ? 'Upload your lecture notes, past exam papers, textbook chapters, or reference PDFs to build your personal study vault.'
                  : 'Try selecting a different subject or adjusting your search query.'}
              </p>
              {materials.length === 0 ? (
                <button
                  onClick={onOpenUpload}
                  className="mt-5 inline-flex items-center gap-2 bg-[#0051d5] hover:bg-[#316bf3] text-white px-5 py-2.5 rounded-xl text-[13px] font-bold shadow-sm transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
                  <span>Upload Your First Document</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSelectedSubject('All');
                    setSelectedStatus('All');
                    setSearchFilter('');
                  }}
                  className="mt-4 px-4 py-2 rounded-xl text-[12px] font-bold text-[#0051d5] hover:bg-[#eff4ff] cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>
          )}

          {/* Materials Grid */}
          {!isLoadingMaterials && !materialsError && filteredMaterials.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMaterials.map((mat) => {
                const isPdf = mat.mimeType === 'application/pdf' || mat.originalFilename.endsWith('.pdf');
                return (
                  <div
                    key={mat.id}
                    className="bg-white rounded-2xl border border-[#c5c6ce]/40 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      {/* Top Row: Subject & Processing Status */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0051d5]">
                          {mat.subject}
                        </span>

                        {/* Status Badge */}
                        {mat.processingStatus === 'ready' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                            <span>Ready</span>
                          </span>
                        )}
                        {mat.processingStatus === 'uploaded' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            <span className="material-symbols-outlined text-[14px]">cloud_done</span>
                            <span>Uploaded</span>
                          </span>
                        )}
                        {mat.processingStatus === 'processing' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></span>
                            <span>Processing</span>
                          </span>
                        )}
                        {mat.processingStatus === 'failed' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="material-symbols-outlined text-[14px]">warning</span>
                            <span>Failed</span>
                          </span>
                        )}
                      </div>

                      {/* Header with Icon & Title */}
                      <div className="flex items-start gap-3 mb-2">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isPdf ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[22px]">
                            {isPdf ? 'picture_as_pdf' : 'description'}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[15px] font-bold text-[#0b1c30] group-hover:text-[#0051d5] transition-colors line-clamp-1">
                            {mat.title}
                          </h3>
                          <p className="text-[12px] text-[#75777e] truncate mt-0.5">
                            {mat.topic || 'General Topic'}
                          </p>
                        </div>
                      </div>

                      {/* File Details Box */}
                      <div className="bg-[#eff4ff]/40 rounded-xl p-3 border border-[#c5c6ce]/20 space-y-1 mt-3 text-[11.5px] text-[#44474d]">
                        <div className="flex items-center justify-between">
                          <span className="text-[#75777e]">File Name</span>
                          <span className="font-mono text-[#0b1c30] truncate max-w-[150px]" title={mat.originalFilename}>
                            {mat.originalFilename}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#75777e]">File Size</span>
                          <span className="font-semibold">{formatFileSize(mat.fileSizeBytes)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#75777e]">Uploaded</span>
                          <span>{formatDate(mat.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Bar */}
                    <div className="pt-3.5 mt-3 border-t border-[#c5c6ce]/20 flex items-center justify-between gap-2">
                      <a
                        href={materialApi.getDownloadUrl(mat.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#0051d5] hover:text-[#316bf3] p-1.5 rounded-lg hover:bg-[#eff4ff] transition-colors"
                      >
                        <span className="material-symbols-outlined text-[17px]">download</span>
                        <span>Download</span>
                      </a>

                      <button
                        onClick={() => setMaterialToDelete(mat)}
                        title="Delete material"
                        className="p-2 rounded-xl text-[#75777e] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: CURRICULUM STUDY KITS */}
      {/* ========================================================================= */}
      {activeSubTab === 'curriculum' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredKits.map((kit) => (
            <div
              key={kit.id}
              className="bg-white rounded-2xl border border-[#c5c6ce]/40 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0051d5]">
                    {kit.subject} • {kit.unit}
                  </span>
                  <span className="text-[13px] font-bold text-[#0051d5]">
                    {kit.progressPercent}% Mastery
                  </span>
                </div>

                <h3 className="text-[17px] font-bold text-[#0b1c30] group-hover:text-[#0051d5] transition-colors line-clamp-1">
                  {kit.title}
                </h3>
                <p className="text-[12px] text-[#44474d] mt-1 line-clamp-2 leading-relaxed">
                  {kit.description}
                </p>

                <div className="w-full bg-[#eff4ff] h-2 rounded-full overflow-hidden mt-3">
                  <div
                    className="bg-[#0051d5] h-full rounded-full"
                    style={{ width: `${kit.progressPercent}%` }}
                  ></div>
                </div>

                <div className="grid grid-cols-2 gap-2 py-3 mt-2 border-y border-[#c5c6ce]/20 text-center">
                  <div>
                    <span className="block text-[14px] font-bold text-[#0b1c30]">
                      {kit.flashcardsCount}
                    </span>
                    <span className="text-[11px] text-[#75777e]">Flashcards</span>
                  </div>
                  <div>
                    <span className="block text-[14px] font-bold text-[#0b1c30]">
                      {kit.quizzesCount}
                    </span>
                    <span className="text-[11px] text-[#75777e]">Quizzes</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {kit.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-semibold text-[#44474d] bg-[#eff4ff] px-2 py-0.5 rounded-md"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-[#c5c6ce]/20 flex items-center justify-between gap-2">
                <button
                  onClick={onOpenSummary}
                  className="text-[12px] font-bold text-[#0051d5] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">menu_book</span>
                  <span>Summary</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onNavigate('flashcards')}
                    title="Practice Cards"
                    className="p-2 rounded-xl bg-[#eff4ff] text-[#0051d5] hover:bg-[#dbe1ff] transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">style</span>
                  </button>
                  <button
                    onClick={() => onNavigate('quizzes')}
                    title="Take Quiz"
                    className="p-2 rounded-xl bg-[#eff4ff] text-[#0051d5] hover:bg-[#dbe1ff] transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">quiz</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {materialToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#c5c6ce]/50 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[24px]">delete_forever</span>
            </div>
            <h3 className="text-[17px] font-bold text-[#0b1c30]">Delete Study Material?</h3>
            <p className="text-[13px] text-[#44474d] mt-1.5 leading-relaxed">
              Are you sure you want to delete <strong className="text-[#0b1c30]">"{materialToDelete.title}"</strong>?
              This will permanently remove the record and storage file.
            </p>

            <div className="flex items-center justify-end gap-2.5 mt-6">
              <button
                type="button"
                onClick={() => setMaterialToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl border border-[#c5c6ce] text-[#44474d] hover:bg-slate-50 text-[13px] font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Document</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
