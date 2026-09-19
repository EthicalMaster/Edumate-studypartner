import React, { useState } from 'react';
import { WeakTopic, ActiveNavTab } from '../../types';

interface WeakTopicsViewProps {
  weakTopics: WeakTopic[];
  onNavigate: (tab: ActiveNavTab) => void;
  onGenerateRemedialKit: () => void;
}

export const WeakTopicsView: React.FC<WeakTopicsViewProps> = ({
  weakTopics,
  onNavigate,
  onGenerateRemedialKit,
}) => {
  const [selectedTopic, setSelectedTopic] = useState<WeakTopic | null>(null);
  const [drillCompleted, setDrillCompleted] = useState<boolean>(false);

  return (
    <div className="flex flex-col gap-6 pb-28">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-['Inter']">
            Focus Area & Weak Topics Remediation
          </h2>
          <p className="text-[13px] text-[#44474d] mt-0.5">
            AI-prioritized learning gaps based on missed quiz questions and flashcard lapses.
          </p>
        </div>

        <button
          onClick={onGenerateRemedialKit}
          className="inline-flex items-center gap-2 bg-[#0051d5] hover:bg-[#316bf3] text-white px-4 py-2.5 rounded-xl text-[13px] font-bold shadow-sm transition-all cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[18px]">psychology</span>
          <span>Generate Remedial Kit</span>
        </button>
      </div>

      {/* Weak Topics List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {weakTopics.map((wt) => (
          <div
            key={wt.id}
            className="bg-white p-5 rounded-2xl border border-[#c5c6ce]/30 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0051d5]">
                  {wt.subject}
                </span>
                <span
                  className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${
                    wt.priority === 'High Priority'
                      ? 'bg-red-50 text-red-700'
                      : wt.priority === 'Needs Revision'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {wt.priority}
                </span>
              </div>

              <h3 className="text-[17px] font-bold text-[#0b1c30]">{wt.topicName}</h3>
              <p className="text-[12px] text-[#75777e] mt-1">
                {wt.missedQuestionsCount} frequently missed conceptual problems detected.
              </p>

              {/* Progress bar */}
              <div className="mt-3">
                <div className="flex justify-between text-[11px] font-semibold text-[#44474d] mb-1">
                  <span>Current Diagnostic Accuracy</span>
                  <span className="font-bold text-[#0b1c30]">{wt.accuracy}%</span>
                </div>
                <div className="w-full bg-[#eff4ff] h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      wt.accuracy < 50
                        ? 'bg-red-500'
                        : wt.accuracy < 70
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${wt.accuracy}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-3 border-t border-[#c5c6ce]/20 flex items-center justify-between">
              <span className="text-[12px] text-[#75777e]">Target: 80%+</span>
              <button
                onClick={() => setSelectedTopic(wt)}
                className="px-4 py-1.5 rounded-xl bg-[#0051d5] text-white text-[12px] font-bold hover:bg-[#316bf3] shadow-xs cursor-pointer"
              >
                Launch Targeted Drill →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Target Drill Modal */}
      {selectedTopic && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-[#c5c6ce]/50 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#c5c6ce]/30">
              <div>
                <span className="text-[11px] font-bold text-[#0051d5] uppercase">
                  Remediation Drill
                </span>
                <h3 className="text-[18px] font-bold text-[#0b1c30]">
                  {selectedTopic.topicName}
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedTopic(null);
                  setDrillCompleted(false);
                }}
                className="text-[#75777e] hover:text-[#0b1c30] p-1.5 rounded-xl"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {!drillCompleted ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#eff4ff] border border-[#dbe1ff]">
                  <span className="text-[12px] font-bold text-[#0051d5] block mb-1">
                    Key Misconception Identified:
                  </span>
                  <p className="text-[13px] text-[#334155] leading-relaxed">
                    Students frequently confuse magnetic flux density (B) with magnetic intensity (H), where <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-[#0051d5]">B = μ₀(H + M)</code>. Remember that inside diamagnetic materials, magnetization M opposes the external field.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-[#c5c6ce]/40 space-y-2">
                  <span className="text-[13px] font-bold text-[#0b1c30]">
                    Rapid Diagnostic Drill:
                  </span>
                  <p className="text-[13px] text-[#44474d]">
                    What happens to the magnetic susceptibility χ of a paramagnetic substance when its absolute temperature T is doubled?
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <button
                      onClick={() => setDrillCompleted(true)}
                      className="w-full text-left p-2.5 rounded-xl border border-[#c5c6ce]/40 hover:bg-[#eff4ff] text-[13px] font-medium"
                    >
                      A. It doubles (χ ∝ T)
                    </button>
                    <button
                      onClick={() => setDrillCompleted(true)}
                      className="w-full text-left p-2.5 rounded-xl border border-emerald-500 bg-emerald-50 text-[13px] font-bold text-emerald-950"
                    >
                      B. It halves (Curie's Law: χ = C / T)
                    </button>
                    <button
                      onClick={() => setDrillCompleted(true)}
                      className="w-full text-left p-2.5 rounded-xl border border-[#c5c6ce]/40 hover:bg-[#eff4ff] text-[13px] font-medium"
                    >
                      C. It remains constant
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-[28px]">check</span>
                </div>
                <div>
                  <h4 className="text-[17px] font-bold text-[#0b1c30]">Correct Application!</h4>
                  <p className="text-[13px] text-[#44474d] mt-1">
                    Curie’s law holds for paramagnetics: thermal agitation disrupts magnetic dipole alignment inversely with temperature.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedTopic(null);
                    setDrillCompleted(false);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#0051d5] text-white font-bold text-[13px]"
                >
                  Mark Topic Reviewed
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
