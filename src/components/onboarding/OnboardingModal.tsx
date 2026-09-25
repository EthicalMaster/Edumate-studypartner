/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  EDUCATION_LEVELS,
  VALID_STAGES_BY_LEVEL,
} from '../../../server/utils/validation';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

const PROGRAM_PRESETS: Record<string, Array<{ name: string; stream: string }>> = {
  'Undergraduate / College': [
    { name: 'B.Tech / B.E.', stream: 'Computer Science & Engineering' },
    { name: 'B.Tech / B.E.', stream: 'Data Science & AI' },
    { name: 'B.Tech / B.E.', stream: 'Mechanical / Civil / Electrical' },
    { name: 'B.Sc / BCA', stream: 'Computer Applications & IT' },
    { name: 'B.Sc', stream: 'Natural Sciences (Physics / Chemistry / Math)' },
    { name: 'B.Sc / MBBS', stream: 'Biological & Life Sciences' },
    { name: 'B.Com / BBA', stream: 'Commerce & Business Analytics' },
    { name: 'Other Undergraduate', stream: 'General' },
  ],
  'School': [
    { name: 'Middle School', stream: 'Foundation Science & Math' },
    { name: 'Secondary School (Grades 9-10)', stream: 'General Board Curriculum' },
    { name: 'Senior Secondary (Grades 11-12)', stream: 'Science (PCM Track)' },
    { name: 'Senior Secondary (Grades 11-12)', stream: 'Science (PCB Track)' },
    { name: 'Senior Secondary (Grades 11-12)', stream: 'Science (PCMB Track)' },
    { name: 'Senior Secondary (Grades 11-12)', stream: 'Commerce & Humanities' },
  ],
  'Postgraduate': [
    { name: 'M.Tech / M.S.', stream: 'Computer Science & Engineering' },
    { name: 'M.Sc', stream: 'Data Science & Analytics' },
    { name: 'MCA', stream: 'Information Technology' },
    { name: 'MBA', stream: 'Business & Management' },
  ],
  'Diploma / Vocational': [
    { name: 'Diploma in Engineering', stream: 'Computer Engineering' },
    { name: 'Diploma in Engineering', stream: 'Mechanical / Electrical' },
    { name: 'Vocational Training', stream: 'Applied Skills' },
  ],
  'Other': [
    { name: 'Competitive Exam Prep', stream: 'GATE / Technical Placement' },
    { name: 'Self-Paced Learning', stream: 'Software & Data Science' },
    { name: 'Lifelong Learner', stream: 'General Sciences' },
  ],
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose, onComplete }) => {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState<number>(1);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State initialized from user profile
  const [educationLevel, setEducationLevel] = useState<string>(
    user?.profile?.education_level || 'Undergraduate / College'
  );
  const [academicStage, setAcademicStage] = useState<string>(
    user?.profile?.academic_stage || '3rd Year'
  );
  const [program, setProgram] = useState<string>(
    user?.profile?.program || 'B.Tech / B.E.'
  );
  const [stream, setStream] = useState<string>(
    user?.profile?.stream || 'Computer Science & Engineering'
  );
  const [institution, setInstitution] = useState<string>(
    user?.profile?.institution || ''
  );

  if (!isOpen) return null;

  const availableStages = VALID_STAGES_BY_LEVEL[educationLevel] || [
    '1st Year',
    '2nd Year',
    '3rd Year',
    '4th Year',
    'Other',
  ];

  const presetsForLevel = PROGRAM_PRESETS[educationLevel] || PROGRAM_PRESETS['Undergraduate / College'];

  const handleEducationLevelChange = (newLevel: string) => {
    setEducationLevel(newLevel);
    const stages = VALID_STAGES_BY_LEVEL[newLevel] || [];
    if (stages.length > 0) {
      setAcademicStage(stages[0]);
    }
    const presets = PROGRAM_PRESETS[newLevel] || [];
    if (presets.length > 0) {
      setProgram(presets[0].name);
      setStream(presets[0].stream);
    }
  };

  const handleProgramPresetSelect = (pName: string, pStream: string) => {
    setProgram(pName);
    setStream(pStream);
  };

  // Preview estimated subjects
  const getSubjectPreview = () => {
    const text = `${educationLevel} ${academicStage} ${program} ${stream}`.toLowerCase();
    if (text.includes('school') && (text.includes('grade 1') || text.includes('grade 2') || text.includes('grade 3') || text.includes('grade 4') || text.includes('grade 5') || text.includes('grade 6') || text.includes('grade 7') || text.includes('grade 8'))) {
      return ['Mathematics', 'Physics', 'Biology', 'General Aptitude', 'English'];
    }
    if (text.includes('pcb') || (text.includes('life science') || text.includes('medical') || text.includes('mbbs'))) {
      return ['Biology', 'Chemistry', 'Physics', 'General Aptitude', 'English'];
    }
    if (text.includes('commerce')) {
      return ['Mathematics', 'General Aptitude', 'English'];
    }
    if (text.includes('computer') || text.includes('data science') || text.includes('cse') || text.includes('software')) {
      return ['Computer Science', 'Data Science', 'Mathematics', 'General Aptitude', 'English'];
    }
    return ['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'Data Science', 'General Aptitude', 'English'];
  };

  const eligibleSubjectsPreview = getSubjectPreview();

  const handleComplete = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          education_level: educationLevel,
          academic_stage: academicStage,
          program: program.trim(),
          stream: stream.trim(),
          institution: institution.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to complete onboarding');
      }

      await refreshUser();
      if (onComplete) onComplete();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to complete onboarding.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#0f172a] text-white border border-slate-700/80 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Modal Top Bar */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/20">
              <span className="material-symbols-outlined text-[20px]">school</span>
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-slate-100 tracking-tight">
                EDUMATE Academic Onboarding
              </h2>
              <p className="text-[12px] text-slate-400">Step {step} of 6</p>
            </div>
          </div>

          {/* Step Progress Pill */}
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all duration-300 ${
                  s === step
                    ? 'w-6 bg-blue-500'
                    : s < step
                    ? 'w-2 bg-blue-400/60'
                    : 'w-2 bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 flex-1 space-y-6">
          {errorMessage && (
            <div className="p-3.5 bg-red-950/60 border border-red-500/40 rounded-xl text-red-200 text-[13px] flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Welcome */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[12px] font-medium border border-blue-500/20">
                <span className="material-symbols-outlined text-[16px]">verified</span>
                <span>Personalized Learning Environment</span>
              </div>
              <h3 className="text-[22px] font-extrabold text-white tracking-tight">
                Welcome to EDUMATE, {user?.profile?.full_name || 'Learner'}!
              </h3>
              <p className="text-[14px] text-slate-300 leading-relaxed">
                EDUMATE is an intelligent, curriculum-grounded learning companion designed to help you master concepts faster, retain knowledge longer, and perform at your highest potential.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">menu_book</span>
                  </div>
                  <h4 className="text-[14px] font-bold text-slate-200">Curriculum Grounded</h4>
                  <p className="text-[12px] text-slate-400 leading-normal">
                    Strict syllabus isolation ensures you only practice concepts relevant to your course and grade.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">quiz</span>
                  </div>
                  <h4 className="text-[14px] font-bold text-slate-200">Adaptive Paper Builder</h4>
                  <p className="text-[12px] text-slate-400 leading-normal">
                    554+ verified academic questions across 7 formats with negative marking and instant analysis.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">folder_special</span>
                  </div>
                  <h4 className="text-[14px] font-bold text-slate-200">Private Study Vault</h4>
                  <p className="text-[12px] text-slate-400 leading-normal">
                    Upload notes and PDFs into your isolated study vault with BGE embeddings and smart search.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">trending_up</span>
                  </div>
                  <h4 className="text-[14px] font-bold text-slate-200">Spaced Retention Analytics</h4>
                  <p className="text-[12px] text-slate-400 leading-normal">
                    Real-time stability tracking, streak metrics, and automated weak topic remediation.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Academic Profile Setup */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[19px] font-bold text-white tracking-tight">
                  Configure Your Academic Hierarchy
                </h3>
                <p className="text-[13px] text-slate-400 mt-1">
                  EDUMATE configures your available subjects, question bank papers, and AI assistance based on your exact academic program.
                </p>
              </div>

              {/* Education Level & Stage */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[12px] font-bold text-slate-300 block mb-1">
                    Education Level
                  </label>
                  <select
                    value={educationLevel}
                    onChange={(e) => handleEducationLevelChange(e.target.value)}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-[13px] text-slate-100 font-medium focus:outline-none focus:border-blue-500"
                  >
                    {EDUCATION_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[12px] font-bold text-slate-300 block mb-1">
                    Academic Stage / Year
                  </label>
                  <select
                    value={academicStage}
                    onChange={(e) => setAcademicStage(e.target.value)}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-[13px] text-slate-100 font-medium focus:outline-none focus:border-blue-500"
                  >
                    {availableStages.map((stg) => (
                      <option key={stg} value={stg}>
                        {stg}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Program & Stream Presets */}
              <div className="space-y-2">
                <label className="text-[12px] font-bold text-slate-300 block">
                  Quick Select Program & Stream
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                  {presetsForLevel.map((p, idx) => {
                    const isSelected = program === p.name && stream === p.stream;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleProgramPresetSelect(p.name, p.stream)}
                        className={`text-left p-2.5 rounded-xl border text-[12px] transition-all ${
                          isSelected
                            ? 'bg-blue-600/30 border-blue-500 text-white font-semibold'
                            : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-bold text-slate-100">{p.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{p.stream}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Program & Stream Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[12px] font-bold text-slate-300 block mb-1">
                    Course / Degree Program
                  </label>
                  <input
                    type="text"
                    value={program}
                    onChange={(e) => setProgram(e.target.value)}
                    placeholder="e.g. B.Tech / B.E."
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-[13px] text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[12px] font-bold text-slate-300 block mb-1">
                    Branch / Stream / Specialization
                  </label>
                  <input
                    type="text"
                    value={stream}
                    onChange={(e) => setStream(e.target.value)}
                    placeholder="e.g. Computer Science & Engineering"
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-[13px] text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Dynamic Curriculum Preview Banner */}
              <div className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-2xl space-y-1.5">
                <div className="text-[12px] font-bold text-blue-400 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">checklist</span>
                  <span>Active Curriculum Eligibility Preview</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {eligibleSubjectsPreview.map((sub) => (
                    <span
                      key={sub}
                      className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-300 text-[11px] font-semibold border border-blue-500/30"
                    >
                      ✓ {sub}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Subjects outside your configured curriculum (e.g. Biology for Engineering) are restricted by the server to prevent irrelevant study drift.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Private Study Vault */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-[12px] font-medium border border-purple-500/20">
                <span className="material-symbols-outlined text-[16px]">security</span>
                <span>Tenant Isolation & Privacy</span>
              </div>
              <h3 className="text-[19px] font-bold text-white tracking-tight">
                Your Private Document Intelligence Vault
              </h3>
              <p className="text-[13px] text-slate-300 leading-relaxed">
                Upload your course syllabi, lecture slides, professor notes, and reference PDFs. EDUMATE automatically normalizes, hierarchically chunks, and vectorizes them for semantic retrieval.
              </p>

              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-purple-400 text-[24px]">lock</span>
                  <div>
                    <h4 className="text-[14px] font-bold text-slate-200">Strict Student Isolation</h4>
                    <p className="text-[12px] text-slate-400">
                      Your materials and search queries are strictly isolated to your account. No other student can view or search your uploaded documents.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-blue-400 text-[24px]">dataset</span>
                  <div>
                    <h4 className="text-[14px] font-bold text-slate-200">BGE Embeddings & Deterministic Chunking</h4>
                    <p className="text-[12px] text-slate-400">
                      Documents are split into structured semantic passages with token estimations, preserving formulas and section headings.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-emerald-400 text-[24px]">auto_stories</span>
                  <div>
                    <h4 className="text-[14px] font-bold text-slate-200">AI Study Kits & Flashcards</h4>
                    <p className="text-[12px] text-slate-400">
                      Synthesize modular formula sheets, key concepts, trap alerts, and spaced repetition flashcards directly from your notes.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Paper Builder & Quizzes */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[12px] font-medium border border-emerald-500/20">
                <span className="material-symbols-outlined text-[16px]">school</span>
                <span>Rigorous Academic Testing</span>
              </div>
              <h3 className="text-[19px] font-bold text-white tracking-tight">
                Curriculum Question Bank & Paper Builder
              </h3>
              <p className="text-[13px] text-slate-300 leading-relaxed">
                Practice against 554+ verified academic problems crafted across 8 subjects and multiple topics with full explanations and formula hints.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                {[
                  { label: 'MCQ', desc: 'Single Choice' },
                  { label: 'MULTIPLE_SELECT', desc: 'Multiple Choice' },
                  { label: 'TRUE_FALSE', desc: 'Binary Logic' },
                  { label: 'FILL_BLANK', desc: 'Exact Text' },
                  { label: 'VERY_SHORT', desc: '1-2 Sentences' },
                  { label: 'SHORT', desc: '3-4 Sentences' },
                  { label: 'LONG', desc: 'Detailed Proofs' },
                  { label: 'EXAM MODE', desc: 'Strict Timing' },
                ].map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 text-center">
                    <div className="text-[12px] font-extrabold text-blue-400">{item.label}</div>
                    <div className="text-[10px] text-slate-400">{item.desc}</div>
                  </div>
                ))}
              </div>

              <div className="p-3.5 bg-slate-800/40 border border-slate-700/50 rounded-2xl flex items-center gap-3">
                <span className="material-symbols-outlined text-amber-400 text-[26px]">gavel</span>
                <p className="text-[12px] text-slate-300">
                  <strong className="text-white">Authoritative Scoring:</strong> Server calculates negative marks, per-section breakdowns, and submission timestamps authoritatively to guarantee exam integrity.
                </p>
              </div>
            </div>
          )}

          {/* STEP 5: Real-Time Analytics & Retention */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[12px] font-medium border border-amber-500/20">
                <span className="material-symbols-outlined text-[16px]">insights</span>
                <span>Continuous Mastery</span>
              </div>
              <h3 className="text-[19px] font-bold text-white tracking-tight">
                Retention Stability & Targeted Remediation
              </h3>
              <p className="text-[13px] text-slate-300 leading-relaxed">
                EDUMATE automatically diagnoses weak topics from quiz performance and recommends high-impact review drills before you forget.
              </p>

              <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-amber-400">local_fire_department</span>
                    <div>
                      <div className="text-[13px] font-bold text-slate-200">Study Streak Governance</div>
                      <div className="text-[11px] text-slate-400">Maintained through consecutive active study days</div>
                    </div>
                  </div>
                  <span className="text-[12px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                    Active
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-rose-400">warning</span>
                    <div>
                      <div className="text-[13px] font-bold text-slate-200">Automatic Weak Topic Alert</div>
                      <div className="text-[11px] text-slate-400">Topics with &lt;70% accuracy flagged for remedial focus</div>
                    </div>
                  </div>
                  <span className="text-[12px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                    Automated
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-blue-400">timer</span>
                    <div>
                      <div className="text-[13px] font-bold text-slate-200">Time-Clamped Study Sessions</div>
                      <div className="text-[11px] text-slate-400">Accurate study hour logging with active duration protection</div>
                    </div>
                  </div>
                  <span className="text-[12px] font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                    4h Max
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Ready to Excel */}
          {step === 6 && (
            <div className="space-y-5 text-center py-2">
              <div className="w-16 h-16 rounded-3xl bg-blue-600/20 border border-blue-500/40 text-blue-400 mx-auto flex items-center justify-center">
                <span className="material-symbols-outlined text-[36px]">rocket_launch</span>
              </div>

              <div>
                <h3 className="text-[22px] font-extrabold text-white tracking-tight">
                  You are all set, {user?.profile?.full_name || 'Scholar'}!
                </h3>
                <p className="text-[13px] text-slate-300 max-w-md mx-auto mt-1 leading-relaxed">
                  Your academic curriculum has been personalized for <strong>{program} ({stream})</strong>. You can adjust your profile at any time in Settings.
                </p>
              </div>

              {/* Summary of Configuration */}
              <div className="p-4 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-left space-y-2 max-w-md mx-auto">
                <div className="flex justify-between text-[12px]">
                  <span className="text-slate-400">Learner ID:</span>
                  <span className="text-blue-400 font-mono font-bold">
                    {user?.profile?.student_identifier || 'EDU-ASSIGNED'}
                  </span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-slate-400">Education Level:</span>
                  <span className="text-slate-200 font-semibold">{educationLevel}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-slate-400">Academic Stage:</span>
                  <span className="text-slate-200 font-semibold">{academicStage}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-slate-400">Eligible Subjects:</span>
                  <span className="text-emerald-400 font-semibold">{eligibleSubjectsPreview.length} Subjects Active</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/60 rounded-b-3xl">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((prev) => prev - 1)}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2.5">
            {step < 6 ? (
              <button
                type="button"
                onClick={() => setStep((prev) => prev + 1)}
                className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/30 transition flex items-center gap-1.5"
              >
                <span>Continue</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleComplete}
                className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/30 transition flex items-center gap-2 disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving Profile...</span>
                  </>
                ) : (
                  <>
                    <span>Complete Onboarding & Start Learning</span>
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
