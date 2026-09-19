import React, { useState } from 'react';

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  onStartQuiz?: () => void;
  onPracticeFlashcards?: () => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({
  isOpen,
  onClose,
  title = 'Electrostatics • Comprehensive AI Summary',
  onStartQuiz,
  onPracticeFlashcards,
}) => {
  const [activeTab, setActiveTab] = useState<'core' | 'formulas' | 'traps'>('core');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard?.writeText(
      `Gauss's Law Summary: Φ = ∮ E · dA = Q_enclosed / ε₀. Inside a conductor, E = 0. Electric potential V = kQ/r.`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-[#c5c6ce]/50 max-h-[88vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#c5c6ce]/30">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0051d5] text-[11px] font-bold mb-1.5">
              <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
              <span>AI Synthesized Cheat Sheet • Physics Unit 1</span>
            </div>
            <h3 className="text-[20px] font-bold text-[#0b1c30]">{title}</h3>
            <p className="text-[13px] text-[#44474d] mt-0.5">
              Distilled from lecture recordings & textbook chapters into bulletproof exam takeaways.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#75777e] hover:text-[#0b1c30] p-1.5 rounded-xl hover:bg-[#eff4ff]"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mt-4 border-b border-[#c5c6ce]/30 pb-2">
          <button
            onClick={() => setActiveTab('core')}
            className={`px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
              activeTab === 'core'
                ? 'bg-[#0051d5] text-white shadow-xs'
                : 'text-[#44474d] hover:bg-[#eff4ff]'
            }`}
          >
            Core Concepts
          </button>
          <button
            onClick={() => setActiveTab('formulas')}
            className={`px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
              activeTab === 'formulas'
                ? 'bg-[#0051d5] text-white shadow-xs'
                : 'text-[#44474d] hover:bg-[#eff4ff]'
            }`}
          >
            Formulas & Identities
          </button>
          <button
            onClick={() => setActiveTab('traps')}
            className={`px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
              activeTab === 'traps'
                ? 'bg-[#0051d5] text-white shadow-xs'
                : 'text-[#44474d] hover:bg-[#eff4ff]'
            }`}
          >
            Common Exam Traps ⚠️
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 text-[13px] text-[#334155] leading-relaxed pr-2">
          {activeTab === 'core' && (
            <>
              <div className="bg-[#eff4ff] p-4 rounded-2xl border border-[#dbe1ff]">
                <h4 className="font-bold text-[#0051d5] text-[14px] mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                  1. Fundamental Electrostatic Postulates
                </h4>
                <p>
                  Coulomb’s law dictates pairwise central forces: <code className="bg-white px-1.5 py-0.5 rounded font-mono text-[#0051d5]">F = (1 / 4πε₀) · (q₁q₂ / r²) r̂</code>. The principle of superposition allows the net field from discrete or continuous charge distributions to be found via vector addition or surface integrals.
                </p>
              </div>

              <div className="bg-[#eff4ff] p-4 rounded-2xl border border-[#dbe1ff]">
                <h4 className="font-bold text-[#0051d5] text-[14px] mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">conversion_path</span>
                  2. Gauss’s Flux Law & Symmetry Types
                </h4>
                <p>
                  Gauss’s Law equates surface flux to enclosed charge: <code className="bg-white px-1.5 py-0.5 rounded font-mono text-[#0051d5]">∮ E · dA = Q_enclosed / ε₀</code>.
                  It provides closed-form analytical solutions only under 3 standard symmetries:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-[#44474d]">
                  <li><strong>Spherical Symmetry:</strong> Point charges, hollow concentric shells, uniform solid spheres.</li>
                  <li><strong>Cylindrical Symmetry:</strong> Infinite line charge of density λ (<code className="font-mono">E = λ / (2πε₀r)</code>).</li>
                  <li><strong>Planar Symmetry:</strong> Infinite conducting or non-conducting sheets of density σ (<code className="font-mono">E = σ / (2ε₀)</code>).</li>
                </ul>
              </div>

              <div className="bg-[#eff4ff] p-4 rounded-2xl border border-[#dbe1ff]">
                <h4 className="font-bold text-[#0051d5] text-[14px] mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">bolt</span>
                  3. Conducting Media & Boundary Conditions
                </h4>
                <p>
                  Under static equilibrium, mobile electrons rearrange until <code className="bg-white px-1.5 py-0.5 rounded font-mono text-[#0051d5]">E_internal = 0</code>. The tangential component of the electric field is continuous across boundaries (<code className="font-mono">E_t1 = E_t2</code>), while the normal component discontinues by <code className="font-mono">σ / ε₀</code>.
                </p>
              </div>
            </>
          )}

          {activeTab === 'formulas' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { title: 'Coulomb Force', formula: 'F = (1 / 4πε₀) · (q₁q₂ / r²)', note: 'Follows inverse square law' },
                { title: "Gauss's Law", formula: '∮ E · dA = Q_in / ε₀', note: 'Independent of shell radius' },
                { title: 'Field from Line Charge', formula: 'E = λ / (2πε₀r)', note: 'Radial outward for λ > 0' },
                { title: 'Capacitance with Dielectric', formula: 'C = κ · (ε₀ A / d)', note: 'Increases by dielectric factor κ' },
                { title: 'Electrostatic Energy Density', formula: 'u = ½ ε₀ E²', note: 'Stored within electric field space' },
                { title: 'Electric Potential from Field', formula: 'V = - ∫ E · dr', note: 'Conservative path integral' }
              ].map((f, i) => (
                <div key={i} className="p-3.5 rounded-xl border border-[#c5c6ce]/50 bg-[#eff4ff]/30">
                  <span className="text-[11px] font-bold text-[#0051d5] uppercase">{f.title}</span>
                  <div className="font-mono font-bold text-[14px] text-[#0b1c30] mt-1 bg-white p-2 rounded-lg border border-[#c5c6ce]/30">
                    {f.formula}
                  </div>
                  <span className="text-[11px] text-[#75777e] mt-1 block">{f.note}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'traps' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                <span className="font-bold text-amber-800 text-[13px] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">warning</span>
                  Trap 1: Confusing E-field with Potential inside a hollow sphere
                </span>
                <p className="text-amber-900 mt-1">
                  Inside a hollow charged sphere, <code className="font-bold">E = 0</code>, but <code className="font-bold">V ≠ 0</code>! The potential is constant throughout the interior and equal to its value on the surface: <code className="font-mono">V = kQ / R</code>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                <span className="font-bold text-amber-800 text-[13px] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">warning</span>
                  Trap 2: Disconnected Battery vs Connected Battery with Dielectric
                </span>
                <p className="text-amber-900 mt-1">
                  If the battery is disconnected before inserting a dielectric, <strong>charge Q is conserved</strong> (voltage drops). If the battery stays connected, <strong>voltage V is conserved</strong> (charge drawn from battery increases).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-4 border-t border-[#c5c6ce]/30 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#44474d] hover:text-[#0b1c30] px-3 py-2 rounded-xl hover:bg-[#eff4ff] border border-[#c5c6ce]/40"
          >
            <span className="material-symbols-outlined text-[16px]">
              {copied ? 'check' : 'content_copy'}
            </span>
            <span>{copied ? 'Copied to Clipboard!' : 'Copy Key Cheat Sheet'}</span>
          </button>

          <div className="flex items-center gap-2">
            {onPracticeFlashcards && (
              <button
                onClick={() => {
                  onClose();
                  onPracticeFlashcards();
                }}
                className="px-3.5 py-2 rounded-xl text-[13px] font-semibold text-[#0051d5] bg-[#eff4ff] hover:bg-[#dbe1ff] transition-colors"
              >
                Practice Flashcards →
              </button>
            )}
            {onStartQuiz && (
              <button
                onClick={() => {
                  onClose();
                  onStartQuiz();
                }}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-[#0051d5] hover:bg-[#316bf3] shadow-sm transition-colors"
              >
                Take Diagnostic Quiz →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
