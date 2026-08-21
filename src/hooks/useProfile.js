import { useCallback, useEffect, useState } from 'react';
import { fetchProfile, updateDisplayName } from '../lib/profile';

export function useProfile({ enabled = true, user } = {}) {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(Boolean(enabled && user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled || !user) {
      setDisplayName('');
      setLoading(false);
      return null;
    }

    setError(null);
    try {
      const profile = await fetchProfile();
      const name = profile?.displayName ?? user.user_metadata?.display_name ?? '';
      setDisplayName(name);
      return profile;
    } catch (err) {
      setError(err.message || 'Failed to load profile');
      setDisplayName(user.user_metadata?.display_name ?? '');
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveDisplayName = useCallback(async (name) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await updateDisplayName(name);
      setDisplayName(saved);
      return saved;
    } catch (err) {
      setError(err.message || 'Failed to save name');
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    displayName,
    setDisplayName,
    saveDisplayName,
    loading,
    saving,
    error,
    refresh,
  };
}
