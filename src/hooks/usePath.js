import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createEmptyBlock,
  createEmptyGoal,
  createEmptyMetric,
  createEmptyMetricEntry,
  createEmptyTemplate,
  nowIso,
  startOfWeekMonday,
} from '../lib/path/schema';
import { loadPathBundle, queuePathSave, subscribePathSave } from '../lib/path/store';
import { deletePlanSourceFile, syncPlanSourceFile } from '../lib/path/planFile';
import { blocksForDate, materializeWeekBlocks, nextBlockOrder, reorderDayBlocks } from '../lib/path/logic';

export function usePath() {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    loadPathBundle()
      .then((next) => {
        if (!cancelled) setBundle(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Path could not load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => subscribePathSave((status) => {
    setSaving(status.saving);
    setError(status.error || '');
  }), []);

  const persist = useCallback((next) => {
    queuePathSave(next);
  }, []);

  const updateBundle = useCallback((patchOrFn) => {
    setBundle((prev) => {
      if (!prev) return prev;
      const patch = typeof patchOrFn === 'function' ? patchOrFn(prev) : patchOrFn;
      const next = { ...prev, ...patch, updatedAt: nowIso() };
      persist(next);
      return next;
    });
  }, [persist]);

  const ensureWeek = useCallback((weekStart) => {
    setBundle((prev) => {
      if (!prev) return prev;
      const next = materializeWeekBlocks(prev, weekStart || startOfWeekMonday());
      if (next.blocks.length === prev.blocks.length) return prev;
      const saved = { ...next, updatedAt: nowIso() };
      persist(saved);
      return saved;
    });
  }, [persist]);

  const upsertGoal = useCallback((goal) => {
    const nextGoal = createEmptyGoal({ ...goal, updatedAt: nowIso() });
    updateBundle((prev) => {
      const exists = prev.goals.some((item) => item.id === nextGoal.id);
      return {
        goals: exists
          ? prev.goals.map((item) => (item.id === nextGoal.id ? nextGoal : item))
          : [...prev.goals, nextGoal],
      };
    });
    return nextGoal;
  }, [updateBundle]);

  const archiveGoal = useCallback((goalId) => {
    updateBundle((prev) => ({
      goals: prev.goals.map((goal) => (
        goal.id === goalId
          ? { ...goal, status: 'Archived', archivedAt: nowIso(), updatedAt: nowIso() }
          : goal
      )),
    }));
  }, [updateBundle]);

  const upsertBlock = useCallback((block) => {
    let nextBlock = createEmptyBlock({ ...block, updatedAt: nowIso() });
    updateBundle((prev) => {
      const exists = prev.blocks.some((item) => item.id === nextBlock.id);
      if (!exists) {
        nextBlock = createEmptyBlock({
          ...nextBlock,
          order: nextBlockOrder(prev.blocks, nextBlock.date),
        });
      }
      return {
        blocks: exists
          ? prev.blocks.map((item) => (item.id === nextBlock.id ? nextBlock : item))
          : [...prev.blocks, nextBlock],
      };
    });
    return nextBlock;
  }, [updateBundle]);

  const removeBlock = useCallback((blockId) => {
    updateBundle((prev) => ({
      blocks: prev.blocks.filter((block) => block.id !== blockId),
    }));
  }, [updateBundle]);

  const moveBlock = useCallback((blockId, { date, startTime, beforeId } = {}) => {
    updateBundle((prev) => {
      const current = prev.blocks.find((block) => block.id === blockId);
      if (!current) return prev;
      let blocks = prev.blocks;
      if (startTime !== undefined) {
        blocks = blocks.map((block) => (
          block.id === blockId
            ? createEmptyBlock({ ...block, startTime, updatedAt: nowIso() })
            : block
        ));
      }
      if (date || beforeId !== undefined) {
        blocks = reorderDayBlocks(blocks, {
          blockId,
          date: date || current.date,
          beforeId: beforeId === undefined ? null : beforeId,
        });
      }
      return { blocks };
    });
  }, [updateBundle]);

  const nudgeBlock = useCallback((blockId, direction) => {
    updateBundle((prev) => {
      const current = prev.blocks.find((block) => block.id === blockId);
      if (!current?.date) return prev;
      const day = blocksForDate(prev.blocks, current.date);
      const index = day.findIndex((block) => block.id === blockId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= day.length) return prev;
      if (direction < 0) {
        return {
          blocks: reorderDayBlocks(prev.blocks, {
            blockId,
            date: current.date,
            beforeId: day[targetIndex].id,
          }),
        };
      }
      const after = day[targetIndex + 1];
      return {
        blocks: reorderDayBlocks(prev.blocks, {
          blockId,
          date: current.date,
          beforeId: after?.id || null,
        }),
      };
    });
  }, [updateBundle]);

  const setBlockStatus = useCallback((blockId, status, { completeLinkedTask = false } = {}) => {
    let linked = null;
    updateBundle((prev) => ({
      blocks: prev.blocks.map((block) => {
        if (block.id !== blockId) return block;
        if (completeLinkedTask && block.taskId) {
          linked = {
            taskId: block.taskId,
            taskSource: block.taskSource,
            taskTitle: block.taskTitle,
          };
        }
        return createEmptyBlock({
          ...block,
          status,
          completeLinkedTask: Boolean(completeLinkedTask),
          updatedAt: nowIso(),
        });
      }),
    }));
    return linked;
  }, [updateBundle]);

  const upsertTemplate = useCallback((template) => {
    const next = createEmptyTemplate({ ...template, updatedAt: nowIso() });
    updateBundle((prev) => {
      const exists = prev.templates.some((item) => item.id === next.id);
      return {
        templates: exists
          ? prev.templates.map((item) => (item.id === next.id ? next : item))
          : [...prev.templates, next],
      };
    });
    return next;
  }, [updateBundle]);

  const removeTemplate = useCallback((templateId) => {
    updateBundle((prev) => ({
      templates: prev.templates.filter((template) => template.id !== templateId),
    }));
  }, [updateBundle]);

  const upsertMetric = useCallback((metric) => {
    const next = createEmptyMetric({ ...metric, updatedAt: nowIso() });
    updateBundle((prev) => {
      const exists = prev.metrics.some((item) => item.id === next.id);
      return {
        metrics: exists
          ? prev.metrics.map((item) => (item.id === next.id ? next : item))
          : [...prev.metrics, next],
      };
    });
    return next;
  }, [updateBundle]);

  const addMetricEntry = useCallback((metricId, entry) => {
    const nextEntry = createEmptyMetricEntry(entry);
    updateBundle((prev) => ({
      metrics: prev.metrics.map((metric) => {
        if (metric.id !== metricId) return metric;
        return {
          ...metric,
          entries: [...metric.entries, nextEntry],
          updatedAt: nowIso(),
        };
      }),
      goals: prev.goals.map((goal) => {
        const metric = prev.metrics.find((item) => item.id === metricId);
        if (!metric || metric.goalId !== goal.id || metric.type !== 'Outcome') return goal;
        return { ...goal, currentValue: nextEntry.value, updatedAt: nowIso() };
      }),
    }));
    return nextEntry;
  }, [updateBundle]);

  const removeMetric = useCallback((metricId) => {
    updateBundle((prev) => ({
      metrics: prev.metrics.filter((metric) => metric.id !== metricId),
    }));
  }, [updateBundle]);

  const updatePlan = useCallback((plan) => {
    updateBundle((prev) => ({ plan: { ...prev.plan, ...plan } }));
  }, [updateBundle]);

  useEffect(() => {
    const sourceFile = bundle?.plan?.sourceFile;
    if (!sourceFile?.id || sourceFile.storagePath) return undefined;
    let cancelled = false;
    syncPlanSourceFile(sourceFile).then((next) => {
      if (cancelled || !next?.storagePath || next.storagePath === sourceFile.storagePath) return;
      updatePlan({ sourceFile: next });
    });
    return () => {
      cancelled = true;
    };
  }, [bundle?.plan?.sourceFile, updatePlan]);

  const createImportedGoals = useCallback((drafts, plan) => {
    const selected = (drafts || []).filter((draft) => draft.selected && draft.goal?.title?.trim());
    if (!selected.length) return [];
    let previousFile = null;
    updateBundle((prev) => {
      previousFile = prev.plan?.sourceFile || null;
      const nextPlan = plan
        ? {
            ...prev.plan,
            ...plan,
            sourceFile: plan.sourceFile || prev.plan.sourceFile || null,
          }
        : prev.plan;
      return {
        plan: nextPlan,
        goals: [
          ...prev.goals,
          ...selected.map((draft) => createEmptyGoal({
            ...draft.goal,
            status: 'Active',
            updatedAt: nowIso(),
          })),
        ],
        metrics: [
          ...prev.metrics,
          ...selected.flatMap((draft) => (draft.metrics || []).map((metric) => createEmptyMetric({
            ...metric,
            goalId: draft.goal.id,
          }))),
        ],
        templates: [
          ...prev.templates,
          ...selected.flatMap((draft) => (draft.templates || []).map((template) => createEmptyTemplate({
            ...template,
            goalId: draft.goal.id,
          }))),
        ],
      };
    });
    if (previousFile?.id && plan?.sourceFile?.id && previousFile.id !== plan.sourceFile.id) {
      deletePlanSourceFile(previousFile);
    }
    return selected.map((draft) => draft.goal);
  }, [updateBundle]);

  const goals = bundle?.goals || [];
  const blocks = bundle?.blocks || [];
  const templates = bundle?.templates || [];
  const metrics = bundle?.metrics || [];
  const plan = bundle?.plan || { title: '', startDate: null, endDate: null, sourceFile: null };

  const stats = useMemo(() => ({
    active: goals.filter((goal) => goal.status === 'Active').length,
    paused: goals.filter((goal) => goal.status === 'Paused').length,
  }), [goals]);

  return {
    bundle,
    loading,
    saving,
    error,
    setError,
    plan,
    goals,
    blocks,
    templates,
    metrics,
    stats,
    updatePlan,
    upsertGoal,
    archiveGoal,
    upsertBlock,
    removeBlock,
    moveBlock,
    nudgeBlock,
    setBlockStatus,
    upsertTemplate,
    removeTemplate,
    upsertMetric,
    addMetricEntry,
    removeMetric,
    ensureWeek,
    createImportedGoals,
  };
}
