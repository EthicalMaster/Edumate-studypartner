import React, { useEffect, useState } from 'react';
import { ActiveNavTab, StudyKit, WeakTopic } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { analyticsApi, type DashboardResponse, type WeakTopicData } from '../../services/analyticsApi';
import { useStudySession } from '../../hooks/useStudySession';

interface HomeViewProps {
  onNavigate: (tab: ActiveNavTab) => void;
  onOpenUpload: () => void;
  onOpenSummary: () => void;
  onStartRemedialKit?: () => void;
  onPlayAudioTrack?: () => void;
  studyKits?: StudyKit[];
  weakTopics?: WeakTopic[];
  onSelectWeakTopic?: (topic: WeakTopic) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigate,
  onOpenUpload,
  onOpenSummary,
}) => {
  const { user } = useAuth();
  const studentName = user?.profile?.full_name || 'Student';

  // Server-authoritative real-time study session tracking for HomeView
  useStudySession();

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadDashboard() {
      try {
        setLoading(true);
        const data = await analyticsApi.getDashboard();
        if (isMounted) {
          setDashboard(data);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load dashboard data.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadDashboard();
    return () => {
      isMounted = false;
    };
  }, []);

  const timeOfDayGreeting = dashboard?.greeting.timeOfDay || 'morning';
  const greetingText = `Good ${timeOfDayGreeting}, ${dashboard?.greeting.name || studentName}`;

  // Subject palette colors
  const subjectColors = [
    { dot: 'bg-[#0051d5]', bar: 'bg-[#0051d5]' },
    { dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
    { dot: 'bg-indigo-600', bar: 'bg-indigo-600' },
    { dot: 'bg-amber-500', bar: 'bg-amber-500' },
    { dot: 'bg-rose-500', bar: 'bg-rose-500' },
  ];

  return (
    <div className="flex flex-col w-full gap-6 pb-12">
      {/* Top Greeting Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold text-[#0b1c30] tracking-tight font-['Inter']">
              {greetingText}
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
              Today's Activity
            </span>
            <span className="text-[13px] text-[#0b1c30] font-bold">
              {dashboard ? `${dashboard.quizzesCompleted.completedToday} Quizzes Today` : 'Loading...'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 pl-2 py-1 px-2.5 rounded-full bg-[#eff4ff] text-[#0051d5] text-[12px]">
            <span className={`w-2 h-2 rounded-full ${dashboard?.studyStreak.isActiveToday ? 'bg-emerald-500 animate-pulse' : 'bg-[#0051d5]'}`}></span>
            <span className="font-bold">
              {dashboard?.studyStreak.isActiveToday ? 'Studied Today' : 'Ready to Study'}
            </span>
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

      {/* Four Key Diagnostic Stat Cards (PostgreSQL Database-Backed) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Stat 1: Overall Score */}
        <div
          onClick={() => onNavigate('my-progress')}
          className="bg-white p-4 rounded-2xl shadow-xs border border-[#c5c6ce]/30 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#44474d] font-semibold">Overall Quiz Score</span>
            <div className="w-9 h-9 rounded-xl bg-[#eff4ff] flex items-center justify-center text-[#0051d5]">
              <span className="material-symbols-outlined text-[20px]">donut_large</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-[26px] text-[#0b1c30] font-bold tracking-tight">
              {loading ? '...' : dashboard && dashboard.quizzesCompleted.total > 0 ? `${dashboard.averageQuizPercentage}%` : '—'}
            </span>
            {dashboard && dashboard.quizzesCompleted.total > 0 && (
              <span className="flex items-center text-emerald-600 text-[12px] font-bold">
                <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                Avg Accuracy
              </span>
            )}
          </div>
          <div className="w-full bg-[#e5eeff] h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-[#0051d5] h-full rounded-full transition-all duration-300"
              style={{ width: `${dashboard ? Math.min(100, Math.max(5, dashboard.averageQuizPercentage)) : 0}%` }}
            ></div>
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
            <span className="text-[26px] text-[#0b1c30] font-bold tracking-tight">
              {loading ? '...' : dashboard?.quizzesCompleted.total ?? 0}
            </span>
            <span className="text-[12px] text-[#44474d] font-medium">
              +{dashboard?.quizzesCompleted.completedToday ?? 0} completed today
            </span>
          </div>
          <div className="flex items-center gap-1 mt-3 text-[12px] text-[#0051d5] font-bold">
            <span className="material-symbols-outlined text-[16px]">stars</span>
            <span>{dashboard && dashboard.quizzesCompleted.total > 0 ? 'Active Quiz History' : 'Ready for First Quiz'}</span>
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
            <span className="text-[26px] text-amber-600 font-bold tracking-tight">
              {loading ? '...' : dashboard?.weakTopics.length ?? 0}
            </span>
            <span className="text-[12px] text-amber-700 font-semibold">
              {dashboard && dashboard.weakTopics.length > 0
                ? `${dashboard.weakTopics[0].subject} Focus`
                : 'All Proficient'}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-3 text-[12px] text-[#44474d]">
            <span className="material-symbols-outlined text-[16px] text-amber-600">alarm</span>
            <span>{dashboard && dashboard.weakTopics.length > 0 ? 'Adaptive revision queued' : 'No Critical Weak Gaps'}</span>
          </div>
        </div>

        {/* Stat 4: Total Study Time */}
        <div
          onClick={() => onNavigate('my-progress')}
          className="bg-white p-4 rounded-2xl shadow-xs border border-[#c5c6ce]/30 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#44474d] font-semibold">Study Time This Week</span>
            <div className="w-9 h-9 rounded-xl bg-[#e3dfff] flex items-center justify-center text-[#120068]">
              <span className="material-symbols-outlined text-[20px]">timelapse</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-[26px] text-[#0b1c30] font-bold tracking-tight">
              {loading ? '...' : dashboard?.studyTimeThisWeek.formatted ?? '0h 0m'}
            </span>
            <span className="text-[12px] text-[#44474d] font-medium">
              Daily avg: {dashboard?.studyTimeThisWeek.dailyAverageHours ?? 0}h
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <div className="flex gap-1">
              {[...Array(Math.min(4, Math.max(1, dashboard?.studyStreak.currentStreak || 0)))].map((_, i) => (
                <span key={i} className="w-2 h-2 rounded-full bg-[#0051d5]"></span>
              ))}
            </div>
            <span className="text-[12px] text-[#0051d5] font-bold">
              {dashboard && dashboard.studyStreak.currentStreak > 0
                ? `${dashboard.studyStreak.currentStreak} Day Streak 🔥`
                : 'Start Streak Today'}
            </span>
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
              <strong className="text-[#0b1c30] font-bold">
                {dashboard?.continueLearning?.title || 'Interactive Learning Engine Ready'}
              </strong>
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
            <span className="text-[12px] text-[#44474d]">
              {dashboard?.continueLearning ? 'Active Session' : 'Ready'}
            </span>
          </div>

          {dashboard?.continueLearning ? (
            <div className="p-4 rounded-xl bg-[#eff4ff] flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#0051d5] flex items-center justify-center text-white shadow-sm">
                    <span className="material-symbols-outlined text-[22px]">
                      {dashboard.continueLearning.type === 'quiz' ? 'quiz' : 'menu_book'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[16px] font-bold text-[#0b1c30] line-clamp-1">
                      {dashboard.continueLearning.title}
                    </span>
                    <span className="text-[12px] text-[#44474d]">
                      {dashboard.continueLearning.subject}
                      {dashboard.continueLearning.topic ? ` • ${dashboard.continueLearning.topic}` : ''}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[12px] text-[#44474d] pt-0.5">
                <span>Type: {dashboard.continueLearning.type === 'quiz' ? 'Quiz Attempt' : 'Study Document'}</span>
                <span className="text-[#0051d5] font-bold">Resume Anytime</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#eff4ff] flex flex-col items-center justify-center text-center py-6">
              <div className="w-10 h-10 rounded-full bg-[#dbe1ff] text-[#0051d5] flex items-center justify-center mb-2">
                <span className="material-symbols-outlined text-[22px]">play_circle</span>
              </div>
              <span className="text-[14px] font-bold text-[#0b1c30]">Start Your Next Session</span>
              <p className="text-[12px] text-[#44474d] mt-1 max-w-xs">
                Take a practice quiz or upload course materials to begin learning.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => onNavigate(dashboard?.continueLearning?.type === 'quiz' ? 'quizzes' : 'flashcards')}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-[#0051d5] text-white py-2.5 px-4 rounded-xl text-[13px] font-bold shadow-sm hover:bg-[#316bf3] transition-all cursor-pointer"
              type="button"
            >
              <span>{dashboard?.continueLearning ? 'Resume Session' : 'Start Practice Quiz'}</span>
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
            Everything powered by your authenticated learning database
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
                {dashboard?.materialsCount ?? 0} Materials
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
                {dashboard?.flashcardsCount ?? 0} Cards
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
                {dashboard?.quizzesCompleted.total ?? 0} Completed
              </span>
            </div>
            <div className="mt-4">
              <h4 className="text-[16px] font-bold text-[#0b1c30] group-hover:text-[#0051d5] transition-colors">
                Adaptive Quizzes
              </h4>
              <p className="text-[12px] text-[#44474d] mt-1 leading-snug">
                Multiple choice, fill-in-blank, and conceptual exam-grade challenges.
              </p>
            </div>
            <div className="flex items-center gap-1 mt-4 text-[#0051d5] text-[12px] font-bold">
              <span>Take Quiz</span>
              <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </div>
          </div>

          {/* Card 4: Adaptive Student Model */}
          <div
            onClick={() => onNavigate('adaptive-model')}
            className="group bg-white p-5 rounded-2xl shadow-xs border border-[#c5c6ce]/30 hover:shadow-md hover:border-[#0051d5]/40 transition-all flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[22px]">psychology</span>
              </div>
              <span className="text-[11px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full font-bold">
                BKT Engine
              </span>
            </div>
            <div className="mt-4">
              <h4 className="text-[16px] font-bold text-[#0b1c30] group-hover:text-[#0051d5] transition-colors">
                Adaptive Model
              </h4>
              <p className="text-[12px] text-[#44474d] mt-1 leading-snug">
                Probabilistic knowledge tracing tracking real-time retention and cognitive decay.
              </p>
            </div>
            <div className="flex items-center gap-1 mt-4 text-[#0051d5] text-[12px] font-bold">
              <span>Inspect Model</span>
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
                Real-time aggregate across all quizzes in database
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
            {loading ? (
              <div className="py-8 text-center text-[13px] text-[#75777e]">Loading subject metrics...</div>
            ) : dashboard && dashboard.subjectProgress.length > 0 ? (
              dashboard.subjectProgress.map((s, idx) => {
                const color = subjectColors[idx % subjectColors.length];
                return (
                  <div key={idx} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${color.dot} inline-block`}></span>
                        <span className="text-[13px] text-[#0b1c30] font-bold">{s.subject}</span>
                        <span className="text-[12px] text-[#44474d]">
                          • {s.attempted} questions ({s.quizzesCount} quizzes)
                        </span>
                      </div>
                      <span className="text-[14px] font-bold text-[#0051d5]">{s.accuracy}%</span>
                    </div>
                    <div className="w-full bg-[#eff4ff] h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`${color.bar} h-full rounded-full transition-all duration-300`}
                        style={{ width: `${s.accuracy}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 rounded-xl bg-[#eff4ff] text-center flex flex-col items-center">
                <span className="material-symbols-outlined text-[28px] text-[#0051d5] mb-1">
                  analytics
                </span>
                <span className="text-[14px] font-bold text-[#0b1c30]">No Subject Quiz Data Yet</span>
                <p className="text-[12px] text-[#44474d] mt-1 max-w-sm">
                  Complete quizzes across different subjects to generate your empirical mastery breakdown.
                </p>
                <button
                  onClick={() => onNavigate('quizzes')}
                  className="mt-3 px-4 py-1.5 bg-[#0051d5] text-white text-[12px] font-bold rounded-lg shadow-xs hover:bg-[#316bf3]"
                  type="button"
                >
                  Take First Quiz →
                </button>
              </div>
            )}
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
                <span className="text-[11px] text-[#44474d]">Deterministic accuracy &lt; 70%</span>
              </div>
            </div>
          </div>

          {/* Weak Topic List */}
          <div className="flex flex-col gap-2.5">
            {loading ? (
              <div className="py-8 text-center text-[13px] text-[#75777e]">Evaluating topic accuracy...</div>
            ) : dashboard && dashboard.weakTopics.length > 0 ? (
              dashboard.weakTopics.map((wt) => (
                <div
                  key={wt.id}
                  className="p-3 rounded-xl bg-[#eff4ff] hover:bg-[#e5eeff] transition-all flex items-center justify-between border border-[#c5c6ce]/20"
                >
                  <div className="flex flex-col pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold text-[#0b1c30]">{wt.topic}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-[#44474d] font-semibold">
                        {wt.subject}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-semibold ${
                        wt.priority === 'HIGH'
                          ? 'text-red-700'
                          : wt.priority === 'MEDIUM'
                          ? 'text-amber-700'
                          : 'text-amber-600'
                      }`}
                    >
                      Accuracy: {wt.accuracy}% • {wt.priority} Priority • {wt.incorrect} Missed
                    </span>
                  </div>

                  <button
                    onClick={() => onNavigate('weak-topics')}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all shadow-xs cursor-pointer bg-[#0051d5] text-white hover:bg-[#316bf3] shrink-0"
                    type="button"
                  >
                    Drill →
                  </button>
                </div>
              ))
            ) : (
              <div className="p-6 rounded-xl bg-[#eff4ff] text-center flex flex-col items-center">
                <span className="material-symbols-outlined text-[28px] text-emerald-600 mb-1">
                  verified
                </span>
                <span className="text-[14px] font-bold text-[#0b1c30]">No Weak Topics Detected</span>
                <p className="text-[12px] text-[#44474d] mt-1 max-w-xs">
                  All attempted topics currently exceed the 70% threshold. Keep up the high accuracy!
                </p>
              </div>
            )}
          </div>

          {/* Quick AI Diagnostic Prompt Trigger */}
          <div className="pt-1 flex items-center justify-between text-[12px] text-[#44474d] border-t border-[#c5c6ce]/30">
            <span className="flex items-center gap-1.5 text-[#0051d5] font-semibold">
              <span className="material-symbols-outlined text-[16px]">psychology</span>
              Review all weak topics & drills?
            </span>
            <button
              onClick={() => onNavigate('weak-topics')}
              className="text-[#0051d5] text-[12px] font-bold hover:underline cursor-pointer"
              type="button"
            >
              Open Weak Topics →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
