/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { analyticsApi, type ProgressResponse } from '../../services/analyticsApi';
import { useStudySession } from '../../hooks/useStudySession';
import { ActiveNavTab } from '../../types';

interface ProgressViewProps {
  onNavigate?: (tab: ActiveNavTab) => void;
}

export const ProgressView: React.FC<ProgressViewProps> = ({ onNavigate }) => {
  // Track study time during progress inspection
  useStudySession();

  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadProgress() {
      try {
        setLoading(true);
        const data = await analyticsApi.getProgress();
        if (isMounted) {
          setProgress(data);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load progress analytics.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadProgress();
    return () => {
      isMounted = false;
    };
  }, []);

  const weeklyStudyData = progress?.weeklyStudyDistribution || [
    { day: 'Mon', date: '', hours: 0, seconds: 0, active: false },
    { day: 'Tue', date: '', hours: 0, seconds: 0, active: false },
    { day: 'Wed', date: '', hours: 0, seconds: 0, active: false },
    { day: 'Thu', date: '', hours: 0, seconds: 0, active: false },
    { day: 'Fri', date: '', hours: 0, seconds: 0, active: false },
    { day: 'Sat', date: '', hours: 0, seconds: 0, active: false },
    { day: 'Sun', date: '', hours: 0, seconds: 0, active: false },
  ];

  const maxHours = Math.max(0.5, ...weeklyStudyData.map((d) => d.hours));
  const weeklyAvgHours =
    weeklyStudyData.length > 0
      ? Math.round((weeklyStudyData.reduce((acc, d) => acc + d.hours, 0) / weeklyStudyData.length) * 10) / 10
      : 0;

  const subjectColors = [
    { bar: 'bg-[#0051d5]' },
    { bar: 'bg-emerald-500' },
    { bar: 'bg-indigo-600' },
    { bar: 'bg-amber-500' },
    { bar: 'bg-rose-500' },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h2 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-['Inter']">
          My Progress & Mastery Analytics
        </h2>
        <p className="text-[13px] text-[#44474d] mt-0.5">
          Real-time tracking of retention stability, study volume, and conceptual coverage from your database activity.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[13px]">
          {error}
        </div>
      )}

      {/* Adaptive Student Model Transition Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#eff4ff] to-[#f4f7ff] border border-[#d3e4fe] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#0051d5] text-white flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[22px]">psychology</span>
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-[#0b1c30]">
              Explore Your Adaptive Student Model
            </h3>
            <p className="text-[12px] text-[#44474d] mt-0.5 leading-relaxed max-w-xl">
              Inspect your Bayesian-shrunk mastery scores, topic-level statistical confidence, forgetting curve decay, and rule-based difficulty readiness.
            </p>
          </div>
        </div>
        {onNavigate && (
          <button
            onClick={() => onNavigate('adaptive-model')}
            className="px-4 py-2 bg-[#0051d5] hover:bg-[#0041b0] text-white rounded-xl text-[13px] font-semibold transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            Open Adaptive Model
          </button>
        )}
      </div>

      {/* Top 3 Diagnostic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Quiz Accuracy & Stability */}
        <div className="bg-white p-5 rounded-2xl border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between">
          <span className="text-[13px] text-[#44474d] font-semibold">Overall Quiz Accuracy</span>
          <div className="flex items-baseline gap-2 my-2">
            <span className="text-[32px] font-bold text-[#0b1c30]">
              {loading ? '...' : progress && progress.quizPerformance.totalQuizzes > 0 ? `${progress.quizPerformance.overallAccuracy}%` : '—'}
            </span>
            {progress && progress.quizPerformance.totalQuizzes > 0 && (
              <span
                className={`text-[12px] font-bold ${
                  progress.retentionStability.accuracyDelta >= 0 ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {progress.retentionStability.accuracyDelta >= 0 ? '+' : ''}
                {progress.retentionStability.accuracyDelta}% vs baseline
              </span>
            )}
          </div>
          <p className="text-[12px] text-[#75777e]">
            {progress && progress.quizPerformance.totalQuizzes > 0
              ? `Calculated across ${progress.quizPerformance.totalQuestionsAttempted} questions in ${progress.quizPerformance.totalQuizzes} quizzes.`
              : 'Complete your first quiz to calculate overall diagnostic accuracy.'}
          </p>
        </div>

        {/* Card 2: Total Time Invested */}
        <div className="bg-white p-5 rounded-2xl border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between">
          <span className="text-[13px] text-[#44474d] font-semibold">Total Time Invested</span>
          <div className="flex items-baseline gap-2 my-2">
            <span className="text-[32px] font-bold text-[#0051d5]">
              {loading ? '...' : progress?.totalStudyTime.formatted ?? '0h 0m'}
            </span>
            <span className="text-[12px] text-[#44474d] font-medium">all sessions</span>
          </div>
          <div className="flex items-center gap-1 text-[12px] text-emerald-600 font-bold">
            <span className="material-symbols-outlined text-[16px]">trending_up</span>
            <span>Server-Authoritative Tracking</span>
          </div>
        </div>

        {/* Card 3: Study Streak */}
        <div className="bg-white p-5 rounded-2xl border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between">
          <span className="text-[13px] text-[#44474d] font-semibold">Current Study Streak</span>
          <div className="flex items-baseline gap-2 my-2">
            <span className="text-[32px] font-bold text-amber-600">
              {loading ? '...' : `${progress?.studyStreak.currentStreak ?? 0} Days`}
            </span>
            <span className="text-[12px] text-amber-700 font-bold">
              {progress?.studyStreak.isActiveToday ? '🔥 Studied Today' : '🔥 Active Streak'}
            </span>
          </div>
          <p className="text-[12px] text-[#75777e]">
            Daily consistency is proven to double long-term concept recall.
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Weekly Study Time Bar Chart */}
        <div className="lg:col-span-7 bg-white p-5 lg:p-6 rounded-2xl border border-[#c5c6ce]/30 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[16px] font-bold text-[#0b1c30]">Weekly Study Distribution</h3>
              <span className="text-[12px] text-[#75777e]">Hours spent per day</span>
            </div>
            <span className="text-[12px] font-bold text-[#0051d5] bg-[#eff4ff] px-2.5 py-1 rounded-full">
              Avg {weeklyAvgHours}h / day
            </span>
          </div>

          {/* Bar Visualization */}
          <div className="h-44 flex items-end justify-between gap-3 pt-4 px-2">
            {weeklyStudyData.map((d, i) => {
              const heightPercent = maxHours > 0 ? (d.hours / maxHours) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                  <span className="text-[11px] font-semibold text-[#75777e] group-hover:text-[#0051d5]">
                    {d.hours}h
                  </span>
                  <div className="w-full max-w-[36px] bg-[#eff4ff] h-32 rounded-xl flex items-end p-1">
                    <div
                      className="w-full bg-[#0051d5] rounded-lg transition-all group-hover:bg-[#316bf3]"
                      style={{ height: `${Math.max(4, heightPercent)}%` }}
                    ></div>
                  </div>
                  <span className="text-[12px] font-bold text-[#44474d]">{d.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Retention Stability Breakdown (Grounded in Database History) */}
        <div className="lg:col-span-5 bg-white p-5 lg:p-6 rounded-2xl border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[16px] font-bold text-[#0b1c30]">Retention Stability</h3>
              <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                {progress?.retentionStability.stabilityLabel || 'Baseline Monitoring'}
              </span>
            </div>
            <p className="text-[12px] text-[#44474d] leading-relaxed">
              Your recall stability is computed directly from chronological quiz performance and spaced flashcard review logs.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#eff4ff] space-y-2.5 mt-4">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[#44474d]">All-Time Quiz Accuracy:</span>
              <span className="font-bold text-[#0b1c30]">
                {progress && progress.quizPerformance.totalQuizzes > 0
                  ? `${progress.quizPerformance.averagePercentage}%`
                  : 'No Quizzes Yet'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[#44474d]">Recent Quizzes (Last 3):</span>
              <span className="font-bold text-[#0051d5]">
                {progress && progress.quizPerformance.totalQuizzes > 0
                  ? `${progress.quizPerformance.recentPercentage}%`
                  : 'No Quizzes Yet'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[#44474d]">Mastered Flashcards:</span>
              <span className="font-bold text-[#0051d5]">
                {progress?.flashcardStats.masteredCards ?? 0} of {progress?.flashcardStats.totalCards ?? 0} cards
              </span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[#44474d]">Total Spaced Reviews:</span>
              <span className="font-bold text-emerald-600">
                {progress?.flashcardStats.totalReviews ?? 0} logged
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Subject Detailed Breakdown */}
      <div className="bg-white p-5 lg:p-6 rounded-2xl border border-[#c5c6ce]/30 shadow-xs">
        <h3 className="text-[17px] font-bold text-[#0b1c30] mb-4">Subject Deep Dive</h3>

        {loading ? (
          <div className="py-8 text-center text-[13px] text-[#75777e]">Loading subject metrics...</div>
        ) : progress && progress.subjectPerformance.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {progress.subjectPerformance.map((s, idx) => {
              const color = subjectColors[idx % subjectColors.length];
              return (
                <div key={idx} className="p-4 rounded-xl bg-[#eff4ff] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[14px] text-[#0b1c30]">{s.subject}</span>
                      <span className="font-bold text-[14px] text-[#0051d5]">{s.accuracy}%</span>
                    </div>
                    <span className="text-[11px] text-[#75777e]">
                      {s.attempted} questions ({s.quizzesCount} quizzes)
                    </span>
                  </div>
                  <div className="w-full bg-[#d3e4fe] h-2 rounded-full overflow-hidden mt-3">
                    <div
                      className={`${color.bar} h-full rounded-full transition-all duration-300`}
                      style={{ width: `${s.accuracy}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 rounded-xl bg-[#eff4ff] text-center flex flex-col items-center">
            <span className="material-symbols-outlined text-[32px] text-[#0051d5] mb-2">
              bar_chart
            </span>
            <span className="text-[15px] font-bold text-[#0b1c30]">No Subject Progress Recorded</span>
            <p className="text-[13px] text-[#44474d] mt-1 max-w-md">
              Complete quizzes to view your real subject-level performance metrics, accuracy bars, and empirical trends.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
