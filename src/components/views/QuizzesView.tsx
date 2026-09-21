/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { quizApi } from '../../services/quizApi';
import type {
  Quiz,
  QuizSession,
  DetailedQuizResult,
  QuizHistoryItem,
  ActiveNavTab,
} from '../../types';
import { QuizSetupView } from '../quiz/QuizSetupView';
import { QuizPaperPreview } from '../quiz/QuizPaperPreview';
import { ActiveQuizView } from '../quiz/ActiveQuizView';
import { QuizResultsView } from '../quiz/QuizResultsView';
import { QuizHistoryView } from '../quiz/QuizHistoryView';
import { useStudySession } from '../../hooks/useStudySession';

interface QuizzesViewProps {
  quizQuestions?: any[];
  studyKits?: any[];
  onNavigate?: (tab: ActiveNavTab) => void;
  onRecordQuizCompletion?: () => void;
}

type ViewScreen = 'home' | 'setup' | 'preview' | 'active' | 'results';

export const QuizzesView: React.FC<QuizzesViewProps> = ({
  onNavigate,
  onRecordQuizCompletion,
}) => {
  useStudySession();
  const [screen, setScreen] = useState<ViewScreen>('home');
  const [activeTab, setActiveTab] = useState<'all' | 'PRACTICE' | 'EXAM' | 'history'>('all');

  // Quizzes list state
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [history, setHistory] = useState<QuizHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active paper / session / results workflow
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [activeSession, setActiveSession] = useState<QuizSession | null>(null);
  const [activeResult, setActiveResult] = useState<DetailedQuizResult | null>(null);

  // Load quizzes and history from real PostgreSQL backend
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [quizList, historyList] = await Promise.all([
        quizApi.getQuizzes(),
        quizApi.getHistory(),
      ]);
      setQuizzes(quizList);
      setHistory(historyList);
    } catch (err: any) {
      console.error('Failed to load quizzes:', err);
      setError(err.message || 'Failed to load quizzes from database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handler when a paper is built in QuizSetupView
  const handlePaperCreated = (quiz: Quiz) => {
    setSelectedQuiz(quiz);
    setScreen('preview');
  };

  // Handler when user starts session from QuizPaperPreview
  const handleStartSession = (session: QuizSession) => {
    setActiveSession(session);
    setScreen('active');
  };

  // Handler when user finishes quiz in ActiveQuizView
  const handleQuizFinished = (result: DetailedQuizResult) => {
    setActiveResult(result);
    setScreen('results');
    loadData();
    if (onRecordQuizCompletion) {
      onRecordQuizCompletion();
    }
  };

  // Handler when user clicks "Preview & Start" on a quiz card
  const handleSelectQuizToPreview = (quiz: Quiz) => {
    setSelectedQuiz(quiz);
    setScreen('preview');
  };

  // Retake paper handler
  const handleRetakePaper = () => {
    if (activeResult?.quiz?.id) {
      const q = quizzes.find((item) => item.id === activeResult.quiz.id);
      if (q) {
        setSelectedQuiz(q);
        setScreen('preview');
        return;
      }
    }
    setScreen('setup');
  };

  // Calculate real performance stats from history
  const totalAttempts = history.length;
  const avgAccuracy =
    totalAttempts > 0
      ? Math.round(
          history.reduce((acc, curr) => acc + (Number(curr.percentage) || 0), 0) /
            totalAttempts
        )
      : 0;
  const totalQuestionsAnswered = history.reduce(
    (acc, curr) => acc + (Number(curr.attempted_questions) || 0),
    0
  );
  const totalStudySeconds = history.reduce(
    (acc, curr) => acc + (Number(curr.time_taken_seconds) || 0),
    0
  );

  const formatStudyTime = (secs: number) => {
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  // 1. SETUP SCREEN
  if (screen === 'setup') {
    return (
      <QuizSetupView
        onPaperCreated={handlePaperCreated}
        onCancel={() => setScreen('home')}
      />
    );
  }

  // 2. PREVIEW SCREEN
  if (screen === 'preview' && selectedQuiz) {
    return (
      <QuizPaperPreview
        quiz={selectedQuiz}
        onStartSession={handleStartSession}
        onBack={() => setScreen('home')}
      />
    );
  }

  // 3. ACTIVE QUIZ SCREEN
  if (screen === 'active' && activeSession) {
    return (
      <ActiveQuizView
        session={activeSession}
        onFinished={handleQuizFinished}
        onExit={() => {
          loadData();
          setScreen('home');
        }}
      />
    );
  }

  // 4. RESULTS SCREEN
  if (screen === 'results' && activeResult) {
    return (
      <QuizResultsView
        data={activeResult}
        onRetake={handleRetakePaper}
        onNewPaper={() => setScreen('setup')}
        onHome={() => setScreen('home')}
      />
    );
  }

  // 5. QUIZ HOME SCREEN
  const filteredQuizzes = quizzes.filter((q) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'PRACTICE') return q.mode === 'PRACTICE';
    if (activeTab === 'EXAM') return q.mode === 'EXAM';
    return true;
  });

  return (
    <div className="flex flex-col gap-6 pb-12 max-w-6xl mx-auto">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-[#0b1c30] tracking-tight">
            Curriculum Quizzes & Assessments
          </h1>
          <p className="text-[13px] text-[#44474d] mt-0.5">
            PostgreSQL-backed examination engine with server-authoritative timer, proctored exam modes, and real-time grading.
          </p>
        </div>

        <button
          onClick={() => setScreen('setup')}
          className="px-5 py-2.5 rounded-2xl bg-[#0051d5] hover:bg-[#003ea8] text-white text-[13px] font-bold shadow-md shadow-[#0051d5]/20 flex items-center justify-center gap-2 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          <span>Build Quiz Paper</span>
        </button>
      </div>

      {/* Real Statistics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-[#c5c6ce]/30 shadow-xs">
          <div className="flex items-center gap-2 text-[#75777e] mb-1">
            <span className="material-symbols-outlined text-[18px] text-[#0051d5]">
              description
            </span>
            <span className="text-[11px] uppercase tracking-wider font-bold">
              Papers Built
            </span>
          </div>
          <div className="text-[26px] font-black text-[#0b1c30]">{quizzes.length}</div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#c5c6ce]/30 shadow-xs">
          <div className="flex items-center gap-2 text-[#75777e] mb-1">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">
              task_alt
            </span>
            <span className="text-[11px] uppercase tracking-wider font-bold">
              Completed Attempts
            </span>
          </div>
          <div className="text-[26px] font-black text-[#0b1c30]">{totalAttempts}</div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#c5c6ce]/30 shadow-xs">
          <div className="flex items-center gap-2 text-[#75777e] mb-1">
            <span className="material-symbols-outlined text-[18px] text-amber-500">
              analytics
            </span>
            <span className="text-[11px] uppercase tracking-wider font-bold">
              Average Accuracy
            </span>
          </div>
          <div className="text-[26px] font-black text-[#0b1c30]">{avgAccuracy}%</div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#c5c6ce]/30 shadow-xs">
          <div className="flex items-center gap-2 text-[#75777e] mb-1">
            <span className="material-symbols-outlined text-[18px] text-purple-600">
              schedule
            </span>
            <span className="text-[11px] uppercase tracking-wider font-bold">
              Assessment Time
            </span>
          </div>
          <div className="text-[26px] font-black text-[#0b1c30]">
            {formatStudyTime(totalStudySeconds)}
          </div>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-2 border-b border-[#c5c6ce]/20 pb-2 overflow-x-auto">
        {[
          { id: 'all', label: `All Papers (${quizzes.length})` },
          {
            id: 'PRACTICE',
            label: `Practice Mode (${quizzes.filter((q) => q.mode === 'PRACTICE').length})`,
          },
          {
            id: 'EXAM',
            label: `Exam Mode (${quizzes.filter((q) => q.mode === 'EXAM').length})`,
          },
          { id: 'history', label: `Attempt History (${history.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-[#0051d5] text-white shadow-xs'
                : 'text-[#44474d] hover:bg-[#f8f9ff]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
          <span className="material-symbols-outlined text-rose-600 text-[20px] shrink-0 mt-0.5">
            error
          </span>
          <p className="text-[13px] text-rose-800 font-medium">{error}</p>
        </div>
      )}

      {/* Loading Spinner */}
      {loading && (
        <div className="bg-white rounded-3xl p-16 border border-[#c5c6ce]/30 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-[#0051d5] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[13px] text-[#75777e]">Connecting to PostgreSQL quiz repository...</p>
        </div>
      )}

      {/* History Tab View */}
      {!loading && activeTab === 'history' && (
        <QuizHistoryView
          onViewResult={(res) => {
            setActiveResult(res);
            setScreen('results');
          }}
          onNewQuiz={() => setScreen('setup')}
        />
      )}

      {/* Papers Grid View */}
      {!loading && activeTab !== 'history' && (
        <>
          {filteredQuizzes.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-[#c5c6ce]/30 text-center flex flex-col items-center justify-center max-w-lg mx-auto">
              <span className="material-symbols-outlined text-[48px] text-[#0051d5]/30 mb-2">
                quiz
              </span>
              <h3 className="text-[18px] font-bold text-[#0b1c30]">
                No Quiz Papers Found
              </h3>
              <p className="text-[13px] text-[#75777e] mt-1 mb-5 leading-relaxed">
                Build your first standardized assessment paper from the university curriculum question bank to get started.
              </p>
              <button
                onClick={() => setScreen('setup')}
                className="px-6 py-2.5 rounded-xl bg-[#0051d5] text-white text-[13px] font-bold hover:bg-[#003ea8] transition-all"
              >
                Build Quiz Paper
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredQuizzes.map((q) => {
                const isExam = q.mode === 'EXAM';
                return (
                  <div
                    key={q.id}
                    className="bg-white rounded-3xl p-6 border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between gap-5 hover:border-[#0051d5]/40 hover:shadow-md transition-all group"
                  >
                    <div>
                      {/* Tags & Mode */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#0051d5] bg-[#eff4ff] px-2.5 py-0.5 rounded-full border border-[#0051d5]/20">
                            {q.subject}
                          </span>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#44474d] bg-slate-100 px-2 py-0.5 rounded-full">
                            {q.difficulty}
                          </span>
                        </div>

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

                      {/* Paper Title */}
                      <h3 className="text-[17px] font-bold text-[#0b1c30] group-hover:text-[#0051d5] transition-colors leading-snug mb-1">
                        {q.title}
                      </h3>
                      <p className="text-[12px] text-[#75777e] line-clamp-1 mb-4">
                        {q.topic}
                      </p>

                      {/* Paper Specs Grid */}
                      <div className="grid grid-cols-3 gap-2 py-3 border-y border-[#c5c6ce]/20 text-center">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#75777e] block">
                            Questions
                          </span>
                          <span className="text-[15px] font-black text-[#0b1c30]">
                            {q.question_count}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#75777e] block">
                            Marks
                          </span>
                          <span className="text-[15px] font-black text-[#0051d5]">
                            {q.total_marks}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#75777e] block">
                            Time
                          </span>
                          <span className="text-[15px] font-black text-[#0b1c30]">
                            {q.time_limit_minutes}m
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Action */}
                    <button
                      onClick={() => handleSelectQuizToPreview(q)}
                      className="w-full py-2.5 rounded-xl bg-[#eff4ff] hover:bg-[#0051d5] text-[#0051d5] hover:text-white text-[13px] font-bold border border-[#0051d5]/20 hover:border-[#0051d5] transition-all flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">play_circle</span>
                      <span>Preview & Start Paper</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
