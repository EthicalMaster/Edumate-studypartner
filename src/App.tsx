/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ActiveNavTab, StudyMaterial, NotificationItem } from './types';
import { notificationApi } from './services/notificationApi';
import { analyticsApi } from './services/analyticsApi';

import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthView } from './components/auth/AuthView';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { UploadModal } from './components/UploadModal';
import { SummaryModal } from './components/SummaryModal';
import { OnboardingModal } from './components/onboarding/OnboardingModal';

import { HomeView } from './components/views/HomeView';
import { StudyKitsView } from './components/views/StudyKitsView';
import { FlashcardsView } from './components/views/FlashcardsView';
import { QuizzesView } from './components/views/QuizzesView';
import { ProgressView } from './components/views/ProgressView';
import { AdaptiveModelView } from './components/views/AdaptiveModelView';
import { WeakTopicsView } from './components/views/WeakTopicsView';
import { PeerComparisonView } from './components/views/PeerComparisonView';
import { SettingsView } from './components/views/SettingsView';

function AuthenticatedApp() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Authoritative Dashboard & Metric Counts
  const [flashcardsCount, setFlashcardsCount] = useState<number>(0);
  const [weakTopicsCount, setWeakTopicsCount] = useState<number>(0);

  // Authoritative PostgreSQL Notification State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [materialsRefreshTrigger, setMaterialsRefreshTrigger] = useState(0);

  // Synchronize authenticated metrics & notifications from database
  const refreshAuthoritativeData = useCallback(async () => {
    try {
      const [dashRes, notifsRes] = await Promise.all([
        analyticsApi.getDashboard().catch(() => null),
        notificationApi.getNotifications().catch(() => null),
      ]);

      if (dashRes) {
        setFlashcardsCount(dashRes.flashcardsCount ?? 0);
        setWeakTopicsCount(dashRes.weakTopics ? dashRes.weakTopics.length : 0);
      }

      if (notifsRes) {
        setNotifications(notifsRes.notifications || []);
      }
    } catch (err) {
      console.warn('[App] Real-data synchronization warning:', err);
    }
  }, []);

  useEffect(() => {
    refreshAuthoritativeData();
  }, [refreshAuthoritativeData]);

  // Prompt onboarding if student hasn't completed it yet
  useEffect(() => {
    if (user && user.profile && user.profile.has_completed_onboarding === false) {
      setIsOnboardingOpen(true);
    }
  }, [user]);

  // Handling new study material upload
  const handleMaterialUploaded = (_mat: StudyMaterial) => {
    setMaterialsRefreshTrigger((prev) => prev + 1);
    refreshAuthoritativeData();
  };

  // Handling quiz completion
  const handleQuizCompleted = () => {
    refreshAuthoritativeData();
  };

  // Mark all notifications read
  const handleMarkAllNotificationsRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, isRead: true })));
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  // Mark single notification read
  const handleMarkOneNotificationRead = async (id: string) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, isRead: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
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
        flashcardsCount={flashcardsCount}
        weakTopicsCount={weakTopicsCount}
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
          onMarkOneNotificationRead={handleMarkOneNotificationRead}
          onOpenUpload={() => setIsUploadOpen(true)}
          onOpenOnboarding={() => setIsOnboardingOpen(true)}
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
            />
          )}

          {activeTab === 'study-kits' && (
            <StudyKitsView
              onNavigate={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenUpload={() => setIsUploadOpen(true)}
              onOpenSummary={() => setIsSummaryOpen(true)}
              materialsRefreshTrigger={materialsRefreshTrigger}
            />
          )}

          {activeTab === 'flashcards' && (
            <FlashcardsView
              onNavigate={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {activeTab === 'quizzes' && (
            <QuizzesView
              onNavigate={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onRecordQuizCompletion={handleQuizCompleted}
            />
          )}

          {activeTab === 'my-progress' && (
            <ProgressView
              onNavigate={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {activeTab === 'adaptive-model' && (
            <AdaptiveModelView
              onNavigate={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {activeTab === 'weak-topics' && (
            <WeakTopicsView
              onNavigate={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onGenerateRemedialKit={() => {}}
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

          {activeTab === 'settings' && (
            <SettingsView onOpenOnboarding={() => setIsOnboardingOpen(true)} />
          )}
        </main>
      </div>

      {/* First-Time Academic Onboarding & Guide Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={() => setIsOnboardingOpen(false)}
      />

      {/* Upload Study Material Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onMaterialUploaded={handleMaterialUploaded}
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
