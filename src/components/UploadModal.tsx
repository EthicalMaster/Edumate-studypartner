import React, { useState } from 'react';
import { StudyKit } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKitCreated: (newKit: StudyKit) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onKitCreated,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState(0);

  if (!isOpen) return null;

  const presets = [
    {
      title: 'Electromagnetic Waves & Optics',
      subject: 'Physics',
      filename: 'Physics_Optics_Lecture7.pdf',
      size: '14.2 MB',
      concepts: 22,
    },
    {
      title: 'Distributed Systems & Raft Consensus',
      subject: 'Computer Science',
      filename: 'CS451_Consensus_Protocols.pdf',
      size: '8.7 MB',
      concepts: 20,
    },
    {
      title: "Green's Theorem & Surface Integrals",
      subject: 'Mathematics',
      filename: 'Math_Vector_Calculus_Unit3.pdf',
      size: '11.5 MB',
      concepts: 18,
    },
  ];

  const handleStartIngestion = (file: { name: string; size: string; title?: string; subject?: string }) => {
    setSelectedFile(file);
    setIsProcessing(true);
    setProcessingStage(1);

    // Simulated multi-stage ingestion
    setTimeout(() => setProcessingStage(2), 700);
    setTimeout(() => setProcessingStage(3), 1500);
    setTimeout(() => setProcessingStage(4), 2200);
    setTimeout(() => {
      setProcessingStage(5);
      setTimeout(() => {
        const newKit: StudyKit = {
          id: `kit-${Date.now()}`,
          title: file.title || file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
          subject: file.subject || 'Physics',
          unit: 'Unit 2',
          keyConceptsLearned: 4,
          totalKeyConcepts: 20,
          progressPercent: 20,
          lastStudied: 'Just now',
          description: 'AI synthesized study kit with high-yield concepts, flashcards, adaptive quiz questions, and dual-host audio companion.',
          flashcardsCount: 24,
          quizzesCount: 10,
          audioDurationMin: 11,
          activeModule: 'Core Principles & Wavefronts',
          tags: ['AI Generated', 'Exam Prep', 'New Upload'],
          fileSource: file.name,
          accuracy: 75,
        };
        onKitCreated(newKit);
        setIsProcessing(false);
        onClose();
      }, 1000);
    }, 2900);
  };

  const handleNativeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      handleStartIngestion({
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-[#c5c6ce]/50 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#c5c6ce]/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0051d5] flex items-center justify-center text-white shadow-sm">
              <span className="material-symbols-outlined text-[22px]">cloud_upload</span>
            </div>
            <div>
              <h3 className="text-[18px] font-bold text-[#0b1c30]">Ingest Study Material</h3>
              <p className="text-[12px] text-[#44474d]">
                Neural Engine 3.2 • Automatic Flashcards, Quizzes & Audio Pods
              </p>
            </div>
          </div>
          {!isProcessing && (
            <button
              onClick={onClose}
              className="text-[#75777e] hover:text-[#0b1c30] p-1.5 rounded-xl hover:bg-[#eff4ff]"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          )}
        </div>

        {/* Content Body */}
        {isProcessing ? (
          <div className="py-8 flex flex-col items-center text-center space-y-6">
            <div className="relative w-20 h-20">
              <div className="w-20 h-20 rounded-full border-4 border-[#dbe1ff] border-t-[#0051d5] animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-[#0051d5]">
                <span className="material-symbols-outlined text-[28px]">auto_awesome</span>
              </div>
            </div>

            <div className="space-y-1">
              <h4 className="text-[16px] font-bold text-[#0b1c30]">
                Processing & Synthesizing Content...
              </h4>
              <p className="text-[13px] text-[#44474d]">
                Extracting knowledge tokens from <strong className="text-[#0051d5]">{selectedFile?.name}</strong>
              </p>
            </div>

            {/* Stage Checklist */}
            <div className="w-full max-w-md bg-[#eff4ff] rounded-2xl p-4 space-y-3 text-left">
              {[
                { stage: 1, label: 'Extracting text & LaTeX mathematical formulas (99.4% Acc)' },
                { stage: 2, label: 'Semantic concept graph & chunk clustering' },
                { stage: 3, label: 'Generating 24 spaced-repetition flashcards' },
                { stage: 4, label: 'Synthesizing 10 adaptive exam-grade quiz problems' },
                { stage: 5, label: 'Scripting two-host conversational audio podcast' },
              ].map((s) => (
                <div key={s.stage} className="flex items-center gap-2.5 text-[12px]">
                  {processingStage > s.stage ? (
                    <span className="material-symbols-outlined text-[18px] text-emerald-600">
                      check_circle
                    </span>
                  ) : processingStage === s.stage ? (
                    <span className="w-4 h-4 rounded-full border-2 border-[#0051d5] border-t-transparent animate-spin"></span>
                  ) : (
                    <span className="w-4 h-4 rounded-full border border-[#c5c6ce] inline-block"></span>
                  )}
                  <span
                    className={
                      processingStage >= s.stage
                        ? 'text-[#0b1c30] font-semibold'
                        : 'text-[#75777e]'
                    }
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 pt-5">
            {/* Drag & Drop Area */}
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const f = e.dataTransfer.files[0];
                  handleStartIngestion({
                    name: f.name,
                    size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
                  });
                }
              }}
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-[#0051d5] bg-[#eff4ff]'
                  : 'border-[#c5c6ce] hover:border-[#0051d5] hover:bg-[#eff4ff]/40'
              }`}
            >
              <input
                type="file"
                className="hidden"
                accept=".pdf,.txt,.docx"
                onChange={handleNativeFileUpload}
              />
              <div className="w-14 h-14 rounded-full bg-[#eff4ff] text-[#0051d5] flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[28px]">cloud_upload</span>
              </div>
              <p className="text-[15px] font-bold text-[#0b1c30]">
                Click to browse or drag & drop files
              </p>
              <p className="text-[12px] text-[#75777e] mt-1">
                Supported formats: PDF, DOCX, TXT • Up to 50 MB
              </p>
              <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Instant Neural Parsing Active
              </div>
            </label>

            {/* Fast Presets */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[12px] font-bold text-[#44474d] uppercase tracking-wider">
                  Quick Load Demo Course Material
                </span>
                <span className="text-[11px] text-[#75777e]">Ready for instant test</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {presets.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      handleStartIngestion({
                        name: p.filename,
                        size: p.size,
                        title: p.title,
                        subject: p.subject,
                      })
                    }
                    className="p-3 rounded-xl border border-[#c5c6ce]/50 hover:border-[#0051d5] bg-[#eff4ff]/30 hover:bg-[#eff4ff] text-left transition-all group"
                  >
                    <div className="flex items-center justify-between text-[11px] text-[#0051d5] font-bold mb-1">
                      <span>{p.subject}</span>
                      <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">
                        arrow_forward
                      </span>
                    </div>
                    <p className="font-semibold text-[13px] text-[#0b1c30] line-clamp-2">
                      {p.title}
                    </p>
                    <p className="text-[11px] text-[#75777e] mt-1">
                      {p.size} • {p.concepts} Key Concepts
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
