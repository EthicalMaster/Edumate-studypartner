import React, { useState } from 'react';
import { StudyKit, ActiveNavTab } from '../../types';

interface StudyKitsViewProps {
  studyKits: StudyKit[];
  onSelectKit: (kit: StudyKit) => void;
  onNavigate: (tab: ActiveNavTab) => void;
  onOpenUpload: () => void;
  onOpenSummary: () => void;
  onPlayAudioTrack: () => void;
}

export const StudyKitsView: React.FC<StudyKitsViewProps> = ({
  studyKits,
  onNavigate,
  onOpenUpload,
  onOpenSummary,
  onPlayAudioTrack,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [searchFilter, setSearchFilter] = useState('');

  const subjects = ['All', 'Physics', 'Mathematics', 'Chemistry', 'Computer Science'];

  const filteredKits = studyKits.filter((kit) => {
    const matchSubject = selectedSubject === 'All' || kit.subject === selectedSubject;
    const matchSearch =
      kit.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      kit.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
      kit.tags.some((t) => t.toLowerCase().includes(searchFilter.toLowerCase()));
    return matchSubject && matchSearch;
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-['Inter']">
            Your Study Kits
          </h2>
          <p className="text-[13px] text-[#44474d] mt-0.5">
            Every module distilled into structured concept trees, flashcard decks, and practice exams.
          </p>
        </div>

        <button
          onClick={onOpenUpload}
          className="inline-flex items-center gap-2 bg-[#0051d5] hover:bg-[#316bf3] text-white px-4 py-2.5 rounded-xl text-[13px] font-bold shadow-sm transition-all cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[20px]">upload_file</span>
          <span>Upload New Material</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-[#c5c6ce]/30 shadow-xs">
        {/* Subject Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {subjects.map((sub) => (
            <button
              key={sub}
              onClick={() => setSelectedSubject(sub)}
              className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all whitespace-nowrap ${
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
        <div className="flex items-center gap-2 bg-[#eff4ff] px-3 py-1.5 rounded-xl sm:w-64">
          <span className="material-symbols-outlined text-[#75777e] text-[18px]">search</span>
          <input
            type="text"
            placeholder="Search kits or tags..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="bg-transparent border-none outline-none text-[13px] text-[#0b1c30] placeholder:text-[#75777e] w-full"
          />
        </div>
      </div>

      {/* Study Kits Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredKits.map((kit) => (
          <div
            key={kit.id}
            className="bg-white rounded-2xl border border-[#c5c6ce]/40 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
          >
            <div>
              {/* Top Row: Subject & Progress */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0051d5]">
                  {kit.subject} • {kit.unit}
                </span>
                <span className="text-[13px] font-bold text-[#0051d5]">
                  {kit.progressPercent}% Mastery
                </span>
              </div>

              {/* Title & Description */}
              <h3 className="text-[17px] font-bold text-[#0b1c30] group-hover:text-[#0051d5] transition-colors line-clamp-1">
                {kit.title}
              </h3>
              <p className="text-[12px] text-[#44474d] mt-1 line-clamp-2 leading-relaxed">
                {kit.description}
              </p>

              {/* Progress Bar */}
              <div className="w-full bg-[#eff4ff] h-2 rounded-full overflow-hidden mt-3">
                <div
                  className="bg-[#0051d5] h-full rounded-full"
                  style={{ width: `${kit.progressPercent}%` }}
                ></div>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-3 gap-2 py-3 mt-2 border-y border-[#c5c6ce]/20 text-center">
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
                <div>
                  <span className="block text-[14px] font-bold text-[#0b1c30]">
                    {kit.audioDurationMin}m
                  </span>
                  <span className="text-[11px] text-[#75777e]">Audio Pod</span>
                </div>
              </div>

              {/* Tags */}
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

            {/* Actions Bar */}
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
                  className="p-2 rounded-xl bg-[#eff4ff] text-[#0051d5] hover:bg-[#dbe1ff] transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">style</span>
                </button>
                <button
                  onClick={() => onNavigate('quizzes')}
                  title="Take Quiz"
                  className="p-2 rounded-xl bg-[#eff4ff] text-[#0051d5] hover:bg-[#dbe1ff] transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">quiz</span>
                </button>
                <button
                  onClick={onPlayAudioTrack}
                  title="Listen to Podcast"
                  className="p-2 rounded-xl bg-[#0051d5] text-white hover:bg-[#316bf3] transition-colors shadow-xs"
                >
                  <span className="material-symbols-outlined text-[18px]">headphones</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
