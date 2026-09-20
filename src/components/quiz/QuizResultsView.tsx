/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { DetailedQuizResult } from '../../types';

interface QuizResultsViewProps {
  data: DetailedQuizResult;
  onRetake: () => void;
  onNewPaper: () => void;
  onHome: () => void;
}

export const QuizResultsView: React.FC<QuizResultsViewProps> = ({
  data,
  onRetake,
  onNewPaper,
  onHome,
}) => {
  const { result, review, quiz } = data;
  const [filter, setFilter] = useState<'all' | 'correct' | 'incorrect' | 'skipped' | 'manual'>('all');

  const filteredReview = review.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'correct') return item.status === 'correct';
    if (filter === 'incorrect') return item.status === 'incorrect';
    if (filter === 'skipped') return item.status === 'skipped';
    if (filter === 'manual') return item.status === 'manual_evaluation';
    return true;
  });

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'tab_switch':
        return {
          label: 'Auto-Submitted (Focus / Tab Switch)',
          color: 'bg-rose-50 text-rose-700 border-rose-200',
          icon: 'warning',
        };
      case 'time_expired':
        return {
          label: 'Auto-Submitted (Time Limit Expired)',
          color: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: 'alarm',
        };
      default:
        return {
          label: 'Submitted by Student',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: 'task_alt',
        };
    }
  };

  const reasonInfo = getReasonLabel(result.submission_reason);

  return (
    <div className="max-w-4xl mx-auto pb-24">
      {/* Top Banner with Performance Summary */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#c5c6ce]/30 shadow-xs mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-[#c5c6ce]/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0051d5] bg-[#eff4ff] px-2.5 py-0.5 rounded-full border border-[#0051d5]/20">
                {quiz.subject}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#44474d] bg-slate-100 px-2.5 py-0.5 rounded-full">
                {quiz.topic}
              </span>
            </div>
            <h1 className="text-[22px] sm:text-[26px] font-bold text-[#0b1c30] tracking-tight">
              {quiz.title} • Assessment Report
            </h1>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold ${reasonInfo.color}`}>
            <span className="material-symbols-outlined text-[16px]">{reasonInfo.icon}</span>
            <span>{reasonInfo.label}</span>
          </div>
        </div>

        {/* Primary Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-[#eff4ff]/60 border border-[#0051d5]/20 rounded-2xl">
            <span className="text-[11px] uppercase tracking-wider font-bold text-[#0051d5] block mb-1">
              Score Obtained
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-[26px] font-black text-[#0051d5]">
                {result.score_obtained}
              </span>
              <span className="text-[14px] font-semibold text-[#75777e]">
                / {result.total_possible_score}
              </span>
            </div>
          </div>

          <div className="p-4 bg-white border border-[#c5c6ce]/30 rounded-2xl">
            <span className="text-[11px] uppercase tracking-wider font-bold text-[#75777e] block mb-1">
              Percentage
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-[26px] font-black text-[#0b1c30]">
                {result.percentage}%
              </span>
            </div>
          </div>

          <div className="p-4 bg-white border border-[#c5c6ce]/30 rounded-2xl">
            <span className="text-[11px] uppercase tracking-wider font-bold text-[#75777e] block mb-1">
              Time Taken
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-[26px] font-black text-[#0b1c30]">
                {formatSeconds(result.time_taken_seconds)}
              </span>
              <span className="text-[12px] text-[#75777e]">
                / {quiz.time_limit_minutes}m
              </span>
            </div>
          </div>

          <div className="p-4 bg-white border border-[#c5c6ce]/30 rounded-2xl">
            <span className="text-[11px] uppercase tracking-wider font-bold text-[#75777e] block mb-1">
              Accuracy
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-[26px] font-black text-[#0b1c30]">
                {result.attempted_questions > 0
                  ? Math.round((result.correct_answers / result.attempted_questions) * 100)
                  : 0}
                %
              </span>
            </div>
          </div>
        </div>

        {/* Question Breakdown Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[#c5c6ce]/20">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            <span className="text-[#44474d]">Correct:</span>
            <strong className="text-emerald-700">{result.correct_answers}</strong>
          </div>

          <div className="flex items-center gap-2 text-[13px]">
            <span className="w-3 h-3 rounded-full bg-rose-500"></span>
            <span className="text-[#44474d]">Incorrect:</span>
            <strong className="text-rose-700">{result.incorrect_answers}</strong>
          </div>

          <div className="flex items-center gap-2 text-[13px]">
            <span className="w-3 h-3 rounded-full bg-slate-300"></span>
            <span className="text-[#44474d]">Skipped:</span>
            <strong className="text-slate-700">{result.skipped_questions}</strong>
          </div>

          <div className="flex items-center gap-2 text-[13px]">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            <span className="text-[#44474d]">Negative Deducted:</span>
            <strong className="text-amber-700">
              {result.negative_marks_deducted > 0 ? `-${result.negative_marks_deducted}` : '0'}
            </strong>
          </div>
        </div>
      </div>

      {/* Action Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-[18px] font-bold text-[#0b1c30]">Question Review & Solutions</h2>
          <span className="text-[12px] bg-slate-100 text-[#44474d] px-2 py-0.5 rounded-full font-bold">
            {review.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRetake}
            className="px-4 py-2 rounded-xl border border-[#c5c6ce]/40 bg-white text-[12px] font-bold text-[#44474d] hover:bg-[#f8f9ff] flex items-center gap-1.5 transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">replay</span>
            Retake Paper
          </button>
          <button
            onClick={onNewPaper}
            className="px-4 py-2 rounded-xl bg-[#0051d5] text-white text-[12px] font-bold hover:bg-[#003ea8] flex items-center gap-1.5 transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">add_circle</span>
            Build New Paper
          </button>
          <button
            onClick={onHome}
            className="px-4 py-2 rounded-xl border border-[#c5c6ce]/40 bg-white text-[12px] font-bold text-[#44474d] hover:bg-[#f8f9ff] transition-all"
          >
            Quiz Home
          </button>
        </div>
      </div>

      {/* Review Filter Tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {[
          { id: 'all', label: `All Questions (${review.length})` },
          { id: 'correct', label: `Correct (${result.correct_answers})` },
          { id: 'incorrect', label: `Incorrect (${result.incorrect_answers})` },
          { id: 'skipped', label: `Skipped (${result.skipped_questions})` },
          {
            id: 'manual',
            label: `Subjective / Ungraded (${review.filter((r) => r.status === 'manual_evaluation').length})`,
          },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id as any)}
            className={`px-3.5 py-1.5 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all ${
              filter === t.id
                ? 'bg-[#0051d5] text-white shadow-xs'
                : 'bg-white text-[#44474d] border border-[#c5c6ce]/30 hover:bg-[#f8f9ff]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Questions Review List */}
      <div className="space-y-4">
        {filteredReview.map((item) => {
          const isCorrect = item.status === 'correct';
          const isIncorrect = item.status === 'incorrect';
          const isSkipped = item.status === 'skipped';
          const isManual = item.status === 'manual_evaluation';

          return (
            <div
              key={item.id}
              className={`bg-white rounded-3xl p-6 border shadow-xs flex flex-col gap-4 ${
                isCorrect
                  ? 'border-emerald-200'
                  : isIncorrect
                  ? 'border-rose-200'
                  : isManual
                  ? 'border-amber-200'
                  : 'border-[#c5c6ce]/30'
              }`}
            >
              {/* Question Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#c5c6ce]/20">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-[#0b1c30]">
                    Question {item.question_order}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#75777e] bg-slate-100 px-2 py-0.5 rounded-full">
                    {item.section}
                  </span>
                  <span className="text-[11px] font-medium text-[#75777e]">
                    {item.question_type.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isCorrect && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">check</span>
                      +{item.marks_earned} Marks
                    </span>
                  )}
                  {isIncorrect && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                      {item.marks_earned < 0 ? `${item.marks_earned} Penalty` : '0 Marks'}
                    </span>
                  )}
                  {isSkipped && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
                      Skipped (0 Marks)
                    </span>
                  )}
                  {isManual && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      Manual Evaluation (Ungraded)
                    </span>
                  )}
                </div>
              </div>

              {/* Question Text */}
              <p className="text-[15px] font-semibold text-[#0b1c30] leading-relaxed">
                {item.question_text}
              </p>

              {/* Options Breakdown for Multiple Choice / True-False */}
              {item.options && item.options.length > 0 && (
                <div className="space-y-2">
                  {item.options.map((opt, idx) => {
                    const isOptionCorrect = item.correct_option_ids.includes(opt.id);
                    const wasOptionSelected = item.student_selected_option_ids.includes(opt.id);
                    const letter = String.fromCharCode(65 + idx);

                    let styleClass = 'bg-[#f8f9ff]/70 border-[#c5c6ce]/30 text-[#44474d]';
                    if (isOptionCorrect) {
                      styleClass = 'bg-emerald-50/70 border-emerald-300 text-emerald-950 font-medium ring-1 ring-emerald-300';
                    } else if (wasOptionSelected && !isOptionCorrect) {
                      styleClass = 'bg-rose-50/70 border-rose-300 text-rose-950 ring-1 ring-rose-300';
                    }

                    return (
                      <div
                        key={opt.id}
                        className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 text-[13px] ${styleClass}`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
                              isOptionCorrect
                                ? 'bg-emerald-600 text-white'
                                : wasOptionSelected
                                ? 'bg-rose-600 text-white'
                                : 'bg-white border border-[#c5c6ce]/40 text-[#75777e]'
                            }`}
                          >
                            {letter}
                          </span>
                          <span className="mt-0.5 leading-relaxed">{opt.text}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-bold">
                          {isOptionCorrect && (
                            <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">check_circle</span>
                              Correct Answer
                            </span>
                          )}
                          {wasOptionSelected && !isOptionCorrect && (
                            <span className="text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">cancel</span>
                              Your Selection
                            </span>
                          )}
                          {wasOptionSelected && isOptionCorrect && (
                            <span className="text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                              Your Choice
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Text Answer comparison for Fill in blank & Subjective */}
              {item.question_type === 'FILL_BLANK' && (
                <div className="p-4 bg-[#f8f9ff] border border-[#c5c6ce]/30 rounded-2xl space-y-2 text-[13px]">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#75777e]">
                      Your Submitted Answer:
                    </span>
                    <p className={`font-mono font-bold mt-0.5 ${isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {item.student_answer_text || '— (No answer submitted)'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                      Correct Key Answer:
                    </span>
                    <p className="font-mono font-bold text-emerald-900 mt-0.5">
                      {item.correct_answer_text}
                    </p>
                  </div>
                </div>
              )}

              {(item.question_type === 'VERY_SHORT' ||
                item.question_type === 'SHORT' ||
                item.question_type === 'LONG') && (
                <div className="p-4 bg-[#f8f9ff] border border-[#c5c6ce]/30 rounded-2xl space-y-2 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#75777e]">
                      Student Written Response:
                    </span>
                    <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                      Ungraded Subjective
                    </span>
                  </div>
                  <p className="text-[#0b1c30] italic whitespace-pre-wrap">
                    {item.student_answer_text || '— (No response written)'}
                  </p>
                </div>
              )}

              {/* Comprehensive Conceptual Explanation */}
              {item.explanation && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#0b1c30] mb-1.5">
                    <span className="material-symbols-outlined text-[16px] text-[#0051d5]">
                      lightbulb
                    </span>
                    <span>Solution & Concept Explanation</span>
                  </div>
                  <p className="text-[13px] text-[#44474d] leading-relaxed">
                    {item.explanation}
                  </p>
                  {item.formula_hint && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200/80 text-[12px] text-[#0051d5] font-mono">
                      <strong>Formula / Key Identity:</strong> {item.formula_hint}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
