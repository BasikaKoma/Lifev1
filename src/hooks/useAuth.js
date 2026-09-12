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
  getAuthBootstrap,
  hasElectronAuthStore,
  markStaySignedOut,
} from '../lib/electronAuth';

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
      .then(async (session) => {
        if (session?.user) {
          attachSession(session);
          return;
        }
        if (!hasElectronAuthStore()) return;

        const boot = await getAuthBootstrap();
        if (cancelled || boot.staySignedOut || !boot.login) return;

        try {
          const { user: signedIn, session: restored } = await signInWithEmail(
            boot.login.email,
            boot.login.password
          );
          if (cancelled) return;
          attachSession(restored || { user: signedIn });
        } catch {
          /* AuthView prefills the saved credentials. */
        }
      })
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
    await markStaySignedOut();
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
