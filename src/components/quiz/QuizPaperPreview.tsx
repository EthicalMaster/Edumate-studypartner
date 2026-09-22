/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { quizApi } from '../../services/quizApi';
import type { Quiz, QuizSession } from '../../types';

interface QuizPaperPreviewProps {
  quiz: Quiz;
  onStartSession: (session: QuizSession) => void;
  onBack: () => void;
}

export const QuizPaperPreview: React.FC<QuizPaperPreviewProps> = ({
  quiz,
  onStartSession,
  onBack,
}) => {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    try {
      setIsStarting(true);
      setError(null);
      const session = await quizApi.startSession(quiz.id);
      onStartSession(session);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize session on the server.');
      setIsStarting(false);
    }
  };

  const isExam = quiz.mode === 'EXAM';

  return (
    <div className="max-w-3xl mx-auto pb-24">
      {/* Back Button */}
      <button
        onClick={onBack}
        disabled={isStarting}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0051d5] hover:underline mb-4"
      >
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Back to Configuration
      </button>

      {/* Error alert */}
      {error && (
        <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
          <span className="material-symbols-outlined text-rose-600 text-[20px] shrink-0 mt-0.5">
            error
          </span>
          <p className="text-[13px] text-rose-800 font-medium">{error}</p>
        </div>
      )}

      {/* Official Paper Sheet */}
      <div className="bg-white rounded-3xl border border-[#c5c6ce]/30 shadow-xs overflow-hidden">
        {/* Paper Header Banner */}
        <div className="p-6 sm:p-8 bg-gradient-to-b from-[#f8f9ff] to-white border-b border-[#c5c6ce]/20">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0051d5] bg-[#eff4ff] px-2.5 py-1 rounded-full border border-[#0051d5]/20">
                {quiz.subject}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#44474d] bg-slate-100 px-2.5 py-1 rounded-full">
                {quiz.topic}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isExam ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
                  Strict Exam Mode
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                  Practice Mode
                </span>
              )}
            </div>
          </div>

          <h1 className="text-[24px] sm:text-[28px] font-bold text-[#0b1c30] tracking-tight mb-2">
            {quiz.title}
          </h1>
          <p className="text-[13px] text-[#75777e]">
            {quiz.source === 'uploaded_material'
              ? 'AI-grounded assessment synthesized from your uploaded lecture notes with chunk-level citations.'
              : 'Official curriculum question paper compiled from PostgreSQL question repository.'}
          </p>
        </div>

        {/* Paper Specifications Grid */}
        <div className="p-6 sm:p-8 grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-[#c5c6ce]/20 bg-[#fafbff]/50">
          <div className="p-3.5 bg-white rounded-2xl border border-[#c5c6ce]/20">
            <span className="text-[11px] uppercase tracking-wider font-bold text-[#75777e] block mb-1">
              Questions
            </span>
            <span className="text-[20px] font-bold text-[#0b1c30]">
              {quiz.question_count}
            </span>
          </div>

          <div className="p-3.5 bg-white rounded-2xl border border-[#c5c6ce]/20">
            <span className="text-[11px] uppercase tracking-wider font-bold text-[#75777e] block mb-1">
              Maximum Marks
            </span>
            <span className="text-[20px] font-bold text-[#0051d5]">
              {quiz.total_marks}
            </span>
          </div>

          <div className="p-3.5 bg-white rounded-2xl border border-[#c5c6ce]/20">
            <span className="text-[11px] uppercase tracking-wider font-bold text-[#75777e] block mb-1">
              Allocated Time
            </span>
            <span className="text-[20px] font-bold text-[#0b1c30]">
              {quiz.time_limit_minutes}m
            </span>
          </div>

          <div className="p-3.5 bg-white rounded-2xl border border-[#c5c6ce]/20">
            <span className="text-[11px] uppercase tracking-wider font-bold text-[#75777e] block mb-1">
              Marking Scheme
            </span>
            <span className="text-[14px] font-bold text-[#0b1c30] mt-1 block">
              {quiz.negative_marking
                ? `-${quiz.negative_mark_value} for incorrect`
                : 'No negative marks'}
            </span>
          </div>
        </div>

        {/* Instructions */}
        <div className="p-6 sm:p-8 flex flex-col gap-4">
          <h3 className="text-[14px] font-bold text-[#0b1c30] uppercase tracking-wider">
            Important Examination Guidelines
          </h3>

          <ul className="space-y-3 text-[13px] text-[#44474d] leading-relaxed">
            <li className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[18px] text-[#0051d5] shrink-0 mt-0.5">
                timer
              </span>
              <span>
                <strong>Server-Authoritative Clock:</strong> The countdown deadline is stored and validated on the backend. When time expires, your responses are automatically submitted and graded.
              </span>
            </li>

            <li className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[18px] text-[#0051d5] shrink-0 mt-0.5">
                save
              </span>
              <span>
                <strong>Real-Time Persistence:</strong> Every selected option and written answer is saved to PostgreSQL in real time. If your network hiccups, your progress is preserved.
              </span>
            </li>

            {isExam ? (
              <li className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900">
                <span className="material-symbols-outlined text-[20px] text-rose-600 shrink-0 mt-0.5">
                  warning
                </span>
                <span>
                  <strong>Strict Proctored Mode Active:</strong> Do NOT navigate away, change browser tabs, or minimize the window. The system uses the <em>Page Visibility API</em> to detect unfocused windows and will <strong>instantly auto-submit</strong> the paper upon tab switch!
                </span>
              </li>
            ) : (
              <li className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-emerald-600 shrink-0 mt-0.5">
                  school
                </span>
                <span>
                  <strong>Practice Session:</strong> Comprehensive answer explanations, formula hints, and step-by-step solutions will be unlocked immediately upon submitting.
                </span>
              </li>
            )}
          </ul>

          {/* Action Row */}
          <div className="mt-6 pt-6 border-t border-[#c5c6ce]/20 flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBack}
              disabled={isStarting}
              className="px-5 py-2.5 rounded-xl border border-[#c5c6ce]/40 text-[13px] font-semibold text-[#44474d] hover:bg-[#f8f9ff] transition-all"
            >
              Back / Modify Paper
            </button>

            <button
              type="button"
              onClick={handleStart}
              disabled={isStarting}
              className={`px-8 py-3 rounded-2xl text-[14px] font-bold text-white shadow-lg transition-all flex items-center gap-2 ${
                isExam
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  : 'bg-[#0051d5] hover:bg-[#003ea8] shadow-[#0051d5]/20'
              }`}
            >
              {isStarting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Starting Assessment...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                  <span>Start Assessment Now</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
