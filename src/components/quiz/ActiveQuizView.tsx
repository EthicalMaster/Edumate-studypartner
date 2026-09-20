/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { quizApi, type SessionStateResponse } from '../../services/quizApi';
import type { QuizSession, SafeQuizQuestion, DetailedQuizResult } from '../../types';

interface ActiveQuizViewProps {
  session: QuizSession;
  onFinished: (result: DetailedQuizResult) => void;
  onExit: () => void;
}

export const ActiveQuizView: React.FC<ActiveQuizViewProps> = ({
  session,
  onFinished,
  onExit,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // State from server
  const [questions, setQuestions] = useState<SafeQuizQuestion[]>([]);
  const [quizMeta, setQuizMeta] = useState<SessionStateResponse['quiz'] | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // User responses: questionId -> { selected_option_ids: string[], answer_text: string }
  const [answers, setAnswers] = useState<
    Record<string, { selected_option_ids: string[]; answer_text: string }>
  >({});
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  // Authoritative server timer state
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [tabSwitchAlert, setTabSwitchAlert] = useState<boolean>(false);

  // Track time spent per question
  const questionStartTimeRef = useRef<number>(Date.now());
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // 1. Fetch initial session state from server
  useEffect(() => {
    let mounted = true;
    async function loadState() {
      try {
        setLoading(true);
        const data = await quizApi.getSessionState(session.id);
        if (!mounted) return;

        setQuestions(data.questions);
        setQuizMeta(data.quiz);

        // Populate saved answers
        const formatted: Record<string, { selected_option_ids: string[]; answer_text: string }> = {};
        for (const [qId, ans] of Object.entries(data.savedAnswers)) {
          formatted[qId] = {
            selected_option_ids: ans.selected_option_ids || [],
            answer_text: ans.answer_text || '',
          };
        }
        setAnswers(formatted);

        // Compute authoritative remaining seconds
        const deadline = new Date(data.session.server_deadline).getTime();
        const now = Date.now();
        const rem = Math.max(0, Math.floor((deadline - now) / 1000));
        setSecondsRemaining(rem);

        if (rem === 0 || data.session.status !== 'active') {
          // Already expired, submit
          handleAutoSubmit('time_expired');
        }
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to initialize session.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadState();
    return () => {
      mounted = false;
    };
  }, [session.id]);

  // 2. Submission handler
  const isSubmittingRef = useRef(false);

  const handleAutoSubmit = useCallback(
    async (reason: 'manual_submit' | 'time_expired' | 'tab_switch') => {
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      setIsSubmitting(true);

      try {
        const result = await quizApi.submitSession(session.id, reason);
        onFinished(result);
      } catch (err: any) {
        console.error('Submission failed:', err);
        setError(err.message || 'Failed to submit quiz.');
        setIsSubmitting(false);
        isSubmittingRef.current = false;
      }
    },
    [session.id, onFinished]
  );

  // 3. Countdown timer tick
  useEffect(() => {
    if (loading || isSubmitting) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit('time_expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [loading, isSubmitting, handleAutoSubmit]);

  // 4. Page Visibility API handling for EXAM MODE
  useEffect(() => {
    if (session.mode !== 'EXAM' || loading || isSubmitting) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchAlert(true);
        handleAutoSubmit('tab_switch');
      }
    };

    const handleBlur = () => {
      // Blur can sometimes fire on iframe focus, so we check document.hidden
      if (document.hidden) {
        setTabSwitchAlert(true);
        handleAutoSubmit('tab_switch');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [session.mode, loading, isSubmitting, handleAutoSubmit]);

  // 5. Answer saver with debounce
  const currentQuestion = questions[currentIndex];

  const saveCurrentAnswerToDb = async (qId: string, optIds: string[], text: string) => {
    setSaveStatus('saving');
    const spentSeconds = Math.max(1, Math.round((Date.now() - questionStartTimeRef.current) / 1000));
    questionStartTimeRef.current = Date.now();

    try {
      await quizApi.saveAnswer(session.id, {
        question_id: qId,
        selected_option_ids: optIds,
        answer_text: text,
        time_spent_seconds: spentSeconds,
      });
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to save answer:', err);
      setSaveStatus('error');
    }
  };

  // Option selection handlers
  const handleSingleOptionSelect = (optionId: string) => {
    if (!currentQuestion) return;
    const nextAnswers = {
      ...answers,
      [currentQuestion.id]: {
        selected_option_ids: [optionId],
        answer_text: '',
      },
    };
    setAnswers(nextAnswers);
    saveCurrentAnswerToDb(currentQuestion.id, [optionId], '');
  };

  const handleMultiOptionToggle = (optionId: string) => {
    if (!currentQuestion) return;
    const existing = answers[currentQuestion.id]?.selected_option_ids || [];
    let updated: string[];
    if (existing.includes(optionId)) {
      updated = existing.filter((id) => id !== optionId);
    } else {
      updated = [...existing, optionId];
    }

    const nextAnswers = {
      ...answers,
      [currentQuestion.id]: {
        selected_option_ids: updated,
        answer_text: '',
      },
    };
    setAnswers(nextAnswers);
    saveCurrentAnswerToDb(currentQuestion.id, updated, '');
  };

  const handleTextInputChange = (text: string) => {
    if (!currentQuestion) return;
    const nextAnswers = {
      ...answers,
      [currentQuestion.id]: {
        selected_option_ids: [],
        answer_text: text,
      },
    };
    setAnswers(nextAnswers);
  };

  const handleTextBlur = () => {
    if (!currentQuestion) return;
    const text = answers[currentQuestion.id]?.answer_text || '';
    saveCurrentAnswerToDb(currentQuestion.id, [], text);
  };

  const handleClearResponse = () => {
    if (!currentQuestion) return;
    const nextAnswers = {
      ...answers,
      [currentQuestion.id]: {
        selected_option_ids: [],
        answer_text: '',
      },
    };
    setAnswers(nextAnswers);
    saveCurrentAnswerToDb(currentQuestion.id, [], '');
  };

  // Timer formatted MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isLowTime = secondsRemaining < 120;
  const isCriticalTime = secondsRemaining < 60;

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-16 border border-[#c5c6ce]/30 flex flex-col items-center justify-center gap-3">
        <div className="w-9 h-9 border-3 border-[#0051d5] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[14px] text-[#75777e] font-medium">Preparing authoritative quiz paper...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto p-8 bg-white rounded-3xl border border-rose-200 text-center flex flex-col items-center gap-4">
        <span className="material-symbols-outlined text-rose-600 text-[48px]">warning</span>
        <h3 className="text-[18px] font-bold text-[#0b1c30]">Assessment Encountered an Error</h3>
        <p className="text-[13px] text-[#75777e]">{error}</p>
        <button
          onClick={onExit}
          className="px-6 py-2 rounded-xl bg-[#0051d5] text-white text-[13px] font-bold"
        >
          Return to Quizzes
        </button>
      </div>
    );
  }

  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const answeredCount = Object.values(answers).filter(
    (a) => a.selected_option_ids.length > 0 || (a.answer_text && a.answer_text.trim().length > 0)
  ).length;

  return (
    <div className="max-w-4xl mx-auto pb-24">
      {/* Tab Switch Overlay Warning (Exam Mode) */}
      {tabSwitchAlert && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-rose-200 shadow-2xl flex flex-col items-center text-center gap-4">
            <span className="material-symbols-outlined text-rose-600 text-[48px] animate-bounce">
              gavel
            </span>
            <h3 className="text-[20px] font-bold text-[#0b1c30]">
              Exam Mode Violation Detected
            </h3>
            <p className="text-[13px] text-[#44474d] leading-relaxed">
              Window focus loss or tab switch was detected via the Page Visibility API. As per strict exam rules, your paper has been automatically submitted to PostgreSQL for evaluation.
            </p>
            <div className="w-5 h-5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[11px] text-[#75777e]">Submitting responses...</p>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-[#c5c6ce]/30 shadow-xs mb-6 flex flex-wrap items-center justify-between gap-4 sticky top-4 z-20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {session.mode === 'EXAM' ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-200 rounded-full text-rose-700 text-[11px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
              Exam Mode
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[#eff4ff] border border-[#0051d5]/20 rounded-full text-[#0051d5] text-[11px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0051d5]"></span>
              Practice Mode
            </div>
          )}

          <div>
            <h2 className="text-[15px] font-bold text-[#0b1c30] truncate max-w-[200px] sm:max-w-[320px]">
              {quizMeta?.title || 'Quiz Paper'}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-[#75777e]">
              <span>
                Question {currentIndex + 1} of {questions.length}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                {saveStatus === 'saving' && (
                  <span className="text-amber-600 font-medium">Saving...</span>
                )}
                {saveStatus === 'saved' && (
                  <span className="text-emerald-600 font-medium flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">cloud_done</span>
                    Saved
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-rose-600 font-medium">Retry save</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Timer & Submit */}
        <div className="flex items-center gap-3">
          {/* Server-Authoritative Clock */}
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-2xl border font-mono font-bold text-[14px] transition-colors ${
              isCriticalTime
                ? 'bg-rose-500 text-white border-rose-600 animate-pulse'
                : isLowTime
                ? 'bg-amber-50 text-amber-700 border-amber-300'
                : 'bg-[#f8f9ff] text-[#0b1c30] border-[#c5c6ce]/30'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isCriticalTime ? 'alarm' : 'schedule'}
            </span>
            <span>{formatTime(secondsRemaining)}</span>
          </div>

          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl bg-[#0051d5] hover:bg-[#003ea8] text-white text-[12px] font-bold shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span className="material-symbols-outlined text-[16px]">task_alt</span>
            )}
            <span>Submit</span>
          </button>
        </div>
      </div>

      {/* Main Question & Navigation Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Question Area (3 cols) */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {currentQuestion && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#c5c6ce]/30 shadow-xs flex flex-col gap-6">
              {/* Question Meta Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#c5c6ce]/20">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#0051d5] bg-[#eff4ff] px-2.5 py-0.5 rounded-full">
                    {currentQuestion.section}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#75777e] bg-slate-100 px-2 py-0.5 rounded-full">
                    {currentQuestion.question_type.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    +{currentQuestion.marks} Mark{currentQuestion.marks > 1 ? 's' : ''}
                  </span>
                  {quizMeta?.negative_marking && (
                    <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                      -{quizMeta.negative_mark_value}
                    </span>
                  )}
                </div>
              </div>

              {/* Question Text */}
              <div>
                <p className="text-[16px] sm:text-[18px] font-medium text-[#0b1c30] leading-relaxed">
                  <span className="font-bold text-[#0051d5] mr-2">
                    Q{currentIndex + 1}.
                  </span>
                  {currentQuestion.question_text}
                </p>
              </div>

              {/* Interactive Options Area */}
              <div className="flex flex-col gap-3">
                {/* MCQ / TRUE_FALSE (Single choice) */}
                {(currentQuestion.question_type === 'MCQ' ||
                  currentQuestion.question_type === 'TRUE_FALSE') && (
                  <div className="space-y-2.5">
                    {currentQuestion.options.map((opt, idx) => {
                      const isSelected = currentAnswer?.selected_option_ids.includes(opt.id);
                      const letter = String.fromCharCode(65 + idx); // A, B, C, D
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSingleOptionSelect(opt.id)}
                          className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-3.5 ${
                            isSelected
                              ? 'bg-[#eff4ff] border-[#0051d5] ring-1 ring-[#0051d5]'
                              : 'bg-[#f8f9ff]/70 border-[#c5c6ce]/30 hover:bg-[#f8f9ff] hover:border-[#c5c6ce]'
                          }`}
                        >
                          <span
                            className={`w-7 h-7 rounded-xl flex items-center justify-center text-[12px] font-bold shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-[#0051d5] text-white'
                                : 'bg-white text-[#44474d] border border-[#c5c6ce]/40'
                            }`}
                          >
                            {letter}
                          </span>
                          <span className="text-[14px] text-[#0b1c30] font-medium leading-relaxed mt-0.5">
                            {opt.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* MULTIPLE_SELECT (Checkboxes) */}
                {currentQuestion.question_type === 'MULTIPLE_SELECT' && (
                  <div className="space-y-2.5">
                    <div className="text-[12px] text-[#75777e] italic mb-1">
                      Select all correct options that apply:
                    </div>
                    {currentQuestion.options.map((opt, idx) => {
                      const isSelected = currentAnswer?.selected_option_ids.includes(opt.id);
                      const letter = String.fromCharCode(65 + idx);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleMultiOptionToggle(opt.id)}
                          className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-3.5 ${
                            isSelected
                              ? 'bg-[#eff4ff] border-[#0051d5] ring-1 ring-[#0051d5]'
                              : 'bg-[#f8f9ff]/70 border-[#c5c6ce]/30 hover:bg-[#f8f9ff] hover:border-[#c5c6ce]'
                          }`}
                        >
                          <span
                            className={`w-7 h-7 rounded-xl flex items-center justify-center text-[12px] font-bold shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-[#0051d5] text-white'
                                : 'bg-white text-[#44474d] border border-[#c5c6ce]/40'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {isSelected ? 'check' : letter}
                            </span>
                          </span>
                          <span className="text-[14px] text-[#0b1c30] font-medium leading-relaxed mt-0.5">
                            {opt.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* FILL_BLANK (Single text input) */}
                {currentQuestion.question_type === 'FILL_BLANK' && (
                  <div className="space-y-2">
                    <label className="block text-[12px] font-bold uppercase tracking-wider text-[#44474d]">
                      Your Answer:
                    </label>
                    <input
                      type="text"
                      value={currentAnswer?.answer_text || ''}
                      onChange={(e) => handleTextInputChange(e.target.value)}
                      onBlur={handleTextBlur}
                      placeholder="Type exact answer or numerical value..."
                      className="w-full bg-[#f8f9ff] border border-[#c5c6ce]/40 rounded-xl px-4 py-3 text-[14px] font-medium text-[#0b1c30] outline-none focus:bg-white focus:border-[#0051d5]"
                    />
                    <span className="text-[11px] text-[#75777e]">
                      Automated string matching will evaluate your submitted answer upon paper completion.
                    </span>
                  </div>
                )}

                {/* VERY_SHORT, SHORT, LONG (Subjective text area) */}
                {(currentQuestion.question_type === 'VERY_SHORT' ||
                  currentQuestion.question_type === 'SHORT' ||
                  currentQuestion.question_type === 'LONG') && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[12px] font-bold uppercase tracking-wider text-[#44474d]">
                        Subjective Response:
                      </label>
                      <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual Evaluation / Ungraded State
                      </span>
                    </div>
                    <textarea
                      rows={5}
                      value={currentAnswer?.answer_text || ''}
                      onChange={(e) => handleTextInputChange(e.target.value)}
                      onBlur={handleTextBlur}
                      placeholder="Write your explanation or step-by-step derivation..."
                      className="w-full bg-[#f8f9ff] border border-[#c5c6ce]/40 rounded-xl p-4 text-[14px] font-medium text-[#0b1c30] outline-none focus:bg-white focus:border-[#0051d5] resize-y"
                    />
                  </div>
                )}
              </div>

              {/* Bottom Actions of Question Card */}
              <div className="flex items-center justify-between pt-4 border-t border-[#c5c6ce]/20">
                <button
                  type="button"
                  onClick={handleClearResponse}
                  disabled={
                    !currentAnswer ||
                    (currentAnswer.selected_option_ids.length === 0 &&
                      !currentAnswer.answer_text)
                  }
                  className="text-[12px] font-semibold text-[#75777e] hover:text-rose-600 disabled:opacity-40 transition-colors"
                >
                  Clear Response
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                    disabled={currentIndex === 0}
                    className="px-4 py-2 rounded-xl border border-[#c5c6ce]/40 text-[12px] font-semibold text-[#44474d] hover:bg-[#f8f9ff] disabled:opacity-40 transition-all flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                    Previous
                  </button>

                  {currentIndex < questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))
                      }
                      className="px-5 py-2 rounded-xl bg-[#0051d5] hover:bg-[#003ea8] text-white text-[12px] font-bold shadow-xs transition-all flex items-center gap-1"
                    >
                      Next
                      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowConfirmModal(true)}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold shadow-xs transition-all flex items-center gap-1"
                    >
                      Review & Submit
                      <span className="material-symbols-outlined text-[16px]">check</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Question Navigator Sidebar (1 col) */}
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-3xl p-5 border border-[#c5c6ce]/30 shadow-xs">
            <h4 className="text-[12px] font-bold text-[#0b1c30] uppercase tracking-wider mb-3">
              Question Palette
            </h4>

            {/* Grid of question buttons */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              {questions.map((q, idx) => {
                const ans = answers[q.id];
                const isAnswered =
                  ans &&
                  (ans.selected_option_ids.length > 0 ||
                    (ans.answer_text && ans.answer_text.trim().length > 0));
                const isCurrent = idx === currentIndex;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-xl text-[12px] font-bold transition-all flex items-center justify-center ${
                      isCurrent
                        ? 'bg-[#0051d5] text-white ring-2 ring-[#0051d5] ring-offset-2'
                        : isAnswered
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-[#f8f9ff] text-[#44474d] border border-[#c5c6ce]/30 hover:bg-slate-100'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="pt-3 border-t border-[#c5c6ce]/20 space-y-1.5 text-[11px] text-[#75777e]">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-md bg-emerald-100 border border-emerald-300"></span>
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-md bg-[#f8f9ff] border border-[#c5c6ce]/30"></span>
                <span>Unanswered ({questions.length - answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-md bg-[#0051d5]"></span>
                <span>Current Question</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#c5c6ce]/40 shadow-2xl flex flex-col gap-4">
            <h3 className="text-[18px] font-bold text-[#0b1c30]">
              Ready to Submit Assessment?
            </h3>
            <p className="text-[13px] text-[#44474d] leading-relaxed">
              You have answered <strong>{answeredCount}</strong> out of{' '}
              <strong>{questions.length}</strong> questions.
              {answeredCount < questions.length && (
                <span className="block mt-1 text-amber-600 font-semibold">
                  Note: {questions.length - answeredCount} unanswered questions will be marked as skipped.
                </span>
              )}
            </p>

            <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-[#c5c6ce]/20">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl border border-[#c5c6ce]/40 text-[13px] font-semibold text-[#44474d] hover:bg-[#f8f9ff]"
              >
                Keep Reviewing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  handleAutoSubmit('manual_submit');
                }}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-[#0051d5] text-white text-[13px] font-bold hover:bg-[#003ea8] flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Grading Paper...</span>
                  </>
                ) : (
                  <span>Confirm & Submit</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
