import React from 'react';
import { ActiveNavTab } from '../types';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
}) => {
  const { user } = useAuth();
  const studentName = user?.profile?.full_name || 'Student';
  const studentDept = user?.profile?.department || 'Active Student';
  const navItems: Array<{ id: ActiveNavTab; label: string; icon: string; badge?: string }> = [
    { id: 'home', label: 'Home', icon: 'space_dashboard' },
    { id: 'study-kits', label: 'Study Kits', icon: 'folder_special' },
    { id: 'flashcards', label: 'Flashcards', icon: 'style', badge: '86' },
    { id: 'quizzes', label: 'Quizzes', icon: 'quiz' },
    { id: 'my-progress', label: 'My Progress', icon: 'insights' },
    { id: 'adaptive-model', label: 'Adaptive Model', icon: 'psychology' },
    { id: 'weak-topics', label: 'Weak Topics', icon: 'target', badge: '4' },
    { id: 'peer-comparison', label: 'Peer Comparison', icon: 'leaderboard' },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed left-0 top-0 h-full w-64 bg-[#0d1b33] text-white z-50 flex flex-col justify-between p-4 shadow-xl transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col gap-4">
          {/* Brand Logo & Name */}
          <div className="flex items-center justify-between px-2 py-1">
            <div
              className="flex items-center gap-3 cursor-pointer select-none"
              onClick={() => {
                onSelectTab('home');
                onCloseMobile();
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-[#0051d5] flex items-center justify-center text-white shadow-md shadow-blue-900/40">
                <span className="material-symbols-outlined text-[24px]">school</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-[18px] font-bold tracking-tight text-white font-['Inter']">
                    AVEN
                  </span>
                  <span className="material-symbols-outlined text-[#dbe1ff] text-[16px]">
                    auto_awesome
                  </span>
                </div>
                <span className="text-[11px] text-[#7684a1] font-medium tracking-wide">
                  Learn Smarter, Not Harder
                </span>
              </div>
            </div>

            {/* Close button for mobile */}
            <button
              onClick={onCloseMobile}
              className="p-1 rounded-lg text-[#b9c7e6] hover:bg-white/10 lg:hidden"
              aria-label="Close menu"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Nav Items */}
          <nav className="flex flex-col gap-1.5 mt-2" aria-label="Main Navigation">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-${item.id}`}
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile();
                  }}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-150 font-['Inter'] text-[14px] font-semibold text-left ${
                    isActive
                      ? 'bg-[#316bf3] text-white shadow-md shadow-blue-600/30'
                      : 'text-[#b9c7e6] hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                        isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-[#dbe1ff]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="flex flex-col gap-4">
          {/* Daily Focus Card */}
          <div className="rounded-xl bg-[#d3e4fe]/10 p-4 relative overflow-hidden backdrop-blur-sm border border-white/5">
            <div className="flex items-center gap-2 mb-1.5 text-[#dbe1ff]">
              <span className="material-symbols-outlined text-[18px]">verified</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                Daily Focus
              </span>
            </div>
            <p className="text-[12px] text-[#b9c7e6] leading-snug">
              Small steps every day lead to big results.
            </p>
            <div className="mt-3 flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#316bf3]"></div>
              <div className="h-1.5 w-6 rounded-full bg-[#316bf3]"></div>
              <div className="h-1.5 w-3 rounded-full bg-white/20"></div>
            </div>
          </div>

          {/* Settings & Profile */}
          <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
            <button
              id="nav-settings"
              onClick={() => {
                onSelectTab('settings');
                onCloseMobile();
              }}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors font-['Inter'] text-[14px] font-semibold text-left ${
                activeTab === 'settings'
                  ? 'bg-[#316bf3] text-white shadow-sm'
                  : 'text-[#b9c7e6] hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">settings</span>
              <span>Settings</span>
            </button>

            {/* Profile Row */}
            <div
              className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
              onClick={() => onSelectTab('settings')}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-black border border-white/20 flex items-center justify-center text-white shrink-0">
                  <span className="material-symbols-outlined text-[18px]">person</span>
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[13px] font-semibold text-white leading-tight">
                    {studentName}
                  </span>
                  <span className="text-[10px] text-[#b9c7e6] leading-tight">
                    {studentDept}
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-[#b9c7e6] text-[18px]">
                unfold_more
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
