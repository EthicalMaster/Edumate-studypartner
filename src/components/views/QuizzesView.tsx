import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { QuizQuestion, StudyKit, ActiveNavTab } from '../../types';

interface QuizzesViewProps {
  quizQuestions: QuizQuestion[];
  studyKits: StudyKit[];
  onNavigate: (tab: ActiveNavTab) => void;
  onRecordQuizCompletion?: () => void;
}

export const QuizzesView: React.FC<QuizzesViewProps> = ({
  quizQuestions,
  studyKits,
  onNavigate,
  onRecordQuizCompletion,
}) => {
  const [selectedKitId, setSelectedKitId] = useState<string>('all');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [isQuizCompleted, setIsQuizCompleted] = useState<boolean>(false);
  const [timedMode, setTimedMode] = useState<boolean>(true);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300); // 5 mins

  const filteredQuestions = quizQuestions.filter(
    (q) => selectedKitId === 'all' || q.kitId === selectedKitId
  );

  const currentQ = filteredQuestions[currentIndex] || filteredQuestions[0];

  // Countdown timer for Timed Mode
  useEffect(() => {
    let timer: any = null;
    if (timedMode && !isQuizCompleted && secondsRemaining > 0) {
      timer = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            setIsQuizCompleted(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [timedMode, isQuizCompleted, secondsRemaining]);

  const handleSelectOption = (optionId: string) => {
    if (isAnswerSubmitted) return;
    setSelectedOptionId(optionId);
  };

  const handleSubmitAnswer = () => {
    if (!selectedOptionId || isAnswerSubmitted) return;
    setIsAnswerSubmitted(true);
    if (selectedOptionId === currentQ.correctOptionId) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNextQuestion = () => {
    setSelectedOptionId(null);
    setIsAnswerSubmitted(false);

    if (currentIndex + 1 < filteredQuestions.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsQuizCompleted(true);
      if (onRecordQuizCompletion) onRecordQuizCompletion();
      try {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 },
        });
      } catch {
        // ignore
      }
    }
  };

  const handleRestartQuiz = () => {
    setCurrentIndex(0);
    setSelectedOptionId(null);
    setIsAnswerSubmitted(false);
    setScore(0);
    setIsQuizCompleted(false);
    setSecondsRemaining(300);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-6 pb-28 max-w-3xl mx-auto">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-['Inter']">
            Adaptive Diagnostic Quizzes
          </h2>
          <p className="text-[13px] text-[#44474d] mt-0.5">
            Exam-grade conceptual & computational challenges tailored to your proficiency.
          </p>
        </div>

        {/* Timed Mode Toggle & Deck filter */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTimedMode(!timedMode)}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-bold flex items-center gap-1.5 transition-all border ${
              timedMode
                ? 'bg-[#eff4ff] border-[#0051d5]/40 text-[#0051d5]'
                : 'bg-white border-[#c5c6ce]/40 text-[#75777e]'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">timer</span>
            <span>{timedMode ? `Timer: ${formatTimer(secondsRemaining)}` : 'Untimed'}</span>
          </button>

          <select
            value={selectedKitId}
            onChange={(e) => {
              setSelectedKitId(e.target.value);
              handleRestartQuiz();
            }}
            className="bg-white border border-[#c5c6ce]/50 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-[#0b1c30] outline-none shadow-xs"
          >
            <option value="all">All Topics ({quizQuestions.length} Questions)</option>
            {studyKits.map((k) => (
              <option key={k.id} value={k.id}>
                {k.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!isQuizCompleted && filteredQuestions.length > 0 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-[#c5c6ce]/30 flex flex-col gap-5">
          {/* Question Index & Info Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#c5c6ce]/20">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-[#0051d5] bg-[#eff4ff] px-2.5 py-1 rounded-full">
                Question {currentIndex + 1} of {filteredQuestions.length}
              </span>
              <span className="text-[12px] text-[#75777e] font-semibold">
                {currentQ.subject} • {currentQ.topic}
              </span>
            </div>
            <span className="text-[12px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full capitalize">
              {currentQ.difficulty}
            </span>
          </div>

          {/* Question Stem */}
          <h3 className="text-[18px] sm:text-[20px] font-bold text-[#0b1c30] leading-snug">
            {currentQ.question}
          </h3>

          {/* Options Grid */}
          <div className="flex flex-col gap-2.5 pt-2">
            {currentQ.options.map((opt) => {
              const isSelected = selectedOptionId === opt.id;
              const isCorrect = isAnswerSubmitted && opt.id === currentQ.correctOptionId;
              const isWrongSelected = isAnswerSubmitted && isSelected && !isCorrect;

              return (
                <div
                  key={opt.id}
                  onClick={() => handleSelectOption(opt.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    isCorrect
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold'
                      : isWrongSelected
                      ? 'bg-red-50 border-red-500 text-red-950 font-semibold'
                      : isSelected
                      ? 'bg-[#eff4ff] border-[#0051d5] text-[#0051d5] font-semibold shadow-xs ring-1 ring-[#0051d5]'
                      : 'bg-white border-[#c5c6ce]/40 text-[#0b1c30] hover:bg-[#f8f9ff] hover:border-[#0051d5]/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold uppercase ${
                        isCorrect
                          ? 'bg-emerald-600 text-white'
                          : isWrongSelected
                          ? 'bg-red-600 text-white'
                          : isSelected
                          ? 'bg-[#0051d5] text-white'
                          : 'bg-[#eff4ff] text-[#0051d5]'
                      }`}
                    >
                      {opt.id}
                    </span>
                    <span className="text-[14px]">{opt.text}</span>
                  </div>

                  {isAnswerSubmitted && isCorrect && (
                    <span className="material-symbols-outlined text-emerald-600 text-[20px]">
                      check_circle
                    </span>
                  )}
                  {isAnswerSubmitted && isWrongSelected && (
                    <span className="material-symbols-outlined text-red-600 text-[20px]">
                      cancel
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Explanation Banner when answered */}
          {isAnswerSubmitted && (
            <div className="mt-2 p-4 rounded-2xl bg-[#eff4ff] border border-[#dbe1ff] space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-[#0051d5] font-bold text-[13px]">
                <span className="material-symbols-outlined text-[18px]">psychology</span>
                <span>AI Concept Explanation</span>
              </div>
              <p className="text-[13px] text-[#334155] leading-relaxed">
                {currentQ.explanation}
              </p>
              {currentQ.formulaHint && (
                <div className="pt-1 text-[12px] font-mono text-[#0051d5]">
                  Governing Principle: <strong>{currentQ.formulaHint}</strong>
                </div>
              )}
            </div>
          )}

          {/* Action Row */}
          <div className="pt-4 border-t border-[#c5c6ce]/20 flex items-center justify-between">
            <span className="text-[12px] text-[#75777e]">
              Score: <strong className="text-[#0051d5] font-bold">{score}</strong> /{' '}
              {filteredQuestions.length}
            </span>

            {!isAnswerSubmitted ? (
              <button
                onClick={handleSubmitAnswer}
                disabled={!selectedOptionId}
                className={`px-5 py-2.5 rounded-xl font-bold text-[13px] transition-all ${
                  selectedOptionId
                    ? 'bg-[#0051d5] text-white hover:bg-[#316bf3] shadow-sm cursor-pointer'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Submit Answer
              </button>
            ) : (
              <button
                onClick={handleNextQuestion}
                className="px-5 py-2.5 rounded-xl bg-[#0051d5] text-white font-bold text-[13px] hover:bg-[#316bf3] shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <span>{currentIndex + 1 === filteredQuestions.length ? 'Finish Quiz' : 'Next Question'}</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quiz Completion Result Screen */}
      {isQuizCompleted && (
        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-[#c5c6ce]/40 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-[#eff4ff] text-[#0051d5] flex items-center justify-center mx-auto shadow-md">
            <span className="material-symbols-outlined text-[36px]">assignment_turned_in</span>
          </div>

          <div>
            <h3 className="text-[24px] font-bold text-[#0b1c30]">Quiz Completed!</h3>
            <p className="text-[14px] text-[#44474d] mt-1">
              Here is your diagnostic breakdown across evaluated questions.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#eff4ff] max-w-sm mx-auto border border-[#dbe1ff]">
            <span className="text-[12px] uppercase font-bold text-[#0051d5] tracking-wider">
              Overall Accuracy
            </span>
            <div className="text-[36px] font-bold text-[#0b1c30] mt-1">
              {Math.round((score / filteredQuestions.length) * 100)}%
            </div>
            <p className="text-[12px] text-[#44474d] mt-1">
              {score} correct out of {filteredQuestions.length} questions
            </p>
            <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[#0051d5] bg-white px-2.5 py-1 rounded-full shadow-xs">
              <span className="material-symbols-outlined text-[14px]">stars</span>
              <span>Top 15% in Cohort this week</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={handleRestartQuiz}
              className="px-5 py-2.5 rounded-xl bg-[#eff4ff] text-[#0051d5] font-bold text-[13px] hover:bg-[#dbe1ff] transition-colors"
            >
              Retake Quiz
            </button>
            <button
              onClick={() => onNavigate('weak-topics')}
              className="px-5 py-2.5 rounded-xl bg-[#0051d5] text-white font-bold text-[13px] hover:bg-[#316bf3] shadow-sm transition-colors"
            >
              Address Weak Topics →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
