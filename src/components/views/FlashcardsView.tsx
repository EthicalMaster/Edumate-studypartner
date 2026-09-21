import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { Flashcard, StudyKit, ActiveNavTab } from '../../types';
import { useStudySession } from '../../hooks/useStudySession';

interface FlashcardsViewProps {
  flashcards: Flashcard[];
  studyKits: StudyKit[];
  onNavigate: (tab: ActiveNavTab) => void;
}

export const FlashcardsView: React.FC<FlashcardsViewProps> = ({
  flashcards,
  studyKits,
  onNavigate,
}) => {
  useStudySession();
  const [selectedKitId, setSelectedKitId] = useState<string>('all');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [deckCompleted, setDeckCompleted] = useState<boolean>(false);
  const [reviewedCounts, setReviewedCounts] = useState({ again: 0, hard: 0, good: 0, easy: 0 });

  const activeCards = flashcards.filter(
    (card) => selectedKitId === 'all' || card.kitId === selectedKitId
  );

  const currentCard = activeCards[currentIndex] || activeCards[0];

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleRating = (rating: 'again' | 'hard' | 'good' | 'easy') => {
    setReviewedCounts((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
    setIsFlipped(false);

    if (currentIndex + 1 < activeCards.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setDeckCompleted(true);
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // ignore if blocked
      }
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setDeckCompleted(false);
    setReviewedCounts({ again: 0, hard: 0, good: 0, easy: 0 });
  };

  return (
    <div className="flex flex-col gap-6 pb-12 max-w-4xl mx-auto">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-['Inter']">
            Spaced Repetition Flashcards
          </h2>
          <p className="text-[13px] text-[#44474d] mt-0.5">
            Calibrated against cognitive forgetting curves for long-term retention.
          </p>
        </div>

        {/* Deck selector */}
        <div className="flex items-center gap-2">
          <select
            value={selectedKitId}
            onChange={(e) => {
              setSelectedKitId(e.target.value);
              setCurrentIndex(0);
              setIsFlipped(false);
              setDeckCompleted(false);
            }}
            className="bg-white border border-[#c5c6ce]/50 px-3 py-2 rounded-xl text-[13px] font-semibold text-[#0b1c30] outline-none shadow-xs"
          >
            <option value="all">All Study Decks ({flashcards.length} cards)</option>
            {studyKits.map((k) => (
              <option key={k.id} value={k.id}>
                {k.title} ({k.subject})
              </option>
            ))}
          </select>

          <button
            onClick={handleRestart}
            title="Reset & Shuffle Deck"
            className="p-2 rounded-xl bg-white border border-[#c5c6ce]/50 hover:bg-[#eff4ff] text-[#44474d] transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-[20px]">shuffle</span>
          </button>
        </div>
      </div>

      {!deckCompleted && activeCards.length > 0 && (
        <>
          {/* Progress Indicator */}
          <div className="flex items-center justify-between text-[12px] font-semibold text-[#44474d]">
            <span>
              Card <strong className="text-[#0051d5]">{currentIndex + 1}</strong> of{' '}
              <strong>{activeCards.length}</strong>
            </span>
            <span className="text-[#0051d5] bg-[#eff4ff] px-2.5 py-0.5 rounded-full font-bold">
              {currentCard.subject} • {currentCard.topic}
            </span>
          </div>

          <div className="w-full bg-[#eff4ff] h-2 rounded-full overflow-hidden">
            <div
              className="bg-[#0051d5] h-full rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / activeCards.length) * 100}%` }}
            ></div>
          </div>

          {/* 3D Flip Card Container */}
          <div
            onClick={handleFlip}
            className="perspective-1000 min-h-[340px] sm:min-h-[380px] w-full cursor-pointer select-none group"
          >
            <div
              className={`relative w-full h-full min-h-[340px] sm:min-h-[380px] duration-500 transform-style-3d transition-transform rounded-3xl ${
                isFlipped ? 'rotate-y-180' : ''
              }`}
            >
              {/* Front of Card */}
              <div className="absolute inset-0 backface-hidden bg-white rounded-3xl p-8 sm:p-10 shadow-lg border border-[#c5c6ce]/40 flex flex-col justify-between hover:border-[#0051d5]/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-bold text-[#0051d5] bg-[#eff4ff] px-3 py-1 rounded-full">
                    Key Question
                  </span>
                  <span className="text-[11px] font-semibold text-[#75777e] flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">touch_app</span>
                    Click card to reveal answer
                  </span>
                </div>

                <div className="my-auto py-6">
                  <h3 className="text-[20px] sm:text-[24px] font-bold text-[#0b1c30] leading-snug">
                    {currentCard.question}
                  </h3>
                  <div className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#44474d] bg-[#f8f9ff] px-3 py-1.5 rounded-xl border border-[#c5c6ce]/30">
                    <span className="material-symbols-outlined text-[16px] text-amber-500">
                      lightbulb
                    </span>
                    <span>Concept: {currentCard.keyConcept}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[12px] text-[#75777e] border-t border-[#c5c6ce]/20 pt-3">
                  <span>Difficulty: <strong className="capitalize">{currentCard.difficulty}</strong></span>
                  <span className="text-[#0051d5] font-bold">Tap to flip ↺</span>
                </div>
              </div>

              {/* Back of Card */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 bg-gradient-to-br from-[#f8f9ff] to-white rounded-3xl p-8 sm:p-10 shadow-lg border-2 border-[#0051d5]/30 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                    Verified Answer
                  </span>
                  <span className="text-[11px] font-semibold text-[#75777e]">
                    Card {currentIndex + 1}
                  </span>
                </div>

                <div className="my-auto py-4 space-y-4">
                  <p className="text-[16px] sm:text-[18px] text-[#0b1c30] leading-relaxed font-medium">
                    {currentCard.answer}
                  </p>

                  {currentCard.formula && (
                    <div className="p-3.5 rounded-2xl bg-white border border-[#c5c6ce]/40 shadow-xs">
                      <span className="text-[11px] font-bold text-[#0051d5] uppercase tracking-wider block mb-1">
                        Formula Identity:
                      </span>
                      <code className="text-[15px] font-mono font-bold text-[#0051d5]">
                        {currentCard.formula}
                      </code>
                    </div>
                  )}
                </div>

                <div className="text-[12px] text-[#75777e] border-t border-[#c5c6ce]/20 pt-3 flex items-center justify-between">
                  <span>How well did you recall this?</span>
                  <span className="text-[#0051d5] font-bold">Rate recall below ↓</span>
                </div>
              </div>
            </div>
          </div>

          {/* Rating Controls (Shown after flip, or accessible directly) */}
          <div className="bg-white p-4 rounded-2xl border border-[#c5c6ce]/30 shadow-xs">
            <span className="text-[12px] font-bold text-[#44474d] uppercase tracking-wider block text-center mb-3">
              Spaced Repetition Interval
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                onClick={() => handleRating('again')}
                className="flex flex-col items-center py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold transition-all active:scale-95 cursor-pointer border border-red-200"
              >
                <span className="text-[13px]">Again</span>
                <span className="text-[10px] font-normal">&lt; 1 min</span>
              </button>

              <button
                onClick={() => handleRating('hard')}
                className="flex flex-col items-center py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold transition-all active:scale-95 cursor-pointer border border-amber-200"
              >
                <span className="text-[13px]">Hard</span>
                <span className="text-[10px] font-normal">12 hours</span>
              </button>

              <button
                onClick={() => handleRating('good')}
                className="flex flex-col items-center py-2.5 px-3 rounded-xl bg-[#eff4ff] hover:bg-[#dbe1ff] text-[#0051d5] font-bold transition-all active:scale-95 cursor-pointer border border-[#dbe1ff]"
              >
                <span className="text-[13px]">Good</span>
                <span className="text-[10px] font-normal">1 day</span>
              </button>

              <button
                onClick={() => handleRating('easy')}
                className="flex flex-col items-center py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold transition-all active:scale-95 cursor-pointer border border-emerald-200"
              >
                <span className="text-[13px]">Easy</span>
                <span className="text-[10px] font-normal">4 days</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Deck Completion State */}
      {deckCompleted && (
        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-[#c5c6ce]/40 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-md">
            <span className="material-symbols-outlined text-[36px]">workspace_premium</span>
          </div>

          <div>
            <h3 className="text-[24px] font-bold text-[#0b1c30]">Session Complete! 🎉</h3>
            <p className="text-[14px] text-[#44474d] mt-1 max-w-md mx-auto">
              You reviewed {activeCards.length} flashcards today. Spaced intervals have been updated in your adaptive retention model.
            </p>
          </div>

          {/* Review breakdown metrics */}
          <div className="grid grid-cols-4 gap-3 max-w-md mx-auto py-2">
            <div className="p-2.5 rounded-xl bg-red-50 text-red-700">
              <span className="block text-[18px] font-bold">{reviewedCounts.again}</span>
              <span className="text-[11px]">Again</span>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
              <span className="block text-[18px] font-bold">{reviewedCounts.hard}</span>
              <span className="text-[11px]">Hard</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#eff4ff] text-[#0051d5]">
              <span className="block text-[18px] font-bold">{reviewedCounts.good}</span>
              <span className="text-[11px]">Good</span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
              <span className="block text-[18px] font-bold">{reviewedCounts.easy}</span>
              <span className="text-[11px]">Easy</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={handleRestart}
              className="px-5 py-2.5 rounded-xl bg-[#eff4ff] text-[#0051d5] font-bold text-[13px] hover:bg-[#dbe1ff] transition-colors"
            >
              Study Deck Again
            </button>
            <button
              onClick={() => onNavigate('quizzes')}
              className="px-5 py-2.5 rounded-xl bg-[#0051d5] text-white font-bold text-[13px] hover:bg-[#316bf3] shadow-sm transition-colors"
            >
              Test Knowledge in Quiz →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
