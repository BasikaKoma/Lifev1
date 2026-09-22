import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  computeItemProgress,
  createBrandItem,
  handleFromName,
  isExcludedProject,
  itemsByStage,
  normalizeBrandItem,
  normalizeSignalBrief,
  nowIso,
  platformLabel,
} from '../lib/brand/schema';
import { loadBrandBundle, saveBrandBundle } from '../lib/brand/store';
import {
  buildBrandBalance,
  buildWeeklyDirection,
  detectBrandSignals,
  weekStats,
} from '../lib/brand/signals';
import {
  harvestNarrativeMemory,
  attachThreadToFragment,
  isNarrativeThreadId,
  threadTitle,
} from '../lib/brand/threads';
import {
  askBrandBrain,
  developBrandSignal,
  generateDraftFromExperience,
  generateVariations,
  generateWeeklyBrief,
} from '../lib/brand/generate';

export function usePersonalBrand({
  displayName = '',
  lifelineDays = {},
  selfHubDays = {},
  projectActivity = [],
  projectList = [],
} = {}) {
  const [bundle, setBundle] = useState(() => null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const saveTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadBrandBundle()
      .then((next) => {
        if (cancelled) return;
        const handle = next.handle || next.dna.handle || handleFromName(displayName);
        setBundle({
          ...next,
          handle,
          dna: { ...next.dna, handle },
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Δεν φόρτωσε το Personal Brand.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // displayName is only a fallback handle seed on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((next) => {
    setBundle(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      saveBrandBundle(next)
        .catch((err) => setError(err.message || 'Δεν αποθηκεύτηκε.'))
        .finally(() => setSaving(false));
    }, 400);
  }, []);

  const updateBundle = useCallback((patch) => {
    setBundle((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch, updatedAt: nowIso() };
      persist(next);
      return next;
    });
  }, [persist]);

  const items = useMemo(
    () => (bundle?.items || []).map((item) => (item.threadId ? item : attachThreadToFragment(item))),
    [bundle?.items],
  );
  const dna = useMemo(() => {
    const base = bundle?.dna || {};
    if (base.projects?.length || !(projectList || []).length) return base;
    return {
      ...base,
      projects: (projectList || [])
        .filter((project) => !project.isLifeline && !isExcludedProject(project.title))
        .slice(0, 8)
        .map((project) => ({ id: project.id, title: project.title, phase: '' })),
    };
  }, [bundle?.dna, projectList]);
  const handle = bundle?.handle || dna.handle || handleFromName(displayName);

  const signals = useMemo(
    () => detectBrandSignals({
      lifelineDays,
      selfHubDays,
      projectActivity,
      items,
      dismissedSignalIds: bundle?.dismissedSignalIds || [],
    }).map((signal) => {
      const assigned = bundle?.signalBriefs?.[signal.id]?.threadId;
      if (!assigned) return signal;
      return { ...signal, threadId: assigned, threadTitle: threadTitle(assigned) };
    }),
    [lifelineDays, selfHubDays, projectActivity, items, bundle?.dismissedSignalIds, bundle?.signalBriefs],
  );

  const pipeline = useMemo(() => itemsByStage(items), [items]);
  const balance = useMemo(() => buildBrandBalance(items), [items]);
  const stats = useMemo(() => weekStats(items), [items]);
  const weekly = useMemo(() => buildWeeklyDirection(signals, items), [signals, items]);
  const threads = useMemo(
    () => harvestNarrativeMemory({
      storedThreads: bundle?.threads,
      items,
      signals,
      lifelineDays,
      selfHubDays,
    }),
    [bundle?.threads, items, signals, lifelineDays, selfHubDays],
  );

  const threadSignature = useMemo(
    () => JSON.stringify((threads || []).map((thread) => [thread.id, (thread.beats || []).map((beat) => beat.id)])),
    [threads],
  );

  useEffect(() => {
    if (!bundle) return;
    const prev = JSON.stringify((bundle.threads || []).map((thread) => [thread.id, (thread.beats || []).map((beat) => beat.id)]));
    if (prev === threadSignature) return;
    persist({ ...bundle, threads, updatedAt: nowIso() });
  }, [bundle, persist, threadSignature, threads]);

  const activeDraft = useMemo(() => {
    if (!bundle) return null;
    if (bundle.activeItemId) {
      const found = items.find((item) => item.id === bundle.activeItemId);
      if (found && found.stage !== 'published') return found;
    }
    return items.find((item) => item.stage === 'drafting')
      || items.find((item) => item.stage === 'ready')
      || items.find((item) => item.stage === 'selected')
      || null;
  }, [bundle, items]);

  const upsertItem = useCallback((item) => {
    setBundle((prev) => {
      if (!prev) return prev;
      const normalized = normalizeBrandItem({ ...item, updatedAt: nowIso(), progress: computeItemProgress(item) });
      const exists = prev.items.some((row) => row.id === normalized.id);
      const nextItems = exists
        ? prev.items.map((row) => (row.id === normalized.id ? normalized : row))
        : [normalized, ...prev.items];
      const next = { ...prev, items: nextItems, updatedAt: nowIso() };
      persist(next);
      return next;
    });
    return item;
  }, [persist]);

  const captureIdea = useCallback((text, kind = 'thought') => {
    const body = String(text || '').trim();
    if (!body) return null;
    const tagged = attachThreadToFragment({
      title: body.slice(0, 80),
      body,
      sourceLabel: 'Quick Capture',
    });
    const item = createBrandItem({
      stage: 'idea',
      kind,
      title: tagged.title,
      body,
      threadId: tagged.threadId || '',
      sourceKind: 'capture',
      sourceLabel: 'Quick Capture',
    });
    upsertItem(item);
    return item;
  }, [upsertItem]);

  const createFromSignal = useCallback((signal, stage = 'selected') => {
    const brief = bundle?.signalBriefs?.[signal.id];
    const platforms = brief
      ? [brief.platform, ...(brief.also || [])].filter(Boolean)
      : [];
    const item = createBrandItem({
      stage,
      kind: signal.kind,
      title: signal.title,
      hook: brief?.hook || '',
      body: signal.what,
      why: brief?.betterPost || signal.why,
      angle: brief
        ? `${platformLabel(brief.platform)}${brief.platformWhy ? ` — ${brief.platformWhy}` : ''}`
        : signal.angle,
      pillarId: signal.pillarId,
      threadId: signal.threadId || '',
      platforms,
      sourceKind: 'signal',
      sourceLabel: signal.sourceLabel,
      sourceId: signal.id,
    });
    setBundle((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        items: [item, ...prev.items],
        activeItemId: item.id,
        dismissedSignalIds: [...new Set([...(prev.dismissedSignalIds || []), signal.id])],
        updatedAt: nowIso(),
      };
      persist(next);
      return next;
    });
    return item;
  }, [bundle?.signalBriefs, persist]);

  const setActiveItem = useCallback((id) => {
    updateBundle({ activeItemId: id || null });
  }, [updateBundle]);

  const moveItem = useCallback((id, stage) => {
    setBundle((prev) => {
      if (!prev) return prev;
      const nextItems = prev.items.map((item) => {
        if (item.id !== id) return item;
        const patch = {
          ...item,
          stage,
          updatedAt: nowIso(),
          publishedAt: stage === 'published' ? (item.publishedAt || nowIso()) : item.publishedAt,
        };
        return normalizeBrandItem({ ...patch, progress: computeItemProgress(patch) });
      });
      const next = { ...prev, items: nextItems, updatedAt: nowIso() };
      persist(next);
      return next;
    });
  }, [persist]);

  const deleteItem = useCallback((id) => {
    setBundle((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        items: prev.items.filter((item) => item.id !== id),
        activeItemId: prev.activeItemId === id ? null : prev.activeItemId,
        updatedAt: nowIso(),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const dismissSignal = useCallback((id) => {
    updateBundle({
      dismissedSignalIds: [...new Set([...(bundle?.dismissedSignalIds || []), id])],
    });
  }, [bundle?.dismissedSignalIds, updateBundle]);

  const saveDna = useCallback((dnaPatch, handlePatch) => {
    updateBundle({
      dna: { ...dna, ...dnaPatch },
      handle: handlePatch ?? bundle?.handle,
    });
  }, [bundle?.handle, dna, updateBundle]);

  const runGenerateDraft = useCallback(async (item, format = 'linkedin') => {
    setBusy('draft');
    setError('');
    try {
      const result = await generateDraftFromExperience({ dna, item, format, threads });
      if (!result) throw new Error('Το μοντέλο δεν γύρισε draft.');
      const next = normalizeBrandItem({
        ...item,
        title: result.title || item.title,
        hook: result.hook || item.hook,
        body: result.body || item.body,
        pillarId: result.pillarId || item.pillarId,
        stage: item.stage === 'idea' ? 'drafting' : item.stage,
      });
      upsertItem(next);
      setActiveItem(next.id);
      return next;
    } catch (err) {
      setError(err.message || 'Αποτυχία σύνταξης.');
      return null;
    } finally {
      setBusy('');
    }
  }, [dna, setActiveItem, threads, upsertItem]);

  const runVariations = useCallback(async (item) => {
    setBusy('variations');
    setError('');
    try {
      const result = await generateVariations({ dna, item, threads });
      if (!result) throw new Error('Δεν γύρισαν variations.');
      const next = normalizeBrandItem({ ...item, variations: result });
      upsertItem(next);
      return result;
    } catch (err) {
      setError(err.message || 'Αποτυχία variations.');
      return null;
    } finally {
      setBusy('');
    }
  }, [dna, threads, upsertItem]);

  const runAskBrain = useCallback(async (item, question) => {
    setBusy('brain');
    setError('');
    try {
      return await askBrandBrain({ dna, item, question, threads });
    } catch (err) {
      setError(err.message || 'Ο Brain δεν απάντησε.');
      return '';
    } finally {
      setBusy('');
    }
  }, [dna, threads]);

  const runDevelopSignal = useCallback(async (signal, { force = false } = {}) => {
    if (!signal?.id) return null;
    const existing = bundle?.signalBriefs?.[signal.id];
    if (existing && !force) return existing;
    setBusy('develop');
    setError('');
    try {
      const result = await developBrandSignal({ dna, signal, threads });
      if (!result) throw new Error('Δεν γύρισε κρίση για το signal.');
      const threadId = isNarrativeThreadId(result.threadId)
        ? result.threadId
        : (signal.threadId || '');
      const brief = normalizeSignalBrief({ ...result, threadId });
      setBundle((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          signalBriefs: { ...(prev.signalBriefs || {}), [signal.id]: brief },
          updatedAt: nowIso(),
        };
        persist(next);
        return next;
      });
      return brief;
    } catch (err) {
      setError(err.message || 'Αποτυχία κρίσης του signal.');
      return null;
    } finally {
      setBusy('');
    }
  }, [bundle?.signalBriefs, dna, persist, threads]);

  const assignThread = useCallback((signalOrId, threadId) => {
    const signalId = typeof signalOrId === 'string' ? signalOrId : signalOrId?.id;
    if (!signalId || !isNarrativeThreadId(threadId)) return;
    setBundle((prev) => {
      if (!prev) return prev;
      const current = prev.signalBriefs?.[signalId] || {};
      const next = {
        ...prev,
        signalBriefs: {
          ...(prev.signalBriefs || {}),
          [signalId]: normalizeSignalBrief({ ...current, threadId }),
        },
        items: (prev.items || []).map((item) => (
          item.sourceId === signalId ? { ...item, threadId } : item
        )),
        updatedAt: nowIso(),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const runWeeklyBrief = useCallback(async () => {
    setBusy('weekly');
    setError('');
    try {
      const result = await generateWeeklyBrief({ dna, signals, threads });
      return result;
    } catch (err) {
      setError(err.message || 'Δεν γύρισε weekly brief.');
      return null;
    } finally {
      setBusy('');
    }
  }, [dna, signals, threads]);

  return {
    loading,
    saving,
    error,
    setError,
    busy,
    bundle,
    handle,
    dna,
    items,
    pipeline,
    signals,
    threads,
    briefs: bundle?.signalBriefs || {},
    balance,
    stats,
    weekly,
    activeDraft,
    captureIdea,
    createFromSignal,
    upsertItem,
    moveItem,
    deleteItem,
    setActiveItem,
    dismissSignal,
    saveDna,
    runGenerateDraft,
    runVariations,
    runAskBrain,
    runDevelopSignal,
    assignThread,
    runWeeklyBrief,
  };
}
