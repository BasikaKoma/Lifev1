import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  getCurrentSession,
  signInWithEmail,
  signUpWithEmail,
  signOut as authSignOut,
  subscribeToAuthChanges,
} from '../lib/auth';

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

    const attachSession = (session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
    };

    getCurrentSession()
      .then((session) => attachSession(session))
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });

    const unsubscribe = subscribeToAuthChanges((_nextUser, event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        setUser(null);
        return;
      }
      if (session?.user) setUser(session.user);
    });

    return () => {
      cancelled = true;
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
