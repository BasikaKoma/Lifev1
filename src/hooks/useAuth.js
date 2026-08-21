import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  getCurrentSession,
  signInWithEmail,
  signUpWithEmail,
  signOut as authSignOut,
  subscribeToAuthChanges,
} from '../lib/auth';
import {
  claimExclusiveSession,
  isExclusiveSessionActive,
  signOutLocallyTaken,
  watchExclusiveSession,
} from '../lib/singleSession';

export function useAuth() {
  const isConfigured = isSupabaseConfigured();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(isConfigured);

  useEffect(() => {
    if (!isConfigured) {
      setAuthLoading(false);
      return undefined;
    }

    let cancelled = false;
    let stopWatch = () => {};

    const attachSession = async (session, { claim = false } = {}) => {
      if (cancelled) return;
      stopWatch();
      stopWatch = () => {};

      if (!session?.user) {
        setUser(null);
        return;
      }

      if (claim) {
        await claimExclusiveSession(session);
      } else {
        const stillActive = await isExclusiveSessionActive(session);
        if (!stillActive) {
          await signOutLocallyTaken();
          if (!cancelled) setUser(null);
          return;
        }
      }

      if (cancelled) return;
      setUser(session.user);
      stopWatch = watchExclusiveSession(session, async () => {
        await signOutLocallyTaken();
        if (!cancelled) setUser(null);
      });
    };

    getCurrentSession()
      .then((session) => attachSession(session, { claim: true }))
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });

    const unsubscribe = subscribeToAuthChanges(async (_nextUser, event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_IN') {
        await attachSession(session, { claim: true });
        return;
      }
      if (event === 'SIGNED_OUT') {
        stopWatch();
        stopWatch = () => {};
        setUser(null);
        return;
      }
      if (event === 'TOKEN_REFRESHED' && session) {
        const stillActive = await isExclusiveSessionActive(session);
        if (!stillActive) {
          await signOutLocallyTaken();
          if (!cancelled) setUser(null);
        }
      }
    });

    return () => {
      cancelled = true;
      stopWatch();
      unsubscribe();
    };
  }, [isConfigured]);

  const signIn = useCallback(async (email, password) => {
    const { user: signedIn } = await signInWithEmail(email, password);
    setUser(signedIn ?? null);
    return signedIn;
  }, []);

  const signUp = useCallback(async (email, password, displayName) => {
    const { user: created, session } = await signUpWithEmail(email, password, displayName);
    if (session?.user) {
      setUser(session.user);
      return session.user;
    }
    setUser(created ?? null);
    return created;
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    setUser(null);
  }, []);

  return {
    user,
    authLoading,
    isConfigured,
    signIn,
    signUp,
    signOut,
  };
}
