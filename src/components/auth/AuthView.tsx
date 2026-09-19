/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const PRACTICAL_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

function validateClientEmail(emailStr: string): boolean {
  const trimmed = emailStr.trim();
  if (trimmed.length === 0 || trimmed.length > 255) return false;
  const atCount = (trimmed.match(/@/g) || []).length;
  if (atCount !== 1) return false;
  if (trimmed.startsWith('@') || trimmed.endsWith('@')) return false;
  return PRACTICAL_EMAIL_REGEX.test(trimmed);
}

export const AuthView: React.FC = () => {
  const { login, register, error, clearError, dbConnected } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [institution, setInstitution] = useState('');
  const [department, setDepartment] = useState('');
  const [currentYear, setCurrentYear] = useState<number>(1);
  const [studentIdentifier, setStudentIdentifier] = useState('');
  const [localValidationErr, setLocalValidationErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalValidationErr(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (mode === 'login') {
      if (!normalizedEmail || !password) {
        setLocalValidationErr('Please enter both your email and password.');
        return;
      }
      if (!validateClientEmail(normalizedEmail)) {
        setLocalValidationErr('Please enter a valid email address (e.g. student@university.edu).');
        return;
      }
      setSubmitting(true);
      await login({ email: normalizedEmail, password });
      setSubmitting(false);
    } else {
      if (!fullName.trim()) {
        setLocalValidationErr('Full name is required.');
        return;
      }
      if (!normalizedEmail) {
        setLocalValidationErr('Email address is required.');
        return;
      }
      if (!validateClientEmail(normalizedEmail)) {
        setLocalValidationErr('Please provide a valid practical email address (e.g. student@university.edu).');
        return;
      }
      if (password.length < 8) {
        setLocalValidationErr('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalValidationErr('Passwords do not match.');
        return;
      }

      setSubmitting(true);
      await register({
        full_name: fullName.trim(),
        email: normalizedEmail,
        password,
        confirm_password: confirmPassword,
        institution: institution.trim() || undefined,
        department: department.trim() || undefined,
        current_year: currentYear || undefined,
        student_identifier: studentIdentifier.trim() || undefined,
      });
      setSubmitting(false);
    }
  };

  const displayError = localValidationErr || error;

  return (
    <div className="min-h-screen bg-[#091124] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-[#0a1429] to-[#060b18] text-white flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-['Inter'] antialiased">
      {/* Subtle ambient decorative backdrop glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Main Auth Container */}
      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0051d5] shadow-lg shadow-blue-600/30 text-white mb-3">
            <span className="material-symbols-outlined text-[32px]">school</span>
          </div>
          <h1 className="text-[26px] font-bold tracking-tight text-white font-['Inter']">EDUMATE</h1>
          <p className="text-[13px] text-[#93a7cf] mt-1">AI-Powered Study & Mastery Platform</p>
        </div>

        {/* Auth Card */}
        <div className="bg-[#0f1b36]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/40">
          {/* Mode Switcher Tabs */}
          <div className="flex bg-[#091124] p-1 rounded-xl border border-white/5 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                clearError();
                setLocalValidationErr(null);
              }}
              className={`flex-1 py-2 text-[13px] font-semibold rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-[#0051d5] text-white shadow-md'
                  : 'text-[#8fa3ca] hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                clearError();
                setLocalValidationErr(null);
              }}
              className={`flex-1 py-2 text-[13px] font-semibold rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-[#0051d5] text-white shadow-md'
                  : 'text-[#8fa3ca] hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Database Notice (if PostgreSQL is offline in cloud preview) */}
          {!dbConnected && (
            <div className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[12px] flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[18px] text-amber-400 shrink-0 mt-0.5">
                dns
              </span>
              <div>
                <p className="font-semibold">Local PostgreSQL Mode</p>
                <p className="text-[#d8b87d] text-[11px] mt-0.5 leading-relaxed">
                  PostgreSQL database is running on your local machine. Set <code className="bg-black/30 px-1 py-0.5 rounded text-amber-200">DATABASE_URL</code> to authenticate with local DB, or run <code className="bg-black/30 px-1 py-0.5 rounded text-amber-200">npm run test:auth</code>.
                </p>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {displayError && (
            <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-[12px] flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[18px] text-red-400 shrink-0 mt-0.5">
                error
              </span>
              <p className="leading-snug">{displayError}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-[12px] font-medium text-[#93a7cf] mb-1.5">
                  Full Name <span className="text-blue-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Chen"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[#091124] border border-white/10 rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder:text-[#55698b] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-[12px] font-medium text-[#93a7cf] mb-1.5">
                Email Address <span className="text-blue-400">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="student@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#091124] border border-white/10 rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder:text-[#55698b] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#93a7cf] mb-1.5">
                Password <span className="text-blue-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#091124] border border-white/10 rounded-xl px-3.5 py-2.5 pr-10 text-[14px] text-white placeholder:text-[#55698b] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-[#55698b] hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-[12px] font-medium text-[#93a7cf] mb-1.5">
                    Confirm Password <span className="text-blue-400">*</span>
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-[#091124] border border-white/10 rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder:text-[#55698b] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[12px] font-medium text-[#93a7cf] mb-1.5">
                      Institution (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Stanford"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      className="w-full bg-[#091124] border border-white/10 rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-[#55698b] focus:outline-none focus:border-blue-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-[#93a7cf] mb-1.5">
                      Department (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Computer Science"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full bg-[#091124] border border-white/10 rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-[#55698b] focus:outline-none focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#93a7cf] mb-1.5">
                      Academic Year
                    </label>
                    <select
                      value={currentYear}
                      onChange={(e) => setCurrentYear(Number(e.target.value))}
                      className="w-full bg-[#091124] border border-white/10 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-blue-500 transition-all"
                    >
                      <option value={1}>1st Year (Freshman)</option>
                      <option value={2}>2nd Year (Sophomore)</option>
                      <option value={3}>3rd Year (Junior)</option>
                      <option value={4}>4th Year (Senior)</option>
                      <option value={5}>5th Year (Graduate)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-[#93a7cf] mb-1.5">
                      Student ID (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CS-2024-884"
                      value={studentIdentifier}
                      onChange={(e) => setStudentIdentifier(e.target.value)}
                      className="w-full bg-[#091124] border border-white/10 rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-[#55698b] focus:outline-none focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 bg-[#0051d5] hover:bg-[#0043b3] disabled:opacity-50 text-white text-[14px] font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>{mode === 'login' ? 'Authenticating...' : 'Registering Account...'}</span>
                </>
              ) : (
                <span>{mode === 'login' ? 'Sign In' : 'Create Student Account'}</span>
              )}
            </button>
          </form>

          {/* Security details footnote */}
          <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-center gap-2 text-[11px] text-[#6d82a8]">
            <span className="material-symbols-outlined text-[14px] text-emerald-400">lock</span>
            <span>Argon2id Hash • Secure Server-Side Sessions</span>
          </div>
        </div>
      </div>
    </div>
  );
};
