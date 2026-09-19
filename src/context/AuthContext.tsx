/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { StudentUser } from '../types';

export interface RegisterPayload {
  email: string;
  password: string;
  confirm_password: string;
  full_name: string;
  education_level?: string;
  academic_stage?: string;
  institution?: string;
  department?: string;
  current_year?: number;
  student_identifier?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

interface AuthContextType {
  user: StudentUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  error: string | null;
  dbConnected: boolean;
  login: (payload: LoginPayload) => Promise<{ success: boolean; error?: string }>;
  register: (payload: RegisterPayload) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StudentUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [dbConnected, setDbConnected] = useState<boolean>(true);

  const clearError = useCallback(() => setError(null), []);

  // Fetch current user from server-side session
  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Ensures HTTP-only cookie is transmitted
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setStatus('authenticated');
          setDbConnected(true);
          return;
        }
      }

      if (res.status === 503) {
        setDbConnected(false);
      }

      setUser(null);
      setStatus('unauthenticated');
    } catch {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Login handler
  const login = async (payload: LoginPayload): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        const message = data.message || 'Invalid email or password.';
        setError(message);
        if (res.status === 503) setDbConnected(false);
        return { success: false, error: message };
      }

      setUser(data.user);
      setStatus('authenticated');
      setDbConnected(true);
      return { success: true };
    } catch (err: any) {
      const message = 'Network connection error. Please verify the backend service is reachable.';
      setError(message);
      return { success: false, error: message };
    }
  };

  // Registration handler
  const register = async (payload: RegisterPayload): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        let message = data.message || 'Registration failed.';
        if (data.details && Array.isArray(data.details)) {
          message = data.details.map((d: any) => d.message).join(', ');
        }
        setError(message);
        if (res.status === 503) setDbConnected(false);
        return { success: false, error: message };
      }

      setUser(data.user);
      setStatus('authenticated');
      setDbConnected(true);
      return { success: true };
    } catch (err: any) {
      const message = 'Network connection error during registration.';
      setError(message);
      return { success: false, error: message };
    }
  };

  // Logout handler
  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } finally {
      setUser(null);
      setStatus('unauthenticated');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        error,
        dbConnected,
        login,
        register,
        logout,
        refreshUser,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
