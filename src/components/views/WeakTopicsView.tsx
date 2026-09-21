/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ActiveNavTab } from '../../types';
import { analyticsApi, type WeakTopicData } from '../../services/analyticsApi';
import { quizApi } from '../../services/quizApi';
import { useStudySession } from '../../hooks/useStudySession';

interface WeakTopicsViewProps {
  onNavigate: (tab: ActiveNavTab) => void;
  onGenerateRemedialKit: () => void;
  weakTopics?: any[];
}

export const WeakTopicsView: React.FC<WeakTopicsViewProps> = ({
  onNavigate,
  onGenerateRemedialKit,
}) => {
  useStudySession();

  const [weakTopics, setWeakTopics] = useState<WeakTopicData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Targeted Drill launch state
  const [launchingTopicId, setLaunchingTopicId] = useState<string | null>(null);
  const [drillErrorModal, setDrillErrorModal] = useState<{ topic: string; message: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadWeakTopics() {
      try {
        setLoading(true);
        const res = await analyticsApi.getWeakTopics();
        if (isMounted) {
          setWeakTopics(res.weakTopics || []);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load weak topics.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadWeakTopics();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLaunchTargetedDrill = async (wt: WeakTopicData) => {
    try {
      setLaunchingTopicId(wt.id);
      await quizApi.createQuiz({
        title: `Targeted Drill: ${wt.topic}`,
        description: `Focused practice drill to master ${wt.topic} (${wt.subject}).`,
        mode: 'PRACTICE',
        source: 'topic',
        subject: wt.subject,
        topic: wt.topic,
        question_count: 5,
        time_limit_minutes: 10,
        difficulty: 'medium',
        negative_marking: false,
        negative_mark_value: 0,
        randomization: true,
      });

      // Successfully created targeted drill quiz, route to Quizzes tab
      onNavigate('quizzes');
    } catch (err: any) {
      console.warn('[WeakTopicsView] Targeted drill launch warning:', err);
      setDrillErrorModal({
        topic: wt.topic,
        message:
          'No questions currently available for this topic in the question bank. Upload relevant study materials to generate practice questions.',
      });
    } finally {
      setLaunchingTopicId(null);
    }
  };

  const primarySubject = weakTopics.length > 0 ? weakTopics[0].subject : null;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-['Inter']">
            Focus Area & Weak Topics Remediation
          </h2>
          <p className="text-[13px] text-[#44474d] mt-0.5">
            Empirical learning gaps based on missed quiz questions (accuracy &lt; 70% with minimum 3 attempts).
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

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[13px]">
          {error}
        </div>
      )}

      {/* Summary Header Banner if weak topics exist */}
      {weakTopics.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">warning</span>
            </div>
            <div>
              <span className="text-[14px] font-bold text-[#0b1c30]">
                {weakTopics.length} Priority Topic{weakTopics.length === 1 ? '' : 's'} Identified
              </span>
              <p className="text-[12px] text-[#44474d]">
                Primary focus needed in <strong className="font-bold text-amber-900">{primarySubject}</strong>. Target drills will calibrate to these gaps.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Weak Topics List or Empty State */}
      {loading ? (
        <div className="py-16 text-center text-[14px] text-[#75777e]">
          Evaluating database quiz history for weak topics...
        </div>
      ) : weakTopics.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {weakTopics.map((wt) => {
            const priorityBadge =
              wt.priority === 'HIGH'
                ? { label: 'High Priority', bg: 'bg-red-50 text-red-700 border-red-200' }
                : wt.priority === 'MEDIUM'
                ? { label: 'Needs Revision', bg: 'bg-amber-50 text-amber-700 border-amber-200' }
                : { label: 'Review', bg: 'bg-blue-50 text-blue-700 border-blue-200' };

            const trendBadge =
              wt.trend === 'improving'
                ? { label: 'Improving ↑', color: 'text-emerald-700 bg-emerald-50' }
                : wt.trend === 'declining'
                ? { label: 'Declining ↓', color: 'text-red-700 bg-red-50' }
                : wt.trend === 'steady'
                ? { label: 'Steady →', color: 'text-slate-700 bg-slate-100' }
                : { label: 'Baseline', color: 'text-slate-500 bg-slate-50' };

            return (
              <div
                key={wt.id}
                className="bg-white p-5 rounded-2xl border border-[#c5c6ce]/30 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0051d5]">
                      {wt.subject}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${trendBadge.color}`}>
                        {trendBadge.label}
                      </span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${priorityBadge.bg}`}>
                        {priorityBadge.label}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-[17px] font-bold text-[#0b1c30]">{wt.topic}</h3>
                  <p className="text-[12px] text-[#75777e] mt-1">
                    {wt.incorrect} missed problem{wt.incorrect === 1 ? '' : 's'} across {wt.attempts} attempt{wt.attempts === 1 ? '' : 's'}.
                  </p>

                  {/* Diagnostic Accuracy Bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] font-semibold text-[#44474d] mb-1">
                      <span>Diagnostic Accuracy</span>
                      <span className="font-bold text-[#0b1c30]">{wt.accuracy}%</span>
                    </div>
                    <div className="w-full bg-[#eff4ff] h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          wt.accuracy < 50
                            ? 'bg-red-500'
                            : wt.accuracy < 60
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.max(5, wt.accuracy)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-3 border-t border-[#c5c6ce]/20 flex items-center justify-between">
                  <span className="text-[12px] text-[#75777e]">Target: 70%+</span>
                  <button
                    disabled={launchingTopicId === wt.id}
                    onClick={() => handleLaunchTargetedDrill(wt)}
                    className="px-4 py-1.5 rounded-xl bg-[#0051d5] text-white text-[12px] font-bold hover:bg-[#316bf3] shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {launchingTopicId === wt.id ? 'Starting Drill...' : 'Launch Targeted Drill →'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Clean Empty State when student has no weak topics */
        <div className="bg-white p-10 rounded-2xl border border-[#c5c6ce]/30 shadow-xs text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[32px]">verified</span>
          </div>
          <h3 className="text-[18px] font-bold text-[#0b1c30]">No Critical Weak Topics Detected</h3>
          <p className="text-[13px] text-[#44474d] mt-1.5 max-w-md">
            Great job! You do not currently have any topics with accuracy below 70% (minimum 3 attempts). Keep practicing to maintain your mastery.
          </p>
          <button
            onClick={() => onNavigate('quizzes')}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0051d5] text-white font-bold text-[13px] hover:bg-[#316bf3] transition-all shadow-xs cursor-pointer"
          >
            <span>Take Practice Quiz →</span>
          </button>
        </div>
      )}

      {/* Target Drill Notification Modal when questions are unavailable */}
      {drillErrorModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-[#c5c6ce]/50 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#c5c6ce]/30">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600 text-[22px]">info</span>
                <h3 className="text-[17px] font-bold text-[#0b1c30]">
                  {drillErrorModal.topic}
                </h3>
              </div>
              <button
                onClick={() => setDrillErrorModal(null)}
                className="text-[#75777e] hover:text-[#0b1c30] p-1.5 rounded-xl cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="text-[13px] text-[#44474d] leading-relaxed">
              {drillErrorModal.message}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDrillErrorModal(null)}
                className="px-4 py-2 rounded-xl bg-[#eff4ff] text-[#0b1c30] font-semibold text-[13px] hover:bg-[#dbe1ff] cursor-pointer"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setDrillErrorModal(null);
                  onNavigate('study-kits');
                }}
                className="px-4 py-2 rounded-xl bg-[#0051d5] text-white font-bold text-[13px] hover:bg-[#316bf3] cursor-pointer"
              >
                Upload Material
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
