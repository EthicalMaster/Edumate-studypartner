import React, { useState } from 'react';

export const SettingsView: React.FC = () => {
  const [dailyGoalTopics, setDailyGoalTopics] = useState(2);
  const [dailyGoalQuizzes, setDailyGoalQuizzes] = useState(1);
  const [algorithm, setAlgorithm] = useState('FSRS-4');
  const [voiceModel, setVoiceModel] = useState('Neural Duo (Alex & Sam)');
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6 pb-28 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-['Inter']">
            Settings & Preferences
          </h2>
          <p className="text-[13px] text-[#44474d] mt-0.5">
            Personalize your AI study assistant, spaced repetition rhythm, and audio synthesis.
          </p>
        </div>

        {savedNotice && (
          <span className="text-[12px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full animate-in fade-in">
            ✓ Preferences saved!
          </span>
        )}
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-3xl p-6 border border-[#c5c6ce]/30 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-black flex items-center justify-center text-white text-[24px]">
            <span className="material-symbols-outlined text-[32px]">person</span>
          </div>
          <div>
            <h3 className="text-[17px] font-bold text-[#0b1c30]">Vibhor Sahu</h3>
            <p className="text-[13px] text-[#44474d]">Computer Science & Engineering • Year 3</p>
            <p className="text-[11px] text-[#75777e] mt-0.5">Student ID: CS-2024-884 • vibhor.sahu@university.edu</p>
          </div>
        </div>
        <span className="text-[11px] font-bold bg-[#eff4ff] text-[#0051d5] px-3 py-1 rounded-full">
          Active Pro Tier
        </span>
      </div>

      {/* Study Rhythm */}
      <div className="bg-white rounded-3xl p-6 border border-[#c5c6ce]/30 shadow-xs space-y-4">
        <h3 className="text-[16px] font-bold text-[#0b1c30] border-b border-[#c5c6ce]/20 pb-3">
          Daily Study Target
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-bold text-[#44474d] block mb-1">
              Target Topics / Day
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={dailyGoalTopics}
              onChange={(e) => setDailyGoalTopics(Number(e.target.value))}
              className="w-full bg-[#eff4ff] border border-[#c5c6ce]/40 rounded-xl px-3.5 py-2 text-[14px] text-[#0b1c30] font-semibold outline-none focus:ring-2 focus:ring-[#0051d5]"
            />
          </div>
          <div>
            <label className="text-[12px] font-bold text-[#44474d] block mb-1">
              Target Quizzes / Day
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={dailyGoalQuizzes}
              onChange={(e) => setDailyGoalQuizzes(Number(e.target.value))}
              className="w-full bg-[#eff4ff] border border-[#c5c6ce]/40 rounded-xl px-3.5 py-2 text-[14px] text-[#0b1c30] font-semibold outline-none focus:ring-2 focus:ring-[#0051d5]"
            />
          </div>
        </div>
      </div>

      {/* AI Synthesis & Voice Settings */}
      <div className="bg-white rounded-3xl p-6 border border-[#c5c6ce]/30 shadow-xs space-y-4">
        <h3 className="text-[16px] font-bold text-[#0b1c30] border-b border-[#c5c6ce]/20 pb-3">
          AI Model & Synthesis Engines
        </h3>

        <div className="space-y-3 text-[13px]">
          <div>
            <label className="text-[12px] font-bold text-[#44474d] block mb-1">
              Spaced Repetition Algorithm
            </label>
            <select
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value)}
              className="w-full bg-[#eff4ff] border border-[#c5c6ce]/40 rounded-xl px-3.5 py-2.5 font-semibold text-[#0b1c30] outline-none"
            >
              <option value="FSRS-4">FSRS-4 (Free Spaced Repetition Scheduler - Machine Learning)</option>
              <option value="SM-2">SM-2 (SuperMemo Classic Interval)</option>
              <option value="Leitner">Leitner 5-Box System</option>
            </select>
          </div>

          <div>
            <label className="text-[12px] font-bold text-[#44474d] block mb-1">
              Audio Podcast Voice Persona
            </label>
            <select
              value={voiceModel}
              onChange={(e) => setVoiceModel(e.target.value)}
              className="w-full bg-[#eff4ff] border border-[#c5c6ce]/40 rounded-xl px-3.5 py-2.5 font-semibold text-[#0b1c30] outline-none"
            >
              <option value="Neural Duo (Alex & Sam)">Two-Host Conversational AI (Alex & Sam)</option>
              <option value="Professor AI (Formal)">Solo Academic Lecturer (Deep Clarity)</option>
              <option value="Fast Review (Breezy)">High-Yield Speed Reviewer (1.5x Pace)</option>
            </select>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-[#0051d5] text-white font-bold text-[13px] hover:bg-[#316bf3] shadow-sm transition-all cursor-pointer"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
