import React from 'react';
import { SUBJECT_MASTERY_STATS } from '../../data/initialData';

export const ProgressView: React.FC = () => {
  const weeklyStudyData = [
    { day: 'Mon', hours: 1.2, active: true },
    { day: 'Tue', hours: 1.8, active: true },
    { day: 'Wed', hours: 2.1, active: true },
    { day: 'Thu', hours: 1.4, active: true },
    { day: 'Fri', hours: 0.9, active: true },
    { day: 'Sat', hours: 2.4, active: true },
    { day: 'Sun', hours: 1.6, active: true },
  ];

  const maxHours = Math.max(...weeklyStudyData.map((d) => d.hours));

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h2 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-['Inter']">
          My Progress & Mastery Analytics
        </h2>
        <p className="text-[13px] text-[#44474d] mt-0.5">
          Real-time tracking of retention stability, study volume, and conceptual coverage.
        </p>
      </div>

      {/* Top 3 Diagnostic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between">
          <span className="text-[13px] text-[#44474d] font-semibold">Cognitive Retention Rate</span>
          <div className="flex items-baseline gap-2 my-2">
            <span className="text-[32px] font-bold text-[#0b1c30]">89.2%</span>
            <span className="text-[12px] text-emerald-600 font-bold">+5.4% vs baseline</span>
          </div>
          <p className="text-[12px] text-[#75777e]">
            Calculated across 86 active spaced-repetition cards over 30 days.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between">
          <span className="text-[13px] text-[#44474d] font-semibold">Total Time Invested</span>
          <div className="flex items-baseline gap-2 my-2">
            <span className="text-[32px] font-bold text-[#0051d5]">11.4 hrs</span>
            <span className="text-[12px] text-[#44474d] font-medium">this week</span>
          </div>
          <div className="flex items-center gap-1 text-[12px] text-emerald-600 font-bold">
            <span className="material-symbols-outlined text-[16px]">trending_up</span>
            <span>Ahead of 10h weekly goal</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between">
          <span className="text-[13px] text-[#44474d] font-semibold">Current Study Streak</span>
          <div className="flex items-baseline gap-2 my-2">
            <span className="text-[32px] font-bold text-amber-600">7 Days</span>
            <span className="text-[12px] text-amber-700 font-bold">🔥 Top 15%</span>
          </div>
          <p className="text-[12px] text-[#75777e]">
            Daily consistency is proven to double long-term concept recall.
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Weekly Study Time Bar Chart */}
        <div className="lg:col-span-7 bg-white p-5 lg:p-6 rounded-2xl border border-[#c5c6ce]/30 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[16px] font-bold text-[#0b1c30]">Weekly Study Distribution</h3>
              <span className="text-[12px] text-[#75777e]">Hours spent per day</span>
            </div>
            <span className="text-[12px] font-bold text-[#0051d5] bg-[#eff4ff] px-2.5 py-1 rounded-full">
              Avg 1.6h / day
            </span>
          </div>

          {/* Bar Visualization */}
          <div className="h-44 flex items-end justify-between gap-3 pt-4 px-2">
            {weeklyStudyData.map((d, i) => {
              const heightPercent = (d.hours / maxHours) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                  <span className="text-[11px] font-semibold text-[#75777e] group-hover:text-[#0051d5]">
                    {d.hours}h
                  </span>
                  <div className="w-full max-w-[36px] bg-[#eff4ff] h-32 rounded-xl flex items-end p-1">
                    <div
                      className="w-full bg-[#0051d5] rounded-lg transition-all group-hover:bg-[#316bf3]"
                      style={{ height: `${heightPercent}%` }}
                    ></div>
                  </div>
                  <span className="text-[12px] font-bold text-[#44474d]">{d.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ebbinghaus Forgetting Curve Simulation */}
        <div className="lg:col-span-5 bg-white p-5 lg:p-6 rounded-2xl border border-[#c5c6ce]/30 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[16px] font-bold text-[#0b1c30]">Retention Stability</h3>
              <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                Optimized
              </span>
            </div>
            <p className="text-[12px] text-[#44474d] leading-relaxed">
              Your review cadence successfully interrupts memory decay, keeping concept retention above 85% instead of falling to 20%.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#eff4ff] space-y-2 mt-4">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[#44474d]">Initial Learning:</span>
              <span className="font-bold text-[#0b1c30]">100% Retained</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[#44474d]">After 24 Hours (Review 1):</span>
              <span className="font-bold text-[#0051d5]">92% Retained</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[#44474d]">After 7 Days (Review 2):</span>
              <span className="font-bold text-[#0051d5]">89% Retained</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[#44474d]">Targeted Exam Horizon:</span>
              <span className="font-bold text-emerald-600">86% Long-Term Recall</span>
            </div>
          </div>
        </div>
      </div>

      {/* Subject Detailed Breakdown */}
      <div className="bg-white p-5 lg:p-6 rounded-2xl border border-[#c5c6ce]/30 shadow-xs">
        <h3 className="text-[17px] font-bold text-[#0b1c30] mb-4">Subject Deep Dive</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SUBJECT_MASTERY_STATS.map((s, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-[#eff4ff] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[14px] text-[#0b1c30]">{s.subject}</span>
                  <span className="font-bold text-[14px] text-[#0051d5]">{s.percentage}%</span>
                </div>
                <span className="text-[11px] text-[#75777e]">{s.detail}</span>
              </div>
              <div className="w-full bg-[#d3e4fe] h-2 rounded-full overflow-hidden mt-3">
                <div
                  className={`${s.barClass} h-full rounded-full`}
                  style={{ width: `${s.percentage}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
