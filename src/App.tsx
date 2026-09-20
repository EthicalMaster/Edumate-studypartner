/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ActiveNavTab, StudyKit, Flashcard, QuizQuestion, WeakTopic, NotificationItem } from './types';
import {
  INITIAL_STUDY_KITS,
  INITIAL_FLASHCARDS,
  INITIAL_QUIZ_QUESTIONS,
  INITIAL_WEAK_TOPICS,
  INITIAL_NOTIFICATIONS,
} from './data/initialData';

import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthView } from './components/auth/AuthView';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { UploadModal } from './components/UploadModal';
import { SummaryModal } from './components/SummaryModal';

import { HomeView } from './components/views/HomeView';
import { StudyKitsView } from './components/views/StudyKitsView';
import { FlashcardsView } from './components/views/FlashcardsView';
import { QuizzesView } from './components/views/QuizzesView';
import { ProgressView } from './components/views/ProgressView';
import { WeakTopicsView } from './components/views/WeakTopicsView';
import { PeerComparisonView } from './components/views/PeerComparisonView';
import { SettingsView } from './components/views/SettingsView';

function AuthenticatedApp() {
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // App Data State
  const [studyKits, setStudyKits] = useState<StudyKit[]>(INITIAL_STUDY_KITS);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(INITIAL_FLASHCARDS);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(INITIAL_QUIZ_QUESTIONS);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>(INITIAL_WEAK_TOPICS);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  // Handling new study kit upload
  const handleKitCreated = (newKit: StudyKit) => {
    setStudyKits((prev) => [newKit, ...prev]);
    // Also generate dummy flashcards & questions for this new kit
    const newCard: Flashcard = {
      id: `fc-${Date.now()}`,
      kitId: newKit.id,
      subject: newKit.subject,
      topic: newKit.title,
      question: `What is the core principle governing ${newKit.title}?`,
      answer: `The primary theoretical foundation relies on conservation of flux and differential wave propagation through medium boundaries.`,
      keyConcept: `${newKit.title} Fundamentals`,
      formula: '∇ × E = -∂B/∂t',
      difficulty: 'medium',
      masteryLevel: 'learning',
    };
    setFlashcards((prev) => [newCard, ...prev]);

    // Add notification
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Kit Created: ${newKit.title}`,
      description: `Synthesized ${newKit.flashcardsCount} flashcards and ${newKit.quizzesCount} quiz questions.`,
      timeAgo: 'Just now',
      read: false,
      type: 'achievement',
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  // Generate Remedial Kit
  const handleGenerateRemedialKit = () => {
    const remedialKit: StudyKit = {
      id: `kit-remedial-${Date.now()}`,
      title: 'Remedial Mastery: Magnetism & Matter',
      subject: 'Physics',
      unit: 'Targeted Drill',
      keyConceptsLearned: 3,
      totalKeyConcepts: 12,
      progressPercent: 25,
      lastStudied: 'Just now',
      description: 'AI curated focused remedial kit tackling 4 missed questions in magnetic permeability and Curie-Weiss temperature laws.',
      flashcardsCount: 15,
      quizzesCount: 8,
      audioDurationMin: 7,
      activeModule: 'Curie Law & Susceptibility',
      tags: ['Remediation', 'Error Correction', 'Physics'],
      accuracy: 65,
    };
    setStudyKits((prev) => [remedialKit, ...prev]);
    setActiveTab('study-kits');
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30] font-['Inter'] antialiased">
      {/* Dark persistent Command Rail Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Pane */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Top Header */}
        <Header
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          notifications={notifications}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onOpenUpload={() => setIsUploadOpen(true)}
        />

        {/* Primary Page Viewport */}
        <main className="flex-1 pt-20 px-4 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
          {activeTab === 'home' && (
            <HomeView
              onNavigate={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenUpload={() => setIsUploadOpen(true)}
              onOpenSummary={() => setIsSummaryOpen(true)}
              onStartRemedialKit={handleGenerateRemedialKit}
              onPlayAudioTrack={() => {}}
              studyKits={studyKits}
              weakTopics={weakTopics}
              onSelectWeakTopic={(_topic) => {
                setActiveTab('weak-topics');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {activeTab === 'study-kits' && (
            <StudyKitsView
              studyKits={studyKits}
              onSelectKit={(_kit) => setActiveTab('flashcards')}
              onNavigate={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenUpload={() => setIsUploadOpen(true)}
              onOpenSummary={() => setIsSummaryOpen(true)}
              onPlayAudioTrack={() => {}}
            />
          )}

          {activeTab === 'flashcards' && (
            <FlashcardsView
              flashcards={flashcards}
              studyKits={studyKits}
              onNavigate={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {activeTab === 'quizzes' && (
            <QuizzesView
              quizQuestions={quizQuestions}
              studyKits={studyKits}
              onNavigate={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {activeTab === 'my-progress' && <ProgressView />}

          {activeTab === 'weak-topics' && (
            <WeakTopicsView
              weakTopics={weakTopics}
              onNavigate={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onGenerateRemedialKit={handleGenerateRemedialKit}
            />
          )}

          {activeTab === 'peer-comparison' && (
            <PeerComparisonView
              onNavigate={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Upload Ingestion Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onKitCreated={handleKitCreated}
      />

      {/* AI Summary / Notes Cheat Sheet Modal */}
      <SummaryModal
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        onPracticeFlashcards={() => {
          setActiveTab('flashcards');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onStartQuiz={() => {
          setActiveTab('quizzes');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}

function MainContent() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#091124] text-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-[#0051d5] flex items-center justify-center text-white shadow-lg shadow-blue-500/30 animate-pulse mb-3">
          <span className="material-symbols-outlined text-[28px]">school</span>
        </div>
        <p className="text-[13px] text-[#93a7cf] font-medium animate-pulse">Verifying secure student session...</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <AuthView />;
  }

  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}

