/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { analyticsApi, type StudySession } from '../services/analyticsApi';

export function useStudySession(subject?: string, topic?: string) {
  const sessionRef = useRef<StudySession | null>(null);
  const heartbeatIntervalRef = useRef<any>(null);

  useEffect(() => {
    let isCancelled = false;

    async function initSession() {
      try {
        const { session } = await analyticsApi.startStudySession(subject, topic);
        if (isCancelled) {
          // Immediately complete if component already unmounted
          analyticsApi.completeStudySession(session.id).catch(() => {});
          return;
        }
        sessionRef.current = session;

        // Periodic heartbeat every 60 seconds
        heartbeatIntervalRef.current = setInterval(async () => {
          if (sessionRef.current?.id) {
            try {
              await analyticsApi.heartbeatStudySession(sessionRef.current.id);
            } catch (hbErr) {
              console.warn('[useStudySession] Heartbeat failed:', hbErr);
            }
          }
        }, 60000);
      } catch (err) {
        console.warn('[useStudySession] Could not start study session:', err);
      }
    }

    initSession();

    // Browser unload safety net
    const handleBeforeUnload = () => {
      if (sessionRef.current?.id) {
        // Use sendBeacon or standard fetch
        navigator.sendBeacon?.(`/api/analytics/study-sessions/${sessionRef.current.id}/complete`);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isCancelled = true;
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);

      if (sessionRef.current?.id) {
        analyticsApi.completeStudySession(sessionRef.current.id).catch(() => {});
        sessionRef.current = null;
      }
    };
  }, [subject, topic]);
}
