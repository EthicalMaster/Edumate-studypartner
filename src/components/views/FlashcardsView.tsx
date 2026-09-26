/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { ActiveNavTab, Flashcard, StudyKit } from '../../types';
import { useStudySession } from '../../hooks/useStudySession';
import {
  flashcardApi,
  type FlashcardItem,
  type FlashcardDashboardResponse,
  type TopicDeckSummary,
} from '../../services/flashcardApi';

interface FlashcardsViewProps {
  onNavigate: (tab: ActiveNavTab) => void;
  flashcards?: Flashcard[];
  studyKits?: StudyKit[];
}

export const FlashcardsView: React.FC<FlashcardsViewProps> = ({ onNavigate }) => {
  useStudySession('Flashcards', 'Adaptive Spaced Repetition');

  // Dashboard Data State
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<FlashcardDashboardResponse['dashboard'] | null>(null);

  // Dashboard Navigation Tabs
  const [activeTab, setActiveTab] = useState<'curriculum' | 'materials' | 'library'>('curriculum');

  // Curriculum Subject Expansion
  const [selectedCurriculumSubject, setSelectedCurriculumSubject] = useState<string | null>(null);
  const [subjectTopics, setSubjectTopics] = useState<TopicDeckSummary[]>([]);
  const [loadingTopics, setLoadingTopics] = useState<boolean>(false);

  // Library / Search Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [filterMastery, setFilterMastery] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [libraryCards, setLibraryCards] = useState<FlashcardItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState<boolean>(false);

  // Active Review Session State
  const [isReviewing, setIsReviewing] = useState<boolean>(false);
  const [sessionTitle, setSessionTitle] = useState<string>('');
  const [activeDeck, setActiveDeck] = useState<FlashcardItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [deckCompleted, setDeckCompleted] = useState<boolean>(false);
  const [reviewedCounts, setReviewedCounts] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [cardStartTime, setCardStartTime] = useState<number>(Date.now());
  const [submittingRating, setSubmittingRating] = useState<boolean>(false);

  // Material Generation State
  const [generatingMaterialId, setGeneratingMaterialId] = useState<string | null>(null);
  const [notificationMsg, setNotificationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Custom Card Modal
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState({
    subject: '',
    topic: '',
    question: '',
    answer: '',
    keyConcept: '',
    formula: '',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
  });

  // Load Dashboard Data
  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await flashcardApi.getDashboard();
      setDashboard(res.dashboard);

      // Default selected curriculum subject to first eligible subject
      if (res.dashboard.curriculumSubjects.length > 0 && !selectedCurriculumSubject) {
        const firstSub = res.dashboard.curriculumSubjects[0].subject;
        setSelectedCurriculumSubject(firstSub);
        loadSubjectTopics(firstSub);
      }
    } catch (err: any) {
      console.error('[FlashcardsView] Failed to load dashboard:', err);
      setError(err.message || 'Failed to load flashcard system.');
    } finally {
      setLoading(false);
    }
  }, [selectedCurriculumSubject]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Load Topics for Curriculum Subject
  const loadSubjectTopics = async (subject: string) => {
    try {
      setLoadingTopics(true);
      const res = await flashcardApi.getCurriculumSubjectTopics(subject);
      setSubjectTopics(res.topics);
    } catch (err) {
      console.error('[FlashcardsView] Failed to load topics:', err);
    } finally {
      setLoadingTopics(false);
    }
  };

  const handleSelectCurriculumSubject = (subject: string) => {
    setSelectedCurriculumSubject(subject);
    loadSubjectTopics(subject);
  };

  // Load Library Cards
  const loadLibraryCards = useCallback(async () => {
    try {
      setLibraryLoading(true);
      const res = await flashcardApi.getFlashcards({
        search: searchQuery || undefined,
        difficulty: filterDifficulty !== 'all' ? (filterDifficulty as any) : undefined,
        masteryState: filterMastery !== 'all' ? (filterMastery as any) : undefined,
        sourceType: filterSource !== 'all' ? (filterSource as any) : undefined,
        limit: 40,
      });
      setLibraryCards(res.cards);
    } catch (err) {
      console.error('[FlashcardsView] Failed to load library:', err);
    } finally {
      setLibraryLoading(false);
    }
  }, [searchQuery, filterDifficulty, filterMastery, filterSource]);

  useEffect(() => {
    if (activeTab === 'library') {
      loadLibraryCards();
    }
  }, [activeTab, loadLibraryCards]);

  // Start Review Session
  const startSession = async (
    title: string,
    mode: 'due' | 'weak' | 'recommended' | 'curriculum' | 'material' | 'all',
    subject?: string,
    topic?: string,
    materialId?: string
  ) => {
    try {
      setLoading(true);
      const res = await flashcardApi.getDeck({
        mode,
        subject,
        topic,
        materialId,
        limit: 25,
      });

      if (!res.cards || res.cards.length === 0) {
        setNotificationMsg({
          type: 'error',
          text: `No cards currently available for ${title}. Try selecting another deck!`,
        });
        setTimeout(() => setNotificationMsg(null), 4000);
        setLoading(false);
        return;
      }

      setSessionTitle(title);
      setActiveDeck(res.cards);
      setCurrentIndex(0);
      setIsFlipped(false);
      setShowHint(false);
      setDeckCompleted(false);
      setReviewedCounts({ again: 0, hard: 0, good: 0, easy: 0 });
      setCardStartTime(Date.now());
      setIsReviewing(true);
    } catch (err: any) {
      console.error('[FlashcardsView] Failed to start deck:', err);
      setNotificationMsg({
        type: 'error',
        text: err.message || 'Could not launch review deck.',
      });
      setTimeout(() => setNotificationMsg(null), 4000);
    } finally {
      setLoading(false);
    }
  };

  const currentCard = activeDeck[currentIndex];

  // Submit Rating Handler
  const handleRating = async (rating: 1 | 2 | 3 | 4) => {
    if (!currentCard || submittingRating) return;

    const ratingKey = rating === 1 ? 'again' : rating === 2 ? 'hard' : rating === 3 ? 'good' : 'easy';
    setReviewedCounts((prev) => ({ ...prev, [ratingKey]: prev[ratingKey] + 1 }));

    const timeSpent = Math.max(100, Date.now() - cardStartTime);
    setSubmittingRating(true);

    try {
      await flashcardApi.submitReview(currentCard.id, rating, timeSpent);
    } catch (err) {
      console.warn('[FlashcardsView] Failed to sync review with server:', err);
    } finally {
      setSubmittingRating(false);
    }

    setIsFlipped(false);
    setShowHint(false);

    if (currentIndex + 1 < activeDeck.length) {
      setCurrentIndex(currentIndex + 1);
      setCardStartTime(Date.now());
    } else {
      setDeckCompleted(true);
      try {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 },
        });
      } catch {
        // confetti fallback
      }
      // Refresh background dashboard data
      loadDashboard();
    }
  };

  // Keyboard Navigation for Active Session
  useEffect(() => {
    if (!isReviewing || deckCompleted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid capturing when typing inside inputs
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (e.key === '1') {
        e.preventDefault();
        handleRating(1);
      } else if (e.key === '2') {
        e.preventDefault();
        handleRating(2);
      } else if (e.key === '3') {
        e.preventDefault();
        handleRating(3);
      } else if (e.key === '4') {
        e.preventDefault();
        handleRating(4);
      } else if (e.key === 'Escape') {
        setIsReviewing(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReviewing, deckCompleted, isFlipped, currentIndex, activeDeck]);

  // Generate Flashcards from Document
  const handleGenerateFromMaterial = async (materialId: string, title: string) => {
    try {
      setGeneratingMaterialId(materialId);
      const res = await flashcardApi.generateFromMaterial(materialId);
      setNotificationMsg({
        type: 'success',
        text: `Generated ${res.totalGenerated} active recall flashcards from "${title}".`,
      });
      setTimeout(() => setNotificationMsg(null), 5000);
      await loadDashboard();
    } catch (err: any) {
      console.error('[FlashcardsView] Document flashcard generation failed:', err);
      setNotificationMsg({
        type: 'error',
        text: err.message || 'Failed to synthesize flashcards from document.',
      });
      setTimeout(() => setNotificationMsg(null), 5000);
    } finally {
      setGeneratingMaterialId(null);
    }
  };

  // Custom Card Creation
  const handleCreateCustomCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.subject || !createForm.topic || !createForm.question || !createForm.answer) {
      alert('Please fill in Subject, Topic, Question, and Answer.');
      return;
    }

    try {
      await flashcardApi.createCustomCard({
        subject: createForm.subject,
        topic: createForm.topic,
        question: createForm.question,
        answer: createForm.answer,
        keyConcept: createForm.keyConcept || createForm.topic,
        formula: createForm.formula || undefined,
        difficulty: createForm.difficulty,
      });

      setIsCreateOpen(false);
      setCreateForm({
        subject: '',
        topic: '',
        question: '',
        answer: '',
        keyConcept: '',
        formula: '',
        difficulty: 'medium',
      });
      setNotificationMsg({
        type: 'success',
        text: 'Custom flashcard created successfully.',
      });
      setTimeout(() => setNotificationMsg(null), 4000);
      await loadDashboard();
      if (activeTab === 'library') {
        loadLibraryCards();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create card');
    }
  };

  // ==========================================================================
  // RENDER: ACTIVE STUDY SESSION VIEW
  // ==========================================================================
  if (isReviewing) {
    return (
      <div className="flex flex-col gap-6 pb-12 max-w-4xl mx-auto">
        {/* Session Top Bar */}
        <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-[#c5c6ce]/30 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsReviewing(false)}
              className="p-2 rounded-xl bg-[#eff4ff] text-[#0051d5] hover:bg-[#dbe1ff] transition-colors"
              title="Exit Session"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div>
              <h2 className="text-[16px] font-bold text-[#0b1c30] tracking-tight">
                {sessionTitle}
              </h2>
              <p className="text-[12px] text-[#75777e]">
                AVEN Adaptive Spaced Repetition (SM-2)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-[#0051d5] bg-[#eff4ff] px-3 py-1 rounded-full">
              Card {currentIndex + 1} of {activeDeck.length}
            </span>
          </div>
        </div>

        {!deckCompleted && currentCard && (
          <>
            {/* Progress Bar */}
            <div className="w-full bg-[#eff4ff] h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#0051d5] h-full rounded-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / activeDeck.length) * 100}%` }}
              ></div>
            </div>

            {/* 3D Flip Card Container */}
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="perspective-1000 min-h-[360px] sm:min-h-[420px] w-full cursor-pointer select-none group"
            >
              <div
                className={`relative w-full h-full min-h-[360px] sm:min-h-[420px] duration-500 transform-style-3d transition-transform rounded-3xl ${
                  isFlipped ? 'rotate-y-180' : ''
                }`}
              >
                {/* Front of Card */}
                <div className="absolute inset-0 backface-hidden bg-white rounded-3xl p-8 sm:p-10 shadow-lg border border-[#c5c6ce]/40 flex flex-col justify-between hover:border-[#0051d5]/40 transition-colors">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase font-bold text-[#0051d5] bg-[#eff4ff] px-3 py-1 rounded-full">
                        {currentCard.subject}
                      </span>
                      <span className="text-[11px] font-semibold text-[#44474d] bg-[#f8f9ff] px-2.5 py-1 rounded-full border border-[#c5c6ce]/30">
                        {currentCard.topic}
                      </span>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        currentCard.difficulty === 'easy'
                          ? 'bg-emerald-50 text-emerald-700'
                          : currentCard.difficulty === 'hard'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {currentCard.difficulty}
                      </span>
                    </div>

                    <span className="text-[11px] font-semibold text-[#75777e] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">touch_app</span>
                      Click or press Space to reveal answer
                    </span>
                  </div>

                  <div className="my-auto py-6">
                    <h3 className="text-[20px] sm:text-[24px] font-bold text-[#0b1c30] leading-snug">
                      {currentCard.question}
                    </h3>

                    {currentCard.key_concept && (
                      <div className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#44474d] bg-[#f8f9ff] px-3 py-1.5 rounded-xl border border-[#c5c6ce]/30">
                        <span className="material-symbols-outlined text-[16px] text-amber-500">
                          lightbulb
                        </span>
                        <span>Key Concept: {currentCard.key_concept}</span>
                      </div>
                    )}

                    {showHint && (currentCard.formula || currentCard.explanation) && (
                      <div className="mt-4 p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 text-[13px] animate-fadeIn">
                        <span className="font-bold block mb-1">💡 Memory Hint:</span>
                        {currentCard.formula && (
                          <div className="font-mono text-[13px] text-[#0051d5] font-semibold mb-1">
                            {currentCard.formula}
                          </div>
                        )}
                        {currentCard.explanation && (
                          <p className="line-clamp-2">{currentCard.explanation}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[12px] text-[#75777e] border-t border-[#c5c6ce]/20 pt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowHint(!showHint);
                      }}
                      className="text-[#0051d5] hover:underline font-semibold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">help</span>
                      {showHint ? 'Hide Hint' : 'Need a Hint?'}
                    </button>
                    <span className="text-[#0051d5] font-bold">Tap to flip ↺</span>
                  </div>
                </div>

                {/* Back of Card */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 bg-gradient-to-br from-[#f8f9ff] to-white rounded-3xl p-8 sm:p-10 shadow-lg border-2 border-[#0051d5]/30 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                        Verified Answer
                      </span>
                      <span className="text-[11px] font-semibold text-[#75777e]">
                        {currentCard.subject} • {currentCard.topic}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-[#75777e]">
                      Card {currentIndex + 1}
                    </span>
                  </div>

                  <div className="my-auto py-4 space-y-4">
                    <p className="text-[17px] sm:text-[19px] text-[#0b1c30] leading-relaxed font-medium">
                      {currentCard.answer}
                    </p>

                    {currentCard.formula && (
                      <div className="p-3.5 rounded-2xl bg-white border border-[#c5c6ce]/40 shadow-xs">
                        <span className="text-[11px] font-bold text-[#0051d5] uppercase tracking-wider block mb-1">
                          Mathematical Identity:
                        </span>
                        <code className="text-[15px] font-mono font-bold text-[#0051d5]">
                          {currentCard.formula}
                        </code>
                      </div>
                    )}

                    {currentCard.explanation && (
                      <div className="text-[13px] text-[#44474d] bg-[#f8f9ff] p-3 rounded-xl border border-[#c5c6ce]/30">
                        <span className="font-bold text-[#0b1c30] block mb-0.5">Explanation:</span>
                        {currentCard.explanation}
                      </div>
                    )}
                  </div>

                  <div className="text-[12px] text-[#75777e] border-t border-[#c5c6ce]/20 pt-3 flex items-center justify-between">
                    <span>How well did you recall this concept?</span>
                    <span className="text-[#0051d5] font-bold">Rate recall below (Keys 1 - 4) ↓</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Spaced Repetition Rating Controls */}
            <div className="bg-white p-5 rounded-3xl border border-[#c5c6ce]/30 shadow-xs">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[12px] font-bold text-[#44474d] uppercase tracking-wider">
                  Select Retention Rating (SM-2 Interval)
                </span>
                <span className="text-[11px] text-[#75777e]">
                  Calibrates your neural forgetting curve
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={() => handleRating(1)}
                  disabled={submittingRating}
                  className="flex flex-col items-center py-3 px-3 rounded-2xl bg-red-50 hover:bg-red-100 text-red-700 font-bold transition-all active:scale-95 cursor-pointer border border-red-200"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px]">Again</span>
                    <kbd className="text-[10px] bg-red-100 px-1.5 py-0.5 rounded text-red-800">1</kbd>
                  </div>
                  <span className="text-[11px] font-normal text-red-600 mt-0.5">&lt; 10 min</span>
                  <span className="text-[9px] text-red-500 uppercase tracking-tight">Memory reset</span>
                </button>

                <button
                  onClick={() => handleRating(2)}
                  disabled={submittingRating}
                  className="flex flex-col items-center py-3 px-3 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold transition-all active:scale-95 cursor-pointer border border-amber-200"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px]">Hard</span>
                    <kbd className="text-[10px] bg-amber-100 px-1.5 py-0.5 rounded text-amber-800">2</kbd>
                  </div>
                  <span className="text-[11px] font-normal text-amber-600 mt-0.5">1 day</span>
                  <span className="text-[9px] text-amber-500 uppercase tracking-tight">Struggled</span>
                </button>

                <button
                  onClick={() => handleRating(3)}
                  disabled={submittingRating}
                  className="flex flex-col items-center py-3 px-3 rounded-2xl bg-[#eff4ff] hover:bg-[#dbe1ff] text-[#0051d5] font-bold transition-all active:scale-95 cursor-pointer border border-[#dbe1ff]"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px]">Good</span>
                    <kbd className="text-[10px] bg-[#dbe1ff] px-1.5 py-0.5 rounded text-[#0051d5]">3</kbd>
                  </div>
                  <span className="text-[11px] font-normal text-[#0051d5] mt-0.5">
                    {currentCard.repetitions === 0 ? '1 day' : currentCard.repetitions === 1 ? '3 days' : `${Math.round(currentCard.interval_days * currentCard.ease_factor)} days`}
                  </span>
                  <span className="text-[9px] text-[#0051d5]/80 uppercase tracking-tight">Consolidating</span>
                </button>

                <button
                  onClick={() => handleRating(4)}
                  disabled={submittingRating}
                  className="flex flex-col items-center py-3 px-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold transition-all active:scale-95 cursor-pointer border border-emerald-200"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px]">Easy</span>
                    <kbd className="text-[10px] bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-800">4</kbd>
                  </div>
                  <span className="text-[11px] font-normal text-emerald-600 mt-0.5">
                    {currentCard.repetitions === 0 ? '2 days' : currentCard.repetitions === 1 ? '5 days' : `${Math.round(currentCard.interval_days * currentCard.ease_factor * 1.3)} days`}
                  </span>
                  <span className="text-[9px] text-emerald-500 uppercase tracking-tight">Rapid recall</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Deck Completion View */}
        {deckCompleted && (
          <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-[#c5c6ce]/40 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-md">
              <span className="material-symbols-outlined text-[36px]">workspace_premium</span>
            </div>

            <div>
              <h3 className="text-[24px] font-bold text-[#0b1c30]">Retention Drill Complete! 🎉</h3>
              <p className="text-[14px] text-[#44474d] mt-1 max-w-md mx-auto">
                You successfully reviewed {activeDeck.length} flashcards in this session. Spaced repetition intervals have been recalibrated in your Adaptive Student Model.
              </p>
            </div>

            {/* Breakdown metrics */}
            <div className="grid grid-cols-4 gap-3 max-w-md mx-auto py-2">
              <div className="p-3 rounded-2xl bg-red-50 text-red-700 border border-red-100">
                <span className="block text-[20px] font-bold">{reviewedCounts.again}</span>
                <span className="text-[11px] font-semibold">Again</span>
              </div>
              <div className="p-3 rounded-2xl bg-amber-50 text-amber-700 border border-amber-100">
                <span className="block text-[20px] font-bold">{reviewedCounts.hard}</span>
                <span className="text-[11px] font-semibold">Hard</span>
              </div>
              <div className="p-3 rounded-2xl bg-[#eff4ff] text-[#0051d5] border border-[#dbe1ff]">
                <span className="block text-[20px] font-bold">{reviewedCounts.good}</span>
                <span className="text-[11px] font-semibold">Good</span>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100">
                <span className="block text-[20px] font-bold">{reviewedCounts.easy}</span>
                <span className="text-[11px] font-semibold">Easy</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#eff4ff]/60 border border-[#0051d5]/20 max-w-lg mx-auto text-left flex items-start gap-3">
              <span className="material-symbols-outlined text-[#0051d5] text-[20px] mt-0.5">psychology</span>
              <div className="text-[12px] text-[#0b1c30]">
                <strong className="block font-bold">Adaptive Model Synchronized:</strong>
                Concepts rated &quot;Good&quot; or &quot;Easy&quot; updated memory consolidation states. Difficult concepts will resurface at high priority during your next review cycle.
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
              <button
                onClick={() => {
                  setCurrentIndex(0);
                  setIsFlipped(false);
                  setShowHint(false);
                  setDeckCompleted(false);
                  setReviewedCounts({ again: 0, hard: 0, good: 0, easy: 0 });
                  setCardStartTime(Date.now());
                }}
                className="px-5 py-2.5 rounded-xl bg-[#eff4ff] text-[#0051d5] font-bold text-[13px] hover:bg-[#dbe1ff] transition-colors"
              >
                Review This Deck Again
              </button>

              <button
                onClick={() => setIsReviewing(false)}
                className="px-5 py-2.5 rounded-xl bg-white border border-[#c5c6ce]/50 text-[#0b1c30] font-bold text-[13px] hover:bg-slate-50 transition-colors"
              >
                Return to Flashcards Hub
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
  }

  // ==========================================================================
  // RENDER: DASHBOARD LANDING VIEW
  // ==========================================================================
  return (
    <div className="flex flex-col gap-6 pb-12 max-w-6xl mx-auto">
      {/* Toast Notification */}
      {notificationMsg && (
        <div
          className={`p-4 rounded-2xl border text-[13px] font-semibold flex items-center justify-between ${
            notificationMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">
              {notificationMsg.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{notificationMsg.text}</span>
          </div>
          <button onClick={() => setNotificationMsg(null)} className="text-current opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold text-[#0b1c30] tracking-tight">
              Intelligent Flashcards 2.0
            </h1>
            <span className="text-[11px] font-bold uppercase tracking-wider bg-[#eff4ff] text-[#0051d5] px-2.5 py-0.5 rounded-full">
              SM-2 Spaced Repetition
            </span>
          </div>
          <p className="text-[13px] text-[#44474d] mt-1">
            Personalized active recall calibrated against cognitive forgetting curves and your academic stage:
            <strong className="text-[#0051d5] ml-1">
              {dashboard?.academicContext?.program || 'Academic Curriculum'} ({dashboard?.academicContext?.academicStage || 'Current Stage'})
            </strong>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white border border-[#c5c6ce]/50 hover:bg-[#f8f9ff] text-[#0b1c30] font-bold text-[13px] flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-[#0051d5]">add</span>
            <span>Create Card</span>
          </button>

          <button
            onClick={() => onNavigate('study-kits')}
            className="px-3.5 py-2 rounded-xl bg-[#0051d5] text-white font-bold text-[13px] hover:bg-[#316bf3] shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            <span>Upload Notes</span>
          </button>
        </div>
      </div>

      {/* Stats Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#75777e]">
            <span className="text-[12px] font-semibold">Total Flashcards</span>
            <span className="material-symbols-outlined text-[20px] text-[#0051d5]">style</span>
          </div>
          <div className="mt-3">
            <span className="text-[26px] font-bold text-[#0b1c30]">
              {dashboard?.stats?.totalCards || 0}
            </span>
            <span className="text-[11px] text-[#75777e] block mt-0.5">
              Across eligible curriculum & notes
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#75777e]">
            <span className="text-[12px] font-semibold">Due for Review Today</span>
            <span className="material-symbols-outlined text-[20px] text-amber-500">alarm</span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-bold text-[#0b1c30]">
                {dashboard?.stats?.dueTodayCount || 0}
              </span>
              {(dashboard?.stats?.dueTodayCount || 0) > 0 && (
                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  Action required
                </span>
              )}
            </div>
            <span className="text-[11px] text-[#75777e] block mt-0.5">
              {dashboard?.stats?.reviewedTodayCount || 0} cards reviewed today
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#75777e]">
            <span className="text-[12px] font-semibold">Mastered Knowledge</span>
            <span className="material-symbols-outlined text-[20px] text-emerald-600">verified</span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-bold text-emerald-700">
                {dashboard?.stats?.masteredCount || 0}
              </span>
              <span className="text-[12px] font-bold text-[#75777e]">
                ({dashboard?.stats?.totalCards ? Math.round(((dashboard.stats.masteredCount || 0) / dashboard.stats.totalCards) * 100) : 0}%)
              </span>
            </div>
            <span className="text-[11px] text-[#75777e] block mt-0.5">
              Long-term neural stability
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#75777e]">
            <span className="text-[12px] font-semibold">Retention Health</span>
            <span className="material-symbols-outlined text-[20px] text-[#0051d5]">psychology</span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-bold text-[#0051d5]">
                {dashboard?.stats?.retentionScore || 75}%
              </span>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Optimal
              </span>
            </div>
            <span className="text-[11px] text-[#75777e] block mt-0.5">
              Model memory recall index
            </span>
          </div>
        </div>
      </div>

      {/* Smart Quick Launch Review Action Banners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Due Cards Action */}
        <div className="bg-gradient-to-br from-[#0051d5] to-[#003896] text-white p-6 rounded-3xl shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider font-bold bg-white/20 px-2.5 py-0.5 rounded-full">
                Scheduled Daily
              </span>
              <span className="material-symbols-outlined text-[24px]">schedule</span>
            </div>
            <h3 className="text-[18px] font-bold mt-3">Due for Review</h3>
            <p className="text-[12px] text-white/80 mt-1">
              {(dashboard?.stats?.dueTodayCount || 0) > 0
                ? `${dashboard?.stats?.dueTodayCount} cards are currently approaching cognitive forgetting thresholds.`
                : 'All scheduled cards are up to date! Great consistency.'}
            </p>
          </div>
          <button
            onClick={() => startSession('Due Cards Review', 'due')}
            className="mt-5 w-full py-2.5 rounded-xl bg-white text-[#0051d5] font-bold text-[13px] hover:bg-[#eff4ff] transition-colors shadow-xs"
          >
            Review Due Cards ({(dashboard?.stats?.dueTodayCount || 0)}) →
          </button>
        </div>

        {/* Weak Topics Drill */}
        <div className="bg-white p-6 rounded-3xl border border-[#c5c6ce]/40 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full">
                Adaptive Targeted
              </span>
              <span className="material-symbols-outlined text-[24px] text-amber-500">crisis_alert</span>
            </div>
            <h3 className="text-[18px] font-bold text-[#0b1c30] mt-3">Target Weak Topics</h3>
            <p className="text-[12px] text-[#44474d] mt-1">
              {(dashboard?.weakTopicCards?.length || 0) > 0
                ? `Drill ${dashboard?.weakTopicCards?.length} cards flagged as decaying or needing revision by the Adaptive Model.`
                : 'No severe weak retention signals detected right now.'}
            </p>
          </div>
          <button
            onClick={() => startSession('Weak Topics Retention Drill', 'weak')}
            className="mt-5 w-full py-2.5 rounded-xl bg-[#eff4ff] text-[#0051d5] font-bold text-[13px] hover:bg-[#dbe1ff] transition-colors border border-[#dbe1ff]"
          >
            Target Weak Topics Drill →
          </button>
        </div>

        {/* Smart Recommended Deck */}
        <div className="bg-white p-6 rounded-3xl border border-[#c5c6ce]/40 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                AI Curated
              </span>
              <span className="material-symbols-outlined text-[24px] text-emerald-600">auto_awesome</span>
            </div>
            <h3 className="text-[18px] font-bold text-[#0b1c30] mt-3">Recommended Deck</h3>
            <p className="text-[12px] text-[#44474d] mt-1">
              Balanced 15-card session mixing active curriculum topics with high-yield recall items.
            </p>
          </div>
          <button
            onClick={() => startSession('Smart Recommended Session', 'recommended')}
            className="mt-5 w-full py-2.5 rounded-xl bg-[#0b1c30] text-white font-bold text-[13px] hover:bg-[#1a2d48] transition-colors shadow-xs"
          >
            Start Recommended Session →
          </button>
        </div>
      </div>

      {/* Main Two-Source Navigation & Library */}
      <div className="bg-white rounded-3xl border border-[#c5c6ce]/40 shadow-xs overflow-hidden">
        {/* Source Switcher Header */}
        <div className="border-b border-[#c5c6ce]/30 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 p-1 bg-[#eff4ff] rounded-2xl">
            <button
              onClick={() => setActiveTab('curriculum')}
              className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                activeTab === 'curriculum'
                  ? 'bg-white text-[#0051d5] shadow-xs'
                  : 'text-[#44474d] hover:text-[#0b1c30]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">school</span>
                <span>AVEN Curriculum</span>
                <span className="text-[11px] bg-[#eff4ff] text-[#0051d5] px-2 py-0.2 rounded-full font-bold ml-1">
                  {dashboard?.curriculumSubjects?.length || 0}
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('materials')}
              className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                activeTab === 'materials'
                  ? 'bg-white text-[#0051d5] shadow-xs'
                  : 'text-[#44474d] hover:text-[#0b1c30]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">folder_open</span>
                <span>My Study Materials</span>
                <span className="text-[11px] bg-[#eff4ff] text-[#0051d5] px-2 py-0.2 rounded-full font-bold ml-1">
                  {dashboard?.studyMaterialDecks?.length || 0}
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('library')}
              className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                activeTab === 'library'
                  ? 'bg-white text-[#0051d5] shadow-xs'
                  : 'text-[#44474d] hover:text-[#0b1c30]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">search</span>
                <span>Browse All Cards</span>
              </div>
            </button>
          </div>

          <div className="text-[12px] text-[#75777e] flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px] text-emerald-600">verified_user</span>
            <span>Curriculum filtered strictly by academic stage</span>
          </div>
        </div>

        {/* Tab 1: AVEN Curriculum (Subject -> Topic -> Cards) */}
        {activeTab === 'curriculum' && (
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Subject Selector Sidebar */}
              <div className="lg:col-span-4 flex flex-col gap-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#75777e] px-1">
                  Eligible Academic Subjects
                </span>

                {dashboard?.curriculumSubjects && dashboard.curriculumSubjects.length > 0 ? (
                  dashboard.curriculumSubjects.map((sub) => {
                    const isSelected = selectedCurriculumSubject === sub.subject;
                    return (
                      <div
                        key={sub.subject}
                        onClick={() => handleSelectCurriculumSubject(sub.subject)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#eff4ff] border-[#0051d5] shadow-xs'
                            : 'bg-white border-[#c5c6ce]/30 hover:border-[#c5c6ce] hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-[15px] text-[#0b1c30]">
                            {sub.subject}
                          </h4>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                            sub.retentionIndicator === 'fresh'
                              ? 'bg-emerald-50 text-emerald-700'
                              : sub.retentionIndicator === 'decaying' || sub.retentionIndicator === 'needs_revision'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}>
                            {sub.retentionIndicator || 'Consolidating'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-2 text-[12px] text-[#75777e]">
                          <span>{sub.totalCards} cards</span>
                          <span>•</span>
                          <span>{sub.topicCount} topics</span>
                          {sub.dueCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-amber-600 font-bold">{sub.dueCount} due</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-[#75777e] bg-slate-50 rounded-2xl">
                    No curriculum subjects eligible for current profile.
                  </div>
                )}
              </div>

              {/* Topic Breakdown & Practice Actions */}
              <div className="lg:col-span-8 bg-[#f8f9ff] rounded-3xl p-6 border border-[#c5c6ce]/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-[#c5c6ce]/30">
                    <div>
                      <h3 className="text-[18px] font-bold text-[#0b1c30]">
                        {selectedCurriculumSubject || 'Select a Subject'}
                      </h3>
                      <p className="text-[12px] text-[#75777e]">
                        Curriculum topics & active recall flashcards
                      </p>
                    </div>

                    {selectedCurriculumSubject && (
                      <button
                        onClick={() =>
                          startSession(
                            `${selectedCurriculumSubject} Subject Deck`,
                            'curriculum',
                            selectedCurriculumSubject
                          )
                        }
                        className="px-4 py-2 rounded-xl bg-[#0051d5] text-white font-bold text-[13px] hover:bg-[#316bf3] shadow-xs flex items-center gap-1.5 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                        <span>Practice Full Subject</span>
                      </button>
                    )}
                  </div>

                  {/* Topics List */}
                  <div className="mt-4 space-y-2.5">
                    {loadingTopics ? (
                      <div className="py-12 text-center text-[#75777e] text-[13px]">
                        Loading topic breakdown...
                      </div>
                    ) : subjectTopics.length > 0 ? (
                      subjectTopics.map((topicItem) => (
                        <div
                          key={topicItem.topic}
                          className="bg-white p-4 rounded-2xl border border-[#c5c6ce]/30 flex items-center justify-between hover:border-[#0051d5]/40 transition-colors shadow-xs"
                        >
                          <div>
                            <h5 className="font-bold text-[14px] text-[#0b1c30]">
                              {topicItem.topic}
                            </h5>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-[#75777e]">
                              <span>{topicItem.totalCards} cards</span>
                              <span>•</span>
                              <span className="text-emerald-700 font-semibold">
                                {topicItem.masteredCount} mastered
                              </span>
                              {topicItem.dueCount > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-600 font-bold">
                                    {topicItem.dueCount} due
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() =>
                              startSession(
                                `${topicItem.topic} (${topicItem.subject})`,
                                'curriculum',
                                topicItem.subject,
                                topicItem.topic
                              )
                            }
                            className="px-3 py-1.5 rounded-xl bg-[#eff4ff] text-[#0051d5] font-bold text-[12px] hover:bg-[#dbe1ff] transition-colors"
                          >
                            Drill Topic →
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center text-[#75777e] text-[13px]">
                        No topics found for this subject.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: My Study Materials (Uploaded Documents / Kits) */}
        {activeTab === 'materials' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[16px] font-bold text-[#0b1c30]">
                  Synthesized Decks from Your Uploaded Notes
                </h3>
                <p className="text-[12px] text-[#75777e]">
                  Active recall flashcards created from your PDFs, lecture notes, and document intelligence chunks.
                </p>
              </div>

              <button
                onClick={() => onNavigate('study-kits')}
                className="text-[12px] font-bold text-[#0051d5] hover:underline flex items-center gap-1"
              >
                <span>Manage Study Materials</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>

            {dashboard?.studyMaterialDecks && dashboard.studyMaterialDecks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dashboard.studyMaterialDecks.map((deck) => (
                  <div
                    key={deck.materialId}
                    className="p-5 rounded-3xl bg-white border border-[#c5c6ce]/40 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider bg-[#eff4ff] text-[#0051d5] px-2.5 py-0.5 rounded-full">
                          {deck.subject}
                        </span>
                        <span className="text-[11px] text-[#75777e]">
                          {new Date(deck.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <h4 className="text-[16px] font-bold text-[#0b1c30] mt-2 line-clamp-1">
                        {deck.title}
                      </h4>

                      <div className="flex items-center gap-3 mt-2 text-[12px] text-[#75777e]">
                        <span>{deck.totalCards} cards</span>
                        <span>•</span>
                        <span className="text-emerald-700 font-semibold">{deck.masteredCount} mastered</span>
                        {deck.dueCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-amber-600 font-bold">{deck.dueCount} due</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-5 pt-3 border-t border-[#c5c6ce]/20">
                      {deck.totalCards > 0 ? (
                        <button
                          onClick={() =>
                            startSession(
                              deck.title,
                              'material',
                              undefined,
                              undefined,
                              deck.materialId
                            )
                          }
                          className="flex-1 py-2 rounded-xl bg-[#0051d5] text-white font-bold text-[12px] hover:bg-[#316bf3] shadow-xs transition-colors"
                        >
                          Study Deck ({deck.totalCards}) →
                        </button>
                      ) : (
                        <button
                          onClick={() => handleGenerateFromMaterial(deck.materialId, deck.title)}
                          disabled={generatingMaterialId === deck.materialId}
                          className="flex-1 py-2 rounded-xl bg-[#eff4ff] text-[#0051d5] font-bold text-[12px] hover:bg-[#dbe1ff] transition-colors border border-[#dbe1ff] flex items-center justify-center gap-1.5"
                        >
                          {generatingMaterialId === deck.materialId ? (
                            <span>Synthesizing Cards...</span>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                              <span>Generate Flashcards</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center bg-[#f8f9ff] rounded-3xl border border-[#c5c6ce]/30 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white border border-[#c5c6ce]/40 flex items-center justify-center mx-auto text-[#0051d5] shadow-xs">
                  <span className="material-symbols-outlined text-[24px]">note_add</span>
                </div>
                <h4 className="font-bold text-[16px] text-[#0b1c30]">
                  No Study Documents Uploaded Yet
                </h4>
                <p className="text-[13px] text-[#44474d] max-w-md mx-auto">
                  Upload PDF lecture notes or summaries in Study Materials to generate custom active recall flashcards.
                </p>
                <button
                  onClick={() => onNavigate('study-kits')}
                  className="px-4 py-2 rounded-xl bg-[#0051d5] text-white font-bold text-[13px] hover:bg-[#316bf3] transition-colors shadow-xs"
                >
                  Upload Study Notes →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Browse All Cards (Full Search & Filters) */}
        {activeTab === 'library' && (
          <div className="p-6 space-y-4">
            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2 relative">
                <input
                  type="text"
                  placeholder="Search questions, concepts, answers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-[#c5c6ce]/50 text-[13px] text-[#0b1c30] outline-none shadow-xs"
                />
                <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-[18px] text-[#75777e]">
                  search
                </span>
              </div>

              <select
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white border border-[#c5c6ce]/50 text-[13px] font-semibold text-[#0b1c30] outline-none shadow-xs"
              >
                <option value="all">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>

              <select
                value={filterMastery}
                onChange={(e) => setFilterMastery(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white border border-[#c5c6ce]/50 text-[13px] font-semibold text-[#0b1c30] outline-none shadow-xs"
              >
                <option value="all">All Retention States</option>
                <option value="learning">Learning</option>
                <option value="reviewing">Reviewing</option>
                <option value="mastered">Mastered</option>
              </select>
            </div>

            {/* Cards Grid */}
            {libraryLoading ? (
              <div className="py-16 text-center text-[#75777e] text-[13px]">
                Loading flashcard library...
              </div>
            ) : libraryCards.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {libraryCards.map((card) => (
                  <div
                    key={card.id}
                    className="p-5 rounded-3xl bg-white border border-[#c5c6ce]/40 shadow-xs flex flex-col justify-between hover:border-[#0051d5]/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-[#eff4ff] text-[#0051d5] px-2 py-0.5 rounded-full">
                            {card.subject}
                          </span>
                          <span className="text-[10px] font-semibold text-[#75777e]">
                            {card.topic}
                          </span>
                        </div>

                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          card.mastery_state === 'mastered'
                            ? 'bg-emerald-50 text-emerald-700'
                            : card.mastery_state === 'reviewing'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {card.mastery_state}
                        </span>
                      </div>

                      <h4 className="text-[15px] font-bold text-[#0b1c30] mt-3 leading-snug">
                        {card.question}
                      </h4>

                      <p className="text-[13px] text-[#44474d] mt-2 line-clamp-2">
                        {card.answer}
                      </p>

                      {card.formula && (
                        <div className="mt-2 text-[12px] font-mono text-[#0051d5] bg-[#f8f9ff] px-2.5 py-1 rounded-lg inline-block border border-[#c5c6ce]/20">
                          {card.formula}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#c5c6ce]/20 text-[11px] text-[#75777e]">
                      <span>Next review: {new Date(card.next_review_due).toLocaleDateString()}</span>
                      <button
                        onClick={() => {
                          setActiveDeck([card]);
                          setCurrentIndex(0);
                          setIsFlipped(false);
                          setShowHint(false);
                          setDeckCompleted(false);
                          setSessionTitle(`Card: ${card.topic}`);
                          setIsReviewing(true);
                        }}
                        className="text-[#0051d5] font-bold hover:underline"
                      >
                        Drill This Card →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-[#75777e] bg-[#f8f9ff] rounded-3xl">
                No flashcards matched your query.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Custom Flashcard Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-[#0b1c30]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#c5c6ce]/40 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#c5c6ce]/20">
              <h3 className="text-[18px] font-bold text-[#0b1c30]">
                Create Custom Flashcard
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-[#75777e]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomCard} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-bold text-[#44474d] block mb-1">
                    Subject *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Physics"
                    value={createForm.subject}
                    onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#c5c6ce]/60 text-[13px] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-bold text-[#44474d] block mb-1">
                    Topic *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Thermodynamics"
                    value={createForm.topic}
                    onChange={(e) => setCreateForm({ ...createForm, topic: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#c5c6ce]/60 text-[13px] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[12px] font-bold text-[#44474d] block mb-1">
                  Question *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="What is the first law of thermodynamics?"
                  value={createForm.question}
                  onChange={(e) => setCreateForm({ ...createForm, question: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#c5c6ce]/60 text-[13px] outline-none"
                />
              </div>

              <div>
                <label className="text-[12px] font-bold text-[#44474d] block mb-1">
                  Verified Answer *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Energy cannot be created or destroyed, only transformed."
                  value={createForm.answer}
                  onChange={(e) => setCreateForm({ ...createForm, answer: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#c5c6ce]/60 text-[13px] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-bold text-[#44474d] block mb-1">
                    Formula Identity (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="ΔU = Q - W"
                    value={createForm.formula}
                    onChange={(e) => setCreateForm({ ...createForm, formula: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#c5c6ce]/60 text-[13px] outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-[12px] font-bold text-[#44474d] block mb-1">
                    Difficulty
                  </label>
                  <select
                    value={createForm.difficulty}
                    onChange={(e) => setCreateForm({ ...createForm, difficulty: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-[#c5c6ce]/60 text-[13px] outline-none"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#c5c6ce]/20">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold text-[#75777e] hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#0051d5] text-white font-bold text-[13px] hover:bg-[#316bf3] shadow-xs"
                >
                  Save Flashcard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
