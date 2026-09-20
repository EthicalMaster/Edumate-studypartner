/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { quizApi } from '../../services/quizApi';
import type { QuizHistoryItem, DetailedQuizResult } from '../../types';

interface QuizHistoryViewProps {
  onViewResult: (result: DetailedQuizResult) => void;
  onNewQuiz: () => void;
}

export const QuizHistoryView: React.FC<QuizHistoryViewProps> = ({
  onViewResult,
  onNewQuiz,
}) => {
  const [history, setHistory] = useState<QuizHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const list = await quizApi.getHistory();
        setHistory(list);
      } catch (err: any) {
        setError(err.message || 'Failed to load history');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleOpenReport = async (sessionId: string) => {
    try {
      setLoadingSessionId(sessionId);
      const res = await quizApi.getResult(sessionId);
      onViewResult(res);
    } catch (err: any) {
      alert(err.message || 'Failed to load assessment report.');
    } finally {
      setLoadingSessionId(null);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-12 border border-[#c5c6ce]/30 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-[#0051d5] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[13px] text-[#75777e]">Loading assessment history...</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-12 border border-[#c5c6ce]/30 text-center flex flex-col items-center justify-center max-w-lg mx-auto">
        <span className="material-symbols-outlined text-[48px] text-[#0051d5]/40 mb-2">
          history_edu
        </span>
        <h3 className="text-[18px] font-bold text-[#0b1c30]">No Completed Assessments Yet</h3>
        <p className="text-[13px] text-[#75777e] mt-1 mb-5 leading-relaxed">
          You haven't completed any quizzes yet. Build and submit your first quiz paper to see detailed performance analytics here.
        </p>
        <button
          onClick={onNewQuiz}
          className="px-6 py-2.5 rounded-xl bg-[#0051d5] text-white text-[13px] font-bold hover:bg-[#003ea8] transition-all"
        >
          Build a Quiz Paper
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {history.map((item) => {
        const isExam = item.mode === 'EXAM';
        const isSelectedLoading = loadingSessionId === item.session_id;

        return (
          <div
            key={item.id}
            className="bg-white rounded-3xl p-5 sm:p-6 border border-[#c5c6ce]/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[#0051d5]/40 transition-all"
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0051d5] bg-[#eff4ff] px-2 py-0.5 rounded-full border border-[#0051d5]/20">
                  {item.subject}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#75777e] bg-slate-100 px-2 py-0.5 rounded-full">
                  {item.topic}
                </span>
                {isExam ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    Exam
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Practice
                  </span>
                )}
              </div>

              <h3 className="text-[16px] font-bold text-[#0b1c30]">
                {item.quiz_title}
              </h3>

              <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#75777e]">
                <span>
                  Date: {new Date(item.submitted_at).toLocaleDateString()} at{' '}
                  {new Date(item.submitted_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span>•</span>
                <span>Time Taken: {formatSeconds(item.time_taken_seconds)}</span>
                <span>•</span>
                <span>
                  {item.correct_answers} / {item.total_questions} Correct
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-[#c5c6ce]/20 justify-between sm:justify-end">
              <div className="text-left sm:text-right">
                <div className="text-[20px] font-black text-[#0051d5]">
                  {item.score_obtained} / {item.total_possible_score}
                </div>
                <div className="text-[11px] font-bold text-[#75777e]">
                  {item.percentage}% Score
                </div>
              </div>

              <button
                onClick={() => handleOpenReport(item.session_id)}
                disabled={isSelectedLoading}
                className="px-4 py-2 rounded-xl bg-[#eff4ff] hover:bg-[#0051d5] text-[#0051d5] hover:text-white text-[12px] font-bold border border-[#0051d5]/30 hover:border-[#0051d5] transition-all flex items-center gap-1.5"
              >
                {isSelectedLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">analytics</span>
                )}
                <span>Review Solutions</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
