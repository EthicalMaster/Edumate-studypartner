import React, { useEffect, useState } from 'react';
import { analyticsApi } from '../services/analyticsApi';
import { NotificationItem } from '../types';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  notifications: NotificationItem[];
  onMarkAllNotificationsRead: () => void;
  onOpenUpload: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenMobileMenu,
  searchQuery,
  onSearchChange,
  notifications,
  onMarkAllNotificationsRead,
  onOpenUpload,
}) => {
  const { user, logout } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [currentStreak, setCurrentStreak] = useState(0);

  useEffect(() => {
    let cancelled = false;

    analyticsApi.getDashboard()
      .then((dashboard) => {
        if (!cancelled) {
          setCurrentStreak(dashboard.studyStreak.currentStreak);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentStreak(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const studentName = user?.profile?.full_name || 'Student';
  const studentDept = user?.profile?.department || 'Undergraduate';
  const studentId = user?.profile?.student_identifier || 'STUDENT';

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-[#f8f9ff]/90 backdrop-blur-xl border-b border-[#c5c6ce]/30 z-40 flex items-center justify-between px-4 lg:px-8">
      {/* Left side: Hamburger (mobile) + Brand or Search bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          aria-label="Open sidebar menu"
          className="p-1.5 rounded-lg text-[#44474d] hover:bg-[#e5eeff] hover:text-[#0b1c30] lg:hidden"
          type="button"
        >
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </button>

        <div className="lg:hidden flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0051d5] flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-[18px]">school</span>
          </div>
          <span className="font-bold text-[18px] text-[#0b1c30] tracking-tight">EDUMATE</span>
        </div>

        {/* Desktop Search Bar */}
        <div className="hidden md:flex items-center gap-2 bg-[#eff4ff] border border-[#c5c6ce]/40 px-3.5 py-1.5 rounded-xl w-80 lg:w-96 transition-all focus-within:ring-2 focus-within:ring-[#0051d5]/40 focus-within:bg-white">
          <span className="material-symbols-outlined text-[#75777e] text-[20px]">search</span>
          <input
            id="global-search-input"
            className="bg-transparent border-none outline-none text-[14px] text-[#0b1c30] placeholder:text-[#75777e] w-full"
            placeholder="Search topics, notes, flashcards..."
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="text-[#75777e] hover:text-[#0b1c30] text-[12px] p-0.5"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Right side: Actions */}
      <div className="flex items-center gap-2 lg:gap-4">
        {/* Quick Upload CTA for quick access */}
        <button
          id="header-quick-upload-btn"
          onClick={onOpenUpload}
          className="hidden sm:inline-flex items-center gap-1.5 bg-[#eff4ff] hover:bg-[#dbe1ff] text-[#0051d5] text-[13px] font-semibold px-3 py-1.5 rounded-xl transition-all border border-[#0051d5]/20"
        >
          <span className="material-symbols-outlined text-[18px]">upload_file</span>
          <span>Upload</span>
        </button>

        {/* 7 Day Streak Pill */}
        <div className="flex items-center gap-1.5 bg-[#e5eeff] px-3 py-1.5 rounded-full text-[#0051d5] text-[12px] font-semibold border border-[#0051d5]/15 shadow-xs">
          <span className="material-symbols-outlined text-[18px] text-amber-500">local_fire_department</span>
          <span>{currentStreak > 0 ? currentStreak + " Day Streak" : "Start Streak"}</span>
        </div>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            id="notifications-toggle-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Notifications"
            className="relative p-2 rounded-xl text-[#44474d] hover:bg-[#e5eeff] hover:text-[#0b1c30] transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#316bf3] ring-2 ring-white"></span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-[#c5c6ce]/50 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-[#c5c6ce]/30">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[15px] text-[#0b1c30]">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="bg-[#eff4ff] text-[#0051d5] text-[11px] font-bold px-2 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllNotificationsRead}
                    className="text-[12px] text-[#0051d5] hover:underline font-semibold"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2.5 mt-3 max-h-72 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-2.5 rounded-xl transition-colors ${
                      n.read ? 'bg-transparent text-[#75777e]' : 'bg-[#eff4ff] text-[#0b1c30]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[13px]">{n.title}</span>
                      <span className="text-[11px] text-[#75777e]">{n.timeAgo}</span>
                    </div>
                    <p className="text-[12px] text-[#44474d] mt-1 leading-snug">{n.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User profile dropdown trigger */}
        <div className="relative flex items-center gap-1.5 pl-1">
          <div
            className="relative cursor-pointer"
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white text-[13px] font-bold ring-2 ring-white shadow-sm">
              <span className="material-symbols-outlined text-white text-[18px]">person</span>
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#316bf3] ring-2 ring-[#f8f9ff]"></span>
          </div>

          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            aria-label="User menu"
            className="hidden sm:flex text-[#44474d] hover:text-[#0b1c30]"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">keyboard_arrow_down</span>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-11 w-64 bg-white rounded-2xl shadow-xl border border-[#c5c6ce]/50 p-3 z-50">
              <div className="px-2 py-1.5 border-b border-[#c5c6ce]/30">
                <p className="text-[13px] font-bold text-[#0b1c30]">{studentName}</p>
                <p className="text-[11px] text-[#75777e]">{user?.email}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                    {user?.role || 'STUDENT'}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-medium">Active Session</span>
                </div>
              </div>
              <div className="mt-2 flex flex-col gap-1 text-[13px] text-[#44474d]">
                {user?.profile?.academic_stage && (
                  <div className="px-2 py-1 rounded-lg bg-[#eff4ff]/60 text-[11px] text-[#0b1c30]">
                    Stage: <span className="font-semibold">{user.profile.academic_stage}</span>
                  </div>
                )}
                {studentDept && (
                  <div className="px-2 py-1 rounded-lg bg-[#eff4ff]/60 text-[11px] text-[#0b1c30]">
                    Dept / Stream: <span className="font-semibold">{studentDept}</span>
                  </div>
                )}
                {studentId && (
                  <div className="px-2 py-1 rounded-lg bg-[#eff4ff]/60 text-[11px] text-[#0b1c30]">
                    Learner ID: <span className="font-mono font-semibold text-[#0051d5]">{studentId}</span>
                  </div>
                )}
                {user?.profile?.institution && (
                  <div className="px-2 py-1 rounded-lg bg-[#eff4ff]/60 text-[11px] text-[#0b1c30]">
                    Univ: <span className="font-semibold">{user.profile.institution}</span>
                  </div>
                )}

                <div className="border-t border-[#c5c6ce]/30 my-1"></div>

                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-red-600 hover:bg-red-50 text-[13px] font-semibold transition-colors cursor-pointer text-left"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};


