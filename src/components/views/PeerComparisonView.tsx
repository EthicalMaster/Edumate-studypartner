import React from 'react';

export const PeerComparisonView: React.FC = () => {
  const cohortLeaderboard = [
    { rank: 1, name: 'Aarav Mehta', score: '94%', streak: '24d', badges: 'Mastery Star' },
    { rank: 2, name: 'Elena Rostova', score: '92%', streak: '19d', badges: 'Quick Learner' },
    { rank: 3, name: 'Kaito Tanaka', score: '91%', streak: '15d', badges: 'Quiz Ace' },
    { rank: 4, name: 'Sara Al-Mansoor', score: '88%', streak: '12d', badges: 'Deep Diver' },
    { rank: 5, name: 'Marcus Chen', score: '85%', streak: '9d', badges: 'Consistent' },
    { rank: 6, name: 'Vibhor Sahu (You)', score: '78%', streak: '7d', badges: 'Top 15%', isCurrentUser: true },
    { rank: 7, name: 'Priya Sharma', score: '76%', streak: '5d', badges: 'Active' },
    { rank: 8, name: 'David Kim', score: '74%', streak: '4d', badges: 'Rising' },
  ];

  return (
    <div className="flex flex-col gap-6 pb-28">
      <div>
        <h2 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-['Inter']">
          Cohort Peer Comparison
        </h2>
        <p className="text-[13px] text-[#44474d] mt-0.5">
          Anonymized performance percentiles and benchmark velocity against university engineering cohorts.
        </p>
      </div>

      {/* Hero Percentile Card */}
      <div className="bg-gradient-to-r from-[#0051d5] to-[#316bf3] rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 max-w-lg">
          <span className="text-[11px] font-bold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full">
            Cohort Percentile: 85th Rank
          </span>
          <h3 className="text-[24px] sm:text-[28px] font-bold leading-tight">
            You outperform 82% of university peers in Physics this month
          </h3>
          <p className="text-[14px] text-[#d7e2ff] leading-relaxed">
            Your spaced review consistency and low error rate on Gauss’s Law placed you firmly in the top tier of active students.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20 text-center min-w-[180px]">
          <span className="text-[11px] uppercase font-bold text-[#d7e2ff]">Benchmark Score</span>
          <div className="text-[40px] font-bold text-white mt-1">78%</div>
          <span className="text-[12px] text-emerald-300 font-semibold">+14% vs cohort median (64%)</span>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-white rounded-3xl border border-[#c5c6ce]/30 shadow-xs p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[17px] font-bold text-[#0b1c30]">Engineering Cohort Leaderboard</h3>
          <span className="text-[12px] text-[#75777e]">Updated 20 mins ago</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#c5c6ce]/30 text-[#75777e] text-[11px] uppercase tracking-wider">
                <th className="pb-3 pl-3">Rank</th>
                <th className="pb-3">Student</th>
                <th className="pb-3">Overall Accuracy</th>
                <th className="pb-3">Streak</th>
                <th className="pb-3 pr-3 text-right">Recognition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c5c6ce]/20">
              {cohortLeaderboard.map((row) => (
                <tr
                  key={row.rank}
                  className={`transition-colors ${
                    row.isCurrentUser
                      ? 'bg-[#eff4ff] font-bold text-[#0051d5]'
                      : 'hover:bg-[#f8f9ff] text-[#0b1c30]'
                  }`}
                >
                  <td className="py-3.5 pl-3">
                    <span
                      className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[12px] ${
                        row.rank === 1
                          ? 'bg-amber-100 text-amber-800 font-bold'
                          : row.rank === 2
                          ? 'bg-slate-200 text-slate-800 font-bold'
                          : row.rank === 3
                          ? 'bg-amber-600/20 text-amber-900 font-bold'
                          : 'text-[#75777e]'
                      }`}
                    >
                      {row.rank}
                    </span>
                  </td>
                  <td className="py-3.5 flex items-center gap-2">
                    <span>{row.name}</span>
                    {row.isCurrentUser && (
                      <span className="text-[10px] bg-[#0051d5] text-white px-2 py-0.5 rounded-full">
                        You
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 font-semibold">{row.score}</td>
                  <td className="py-3.5 text-[#44474d]">{row.streak}</td>
                  <td className="py-3.5 pr-3 text-right">
                    <span className="text-[11px] font-semibold bg-[#e5eeff] text-[#0051d5] px-2.5 py-1 rounded-full">
                      {row.badges}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
