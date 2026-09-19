import React from 'react';
import { ActiveNavTab, StudyKit, WeakTopic } from '../../types';
import { SUBJECT_MASTERY_STATS } from '../../data/initialData';

interface HomeViewProps {
  onNavigate: (tab: ActiveNavTab) => void;
  onOpenUpload: () => void;
  onOpenSummary: () => void;
  onStartRemedialKit: () => void;
  onPlayAudioTrack: () => void;
  studyKits: StudyKit[];
  weakTopics: WeakTopic[];
  onSelectWeakTopic: (topic: WeakTopic) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigate,
  onOpenUpload,
  onOpenSummary,
  onStartRemedialKit,
  onPlayAudioTrack,
  studyKits,
  weakTopics,
  onSelectWeakTopic,
}) => {
  const activeKit = studyKits[0]; // Electrostatics

  return (
    <div className="flex flex-col w-full gap-6 pb-28">
      {/* Top Greeting Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold text-[#0b1c30] tracking-tight font-['Inter']">
              Good morning, Vibhor
            </h1>
            <span aria-label="Waving hand" className="text-2xl select-none" role="img">
              👋
            </span>
          </div>
          <p className="text-[14px] text-[#44474d] mt-0.5">
            Ready to turn your study material into high-conviction mastery? Let's make today count.
          </p>
        </div>

        {/* Daily Goal Metric Pill */}
        <div className="flex items-center gap-3 bg-white p-2 pl-4 pr-4 rounded-2xl shadow-xs border border-[#c5c6ce]/30 self-start md:self-auto">
          <div className="w-8 h-8 rounded-xl bg-[#dbe1ff] flex items-center justify-center text-[#003ea8]">
            <span className="material-symbols-outlined text-[18px]">flag</span>
          </div>
          <div className="flex flex-col pr-1">
            <span className="text-[11px] text-[#44474d] uppercase font-semibold tracking-wider">
              Today's Goal
            </span>
            <span className="text-[13px] text-[#0b1c30] font-bold">
              2 Topics + 1 Quiz
            </span>
          </div>
          <div className="flex items-center gap-1.5 pl-2 py-1 px-2.5 rounded-full bg-[#eff4ff] text-[#0051d5] text-[12px]">
            <span className="w-2 h-2 rounded-full bg-[#0051d5]"></span>
            <span className="font-bold">65% Done</span>
          </div>
        </div>
      </div>

      {/* AI Learning Hero Card & Fast Drop Hub */}
      <div className="relative w-full rounded-2xl bg-gradient-to-br from-[#1d4ed8] via-[#2563eb] to-[#4338ca] text-white p-6 lg:p-8 shadow-xl overflow-hidden">
        {/* Ambient glowing accents */}
        <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-white/10 blur-3xl pointer-events-none"></div>
        <div className="absolute left-1/3 -bottom-20 w-64 h-64 rounded-full bg-indigo-950/40 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-8 flex flex-col gap-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-white text-[11px] font-semibold w-fit shadow-xs">
              <span className="material-symbols-outlined text-[15px] text-[#dbe1ff]">
                auto_awesome
              </span>
              <span>Next-Gen Neural Engine 3.2</span>
            </div>

            <h2 className="text-[28px] md:text-[38px] font-bold text-white leading-tight tracking-tight font-['Inter']">
              Upload Your Study Material
            </h2>

            <p className="text-[15px] text-[#d7e2ff] max-w-xl leading-relaxed">
              Drop your lecture slides, notes, or textbook PDFs — get summarized flashcards, dynamic
              quizzes, and audio guides in seconds.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                id="upload-cta"
                onClick={onOpenUpload}
                type="button"
                className="inline-flex items-center gap-2 bg-white text-[#0051d5] hover:bg-[#eff4ff] transition-all duration-200 px-5 py-3 rounded-xl text-[14px] font-bold shadow-md hover:shadow-lg active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">upload_file</span>
                <span>Upload File →</span>
              </button>

              <div className="flex items-center gap-2 text-[#b9c7e6] text-[12px] font-medium">
                <span className="material-symbols-outlined text-[16px]">info</span>
                <span>Supported: PDF, TXT, DOCX • Max 50 MB</span>
              </div>
            </div>
          </div>

          {/* Hero Visual Interactive Drop Hub */}
          <div className="lg:col-span-4 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-xs p-4 rounded-2xl bg-white/10 backdrop-blur-md shadow-inner border border-white/20 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/90 tracking-wide uppercase font-bold">
                  AI Ingestion Hub
                </span>
                <span className="material-symbols-outlined text-[#dbe1ff] text-[18px]">bolt</span>
              </div>

              <div
                id="drop-zone"
                onClick={onOpenUpload}
                className="p-5 rounded-xl bg-white/5 border border-white/10 hover:border-white/30 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white mb-2 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-[24px]">cloud_upload</span>
                </div>
                <span className="text-[13px] font-bold text-white">Drag & drop files here</span>
                <span className="text-[11px] text-[#d7e2ff] mt-0.5">or browse your device</span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#d7e2ff]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                  99.4% Extraction Acc.
                </span>
                <span>Instant Sync</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Four Key Diagnostic Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Stat 1: Overall Score */}
        <div
          onClick={() => onNavigate('my-progress')}
          className="bg-white p-4 rounded-2xl shadow-xs border border-[#c5c6ce]/30 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#44474d] font-semibold">Overall Score</span>
            <div className="w-9 h-9 rounded-xl bg-[#eff4ff] flex items-center justify-center text-[#0051d5]">
              <span className="material-symbols-outlined text-[20px]">donut_large</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-[26px] text-[#0b1c30] font-bold tracking-tight">78%</span>
            <span className="flex items-center text-emerald-600 text-[12px] font-bold">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
              +4% this week
            </span>
          </div>
          <div className="w-full bg-[#e5eeff] h-1.5 rounded-full mt-3 overflow-hidden">
            <div className="bg-[#0051d5] h-full rounded-full" style={{ width: '78%' }}></div>
          </div>
        </div>

        {/* Stat 2: Quizzes Taken */}
        <div
          onClick={() => onNavigate('quizzes')}
          className="bg-white p-4 rounded-2xl shadow-xs border border-[#c5c6ce]/30 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#44474d] font-semibold">Quizzes Taken</span>
            <div className="w-9 h-9 rounded-xl bg-[#dbe1ff]/60 flex items-center justify-center text-[#003ea8]">
              <span className="material-symbols-outlined text-[20px]">assignment_turned_in</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-[26px] text-[#0b1c30] font-bold tracking-tight">12</span>
            <span className="text-[12px] text-[#44474d] font-medium">+3 completed today</span>
          </div>
          <div className="flex items-center gap-1 mt-3 text-[12px] text-[#0051d5] font-bold">
            <span className="material-symbols-outlined text-[16px]">stars</span>
            <span>Top 15% in Cohort</span>
          </div>
        </div>

        {/* Stat 3: Weak Topics Identified */}
        <div
          onClick={() => onNavigate('weak-topics')}
          className="bg-white p-4 rounded-2xl shadow-xs border border-[#c5c6ce]/30 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#44474d] font-semibold">Weak Topics</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <span className="material-symbols-outlined text-[20px]">priority_high</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-[26px] text-amber-600 font-bold tracking-tight">4</span>
            <span className="text-[12px] text-amber-700 font-semibold">2 in Physics</span>
          </div>
          <div className="flex items-center gap-1 mt-3 text-[12px] text-[#44474d]">
            <span className="material-symbols-outlined text-[16px] text-amber-600">alarm</span>
            <span>Adaptive revision queued</span>
          </div>
        </div>

        {/* Stat 4: Total Study Time */}
        <div
          onClick={() => onNavigate('my-progress')}
          className="bg-white p-4 rounded-2xl shadow-xs border border-[#c5c6ce]/30 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#44474d] font-semibold">Study Time</span>
            <div className="w-9 h-9 rounded-xl bg-[#e3dfff] flex items-center justify-center text-[#120068]">
              <span className="material-symbols-outlined text-[20px]">timelapse</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-[26px] text-[#0b1c30] font-bold tracking-tight">6h 32m</span>
            <span className="text-[12px] text-[#44474d] font-medium">Daily avg: 1.5h</span>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-[#0051d5]"></span>
              <span className="w-2 h-2 rounded-full bg-[#0051d5]"></span>
              <span className="w-2 h-2 rounded-full bg-[#0051d5]"></span>
              <span className="w-2 h-2 rounded-full bg-[#dbe1ff]"></span>
            </div>
            <span className="text-[12px] text-[#0051d5] font-bold">Streak Active 🔥</span>
          </div>
        </div>
      </div>

      {/* Mid Row: Workflow Stepper + Continue Learning Hero Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left Column: Learning Journey Stepper */}
        <div className="lg:col-span-7 bg-white p-5 lg:p-6 rounded-2xl shadow-xs border border-[#c5c6ce]/30 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#0051d5] text-[20px]">
                conversion_path
              </span>
              <h3 className="text-[17px] font-bold text-[#0b1c30]">Your Learning Journey</h3>
            </div>
            <span className="text-[11px] text-[#0051d5] bg-[#eff4ff] px-2.5 py-0.5 rounded-full font-bold">
              AI Automated
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-3">
            {/* Step 1 */}
            <div
              onClick={onOpenUpload}
              className="flex flex-col items-center text-center p-3 rounded-xl bg-[#eff4ff] hover:bg-[#dbe1ff] transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-[#0051d5] text-white flex items-center justify-center mb-1.5 shadow-sm group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
              </div>
              <span className="text-[13px] text-[#0b1c30] font-bold">1. Upload</span>
              <span className="text-[11px] text-[#44474d] leading-tight mt-0.5">
                Raw Slides / Docs
              </span>
            </div>

            {/* Step 2 */}
            <div
              onClick={onOpenSummary}
              className="flex flex-col items-center text-center p-3 rounded-xl bg-[#eff4ff] hover:bg-[#dbe1ff] transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-[#316bf3] text-white flex items-center justify-center mb-1.5 shadow-sm group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[20px]">menu_book</span>
              </div>
              <span className="text-[13px] text-[#0b1c30] font-bold">2. Learn</span>
              <span className="text-[11px] text-[#44474d] leading-tight mt-0.5">
                Notes & Cards
              </span>
            </div>

            {/* Step 3 */}
            <div
              onClick={() => onNavigate('quizzes')}
              className="flex flex-col items-center text-center p-3 rounded-xl bg-[#eff4ff] hover:bg-[#dbe1ff] transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-[#dbe1ff] text-[#003ea8] flex items-center justify-center mb-1.5 shadow-sm group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[20px]">checklist</span>
              </div>
              <span className="text-[13px] text-[#0b1c30] font-bold">3. Practice</span>
              <span className="text-[11px] text-[#44474d] leading-tight mt-0.5">
                Adaptive Quizzes
              </span>
            </div>

            {/* Step 4 */}
            <div
              onClick={() => onNavigate('weak-topics')}
              className="flex flex-col items-center text-center p-3 rounded-xl bg-[#eff4ff] hover:bg-[#dbe1ff] transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-1.5 shadow-sm group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[20px]">trending_up</span>
              </div>
              <span className="text-[13px] text-[#0b1c30] font-bold">4. Master</span>
              <span className="text-[11px] text-[#44474d] leading-tight mt-0.5">
                Fix Weak Gaps
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 text-[12px] text-[#44474d]">
            <span>
              Current pipeline:{' '}
              <strong className="text-[#0b1c30] font-bold">Physics Chapter 3 Active</strong>
            </span>
            <button
              onClick={() => onNavigate('study-kits')}
              className="text-[#0051d5] text-[13px] font-bold hover:underline"
              type="button"
            >
              Configure Pipeline →
            </button>
          </div>
        </div>

        {/* Right Column: Continue Learning Active Card */}
        <div className="lg:col-span-5 bg-white p-5 lg:p-6 rounded-2xl shadow-xs border border-[#c5c6ce]/30 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[17px] font-bold text-[#0b1c30]">Continue Learning</span>
            <span className="text-[12px] text-[#44474d]">{activeKit.lastStudied}</span>
          </div>

          <div className="p-4 rounded-xl bg-[#eff4ff] flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#0051d5] flex items-center justify-center text-white shadow-sm">
                  <span className="material-symbols-outlined text-[22px]">offline_bolt</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[16px] font-bold text-[#0b1c30]">
                    {activeKit.title}
                  </span>
                  <span className="text-[12px] text-[#44474d]">
                    {activeKit.subject} • {activeKit.unit} • {activeKit.flashcardsCount} Flashcards left
                  </span>
                </div>
              </div>
              <span className="text-[15px] text-[#0051d5] font-bold">{activeKit.progressPercent}%</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-[#d3e4fe] h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#0051d5] h-full rounded-full transition-all duration-300"
                style={{ width: `${activeKit.progressPercent}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between text-[12px] text-[#44474d] pt-0.5">
              <span>Module: {activeKit.activeModule}</span>
              <span className="text-[#0051d5] font-bold">
                {activeKit.keyConceptsLearned} / {activeKit.totalKeyConcepts} Key Concepts
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => onNavigate('flashcards')}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-[#0051d5] text-white py-2.5 px-4 rounded-xl text-[13px] font-bold shadow-sm hover:bg-[#316bf3] transition-all cursor-pointer"
              type="button"
            >
              <span>Resume Session</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
            <button
              onClick={onOpenSummary}
              aria-label="Review topic details"
              className="p-2.5 rounded-xl bg-[#eff4ff] text-[#44474d] hover:text-[#0b1c30] hover:bg-[#dbe1ff] transition-colors"
              type="button"
              title="Overview & Cheat Sheet"
            >
              <span className="material-symbols-outlined text-[20px]">more_horiz</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Access Tool Matrix (4 Essential AI Tools) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#0051d5] text-[20px]">bolt</span>
            <h3 className="text-[18px] font-bold text-[#0b1c30]">Quick Access Learning Tools</h3>
          </div>
          <span className="text-[12px] text-[#44474d]">
            Everything powered by your uploaded modules
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Card 1: AI Summary */}
          <div
            onClick={onOpenSummary}
            className="group bg-white p-5 rounded-2xl shadow-xs border border-[#c5c6ce]/30 hover:shadow-md hover:border-[#0051d5]/40 transition-all flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[22px]">subject</span>
              </div>
              <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                4 Generated
              </span>
            </div>
            <div className="mt-4">
              <h4 className="text-[16px] font-bold text-[#0b1c30] group-hover:text-[#0051d5] transition-colors">
                AI Summary
              </h4>
              <p className="text-[12px] text-[#44474d] mt-1 leading-snug">
                Distill dense lectures into bulletproof key takeaways & cheat sheets.
              </p>
            </div>
            <div className="flex items-center gap-1 mt-4 text-[#0051d5] text-[12px] font-bold">
              <span>Read Summaries</span>
              <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </div>
          </div>

          {/* Card 2: Flashcards */}
          <div
            onClick={() => onNavigate('flashcards')}
            className="group bg-white p-5 rounded-2xl shadow-xs border border-[#c5c6ce]/30 hover:shadow-md hover:border-[#0051d5]/40 transition-all flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[22px]">style</span>
              </div>
              <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-bold">
                86 Cards
              </span>
            </div>
            <div className="mt-4">
              <h4 className="text-[16px] font-bold text-[#0b1c30] group-hover:text-[#0051d5] transition-colors">
                Flashcards
              </h4>
              <p className="text-[12px] text-[#44474d] mt-1 leading-snug">
                Spaced repetition decks automatically calibrated to your forgetting curve.
              </p>
            </div>
            <div className="flex items-center gap-1 mt-4 text-[#0051d5] text-[12px] font-bold">
              <span>Start Practice</span>
              <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </div>
          </div>

          {/* Card 3: Adaptive Quizzes */}
          <div
            onClick={() => onNavigate('quizzes')}
            className="group bg-white p-5 rounded-2xl shadow-xs border border-[#c5c6ce]/30 hover:shadow-md hover:border-[#0051d5]/40 transition-all flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-[#dbe1ff] text-[#003ea8] flex items-center justify-center group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[22px]">quiz</span>
              </div>
              <span className="text-[11px] text-[#0051d5] bg-[#eff4ff] px-2 py-0.5 rounded-full font-bold">
                Timed Mode
              </span>
            </div>
            <div className="mt-4">
              <h4 className="text-[16px] font-bold text-[#0b1c30] group-hover:text-[#0051d5] transition-colors">
                Adaptive Quizzes
              </h4>
              <p className="text-[12px] text-[#44474d] mt-1 leading-snug">
                Multiple choice, true/false, and conceptual exam-grade challenges.
              </p>
            </div>
            <div className="flex items-center gap-1 mt-4 text-[#0051d5] text-[12px] font-bold">
              <span>Take Quiz</span>
              <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </div>
          </div>

          {/* Card 4: Audio Summary */}
          <div
            onClick={onPlayAudioTrack}
            className="group bg-white p-5 rounded-2xl shadow-xs border border-[#c5c6ce]/30 hover:shadow-md hover:border-[#0051d5]/40 transition-all flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[22px]">headphones</span>
              </div>
              <span className="text-[11px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-bold">
                12 min pod
              </span>
            </div>
            <div className="mt-4">
              <h4 className="text-[16px] font-bold text-[#0b1c30] group-hover:text-[#0051d5] transition-colors">
                Audio Summary
              </h4>
              <p className="text-[12px] text-[#44474d] mt-1 leading-snug">
                Two-host conversational AI podcasts explaining complex theories on commute.
              </p>
            </div>
            <div className="flex items-center gap-1 mt-4 text-[#0051d5] text-[12px] font-bold">
              <span>Listen Now</span>
              <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Deep Dive Grid: Subject Progress + Weak Topics Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Subject Progress Breakdown (7 Cols) */}
        <div className="lg:col-span-7 bg-white p-5 lg:p-6 rounded-2xl shadow-xs border border-[#c5c6ce]/30 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h3 className="text-[17px] font-bold text-[#0b1c30]">Subject Mastery</h3>
              <span className="text-[12px] text-[#44474d]">
                Real-time aggregate across all quizzes & flashcards
              </span>
            </div>
            <button
              onClick={() => onNavigate('my-progress')}
              className="text-[#0051d5] text-[13px] font-bold hover:underline"
              type="button"
            >
              View All Subjects →
            </button>
          </div>

          {/* Subject Bars */}
          <div className="flex flex-col gap-4 pt-1">
            {SUBJECT_MASTERY_STATS.map((s, idx) => (
              <div key={idx} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${s.dotClass} inline-block`}></span>
                    <span className="text-[13px] text-[#0b1c30] font-bold">{s.subject}</span>
                    <span className="text-[12px] text-[#44474d]">• {s.detail}</span>
                  </div>
                  <span className="text-[14px] font-bold text-[#0051d5]">{s.percentage}%</span>
                </div>
                <div className="w-full bg-[#eff4ff] h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`${s.barClass} h-full rounded-full transition-all duration-300`}
                    style={{ width: `${s.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

          {/* Cohort Benchmark Banner */}
          <div className="mt-1 p-3 rounded-xl bg-[#eff4ff] border border-[#dbe1ff] flex items-center justify-between text-[12px] text-[#44474d]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#0051d5] text-[18px]">
                workspace_premium
              </span>
              <span>
                You outperform <strong className="text-[#0b1c30] font-bold">82% of university peers</strong>{' '}
                in Physics this month
              </span>
            </div>
            <span
              onClick={() => onNavigate('peer-comparison')}
              className="text-[12px] text-[#0051d5] font-bold cursor-pointer hover:underline"
            >
              Compare stats
            </span>
          </div>
        </div>

        {/* Right: Priority Weak Topics (5 Cols) */}
        <div className="lg:col-span-5 bg-white p-5 lg:p-6 rounded-2xl shadow-xs border border-[#c5c6ce]/30 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">target</span>
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-[#0b1c30]">Focus Area / Weak Topics</h3>
                <span className="text-[11px] text-[#44474d]">AI prioritized by test error rate</span>
              </div>
            </div>
          </div>

          {/* Weak Topic List */}
          <div className="flex flex-col gap-2.5">
            {weakTopics.map((wt) => (
              <div
                key={wt.id}
                className="p-3 rounded-xl bg-[#eff4ff] hover:bg-[#e5eeff] transition-all flex items-center justify-between border border-[#c5c6ce]/20"
              >
                <div className="flex flex-col">
                  <span className="text-[13px] font-bold text-[#0b1c30]">{wt.topicName}</span>
                  <span
                    className={`text-[11px] font-semibold ${
                      wt.priority === 'High Priority'
                        ? 'text-amber-700'
                        : wt.priority === 'Needs Revision'
                        ? 'text-amber-600'
                        : wt.priority === 'Improving'
                        ? 'text-emerald-700'
                        : 'text-[#44474d]'
                    }`}
                  >
                    Accuracy: {wt.accuracy}% • {wt.priority}
                  </span>
                </div>

                <button
                  onClick={() => onSelectWeakTopic(wt)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all shadow-xs cursor-pointer ${
                    wt.actionType === 'practice'
                      ? 'bg-[#0051d5] text-white hover:bg-[#316bf3]'
                      : 'bg-[#d3e4fe] text-[#0b1c30] hover:bg-[#b9c7e6]'
                  }`}
                  type="button"
                >
                  {wt.recommendedAction}
                </button>
              </div>
            ))}
          </div>

          {/* Quick AI Diagnostic Prompt Trigger */}
          <div className="pt-1 flex items-center justify-between text-[12px] text-[#44474d] border-t border-[#c5c6ce]/30">
            <span className="flex items-center gap-1.5 text-[#0051d5] font-semibold">
              <span className="material-symbols-outlined text-[16px]">psychology</span>
              Need tailored practice tests?
            </span>
            <button
              onClick={onStartRemedialKit}
              className="text-[#0051d5] text-[12px] font-bold hover:underline cursor-pointer"
              type="button"
            >
              Generate Remedial Kit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
