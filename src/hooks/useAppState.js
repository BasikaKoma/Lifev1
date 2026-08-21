import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createDefaultStages, createStarterStages, createEmptyGoal, createEmptyStage, createEmptyIdea, createEmptySticky, createEmptyCanvasObstacle, createEmptyCanvasResource, createEmptyCanvasTask, reindexGoals, generateId } from '../data/templates';
import { findGoalIdFromHint, findStageIdFromHint } from '../utils/assistantParser';
import { computeAutoLayout, sameNodeRef, DEFAULT_CANVAS_STYLE } from '../utils/canvasNodes';
import { getStickyMilestonePair, stickyLinkedToStage } from '../utils/milestoneNotes';
import {
  applyCheckpointLinkToState,
  connectionLinksEntityToCheckpoint,
  getEntityCheckpointPair,
  removeLinkedCheckpointId,
} from '../utils/checkpointLinks';
import { ORIGIN_Y, syncRoadmapPositions, positionMilestoneOnTimeline, resolveMilestoneDrag, resolveCanvasItemDrag, isOnRoadmap, getTimelineY, shiftRoadmapAttachedItems, reorderCheckpointsByTimelineY, getPlanEndY, getPlanStartY, snapLifelinePlanMilestoneToEndDate, syncLifelinePlanMilestoneFromTimelineY, alignLifelinePlanStages } from '../utils/stageLayout';
import { DEFAULT_MAP_THEME, mergeMapTheme, getRoadmapLayout } from '../utils/mapTheme';
import { processStages, setStageComplete, toggleStageComplete as toggleStageCompleteState } from '../utils/logic';
import { normalizeProjectBrief } from '../utils/projectBrief';
import { isSupabaseConfigured } from '../lib/supabase';
import { SAVE_INTERVAL_MS } from '../constants/save';
import {
  loadInitialProject,
  loadProjectById,
  saveProjectToSupabase,
  resetSupabaseProject,
  switchActiveProject,
  createProject,
  deleteProject,
  subscribeToProjectChanges,
  fetchProjectCloudUpdatedAt,
  loadLifelineAnchors,
  updateLifelineAnchor,
  loadAllProjectsActivity,
  patchLifelineProjectBundle,
  appendCaptureToRemoteProject,
  removeCaptureFromRemoteProject,
} from '../utils/supabaseDb';
import {
  applyCaptureToState,
  captureSuccessMessage,
  removeCaptureFromState,
} from '../utils/smartCapture';
import {
  acceptProjectInvite,
  acceptPendingInvites,
} from '../utils/projectSharing';
import {
  getPendingInviteToken,
  clearPendingInviteToken,
} from '../utils/inviteSession';
import { setStoredProjectId } from '../utils/projectSession';
import { syncLifelineMapTheme, toDateString, addDays, daysBetween, getLifelineConfig, timelineYToDate, getDayTickCanvasY, clampLifelineDayHeight, DEFAULT_LIFELINE_CONFIG } from '../utils/lifeline';
import { scaleInkStrokesForLifelineZoom } from '../utils/inkStrokes';
import {
  buildPlanStartUpdates,
  distributeCheckpointPlanDates,
  getDefaultPlanDates,
  isPlanMode,
  shiftCheckpointPlanDates,
  PLAN_DAY_HEIGHT,
  buildLifelinePlanContext,
  resolvePlanDayHeight,
} from '../utils/planMode';
import { patchDayEntry, normalizeLifelineDays, routineTemplatesEqual, patchMultipleDayEntries, getDayEntry } from '../utils/lifelineDays';
import { normalizeSelfHubDays } from '../utils/selfHubDays';
import { captureSelfHubLiveDay as mergeSelfHubCapture } from '../utils/selfHubSync';
import { useAppHistory } from './useAppHistory';
import { useUndoRedo } from './useUndoRedo';
import { isInkGestureActive, onInkGestureIdle, flushActiveInkStroke } from '../utils/inkStrokes';
import { ensureInkGroups } from '../utils/inkGroups';
import { withTimeout } from '../utils/withTimeout';
import {
  COLUMN_TO_STATE,
  capturePersistable,
  diffDirtyColumns,
  persistableValuesEqual,
} from '../utils/projectSavePatch';

const LOAD_PROJECT_TIMEOUT_MS = 25000;

function normalizeInk(strokes) {
  return ensureInkGroups(strokes || []);
}

function reindexStages(stages) {
  return [...stages]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i + 1 }));
}

function connectionInvolvesCheckpoint(conn, stageId, checkpointId) {
  const matches = (node) =>
    node?.type === 'checkpoint' &&
    node?.id === checkpointId &&
    (node?.stageId || '') === (stageId || '');
  return matches(conn?.from) || matches(conn?.to);
}

function stripCheckpointFromState(prev, stageId, checkpointId) {
  const stripLinks = (item) => {
    if (!item) return item;
    return {
      ...item,
      linkedCheckpointIds: removeLinkedCheckpointId(item.linkedCheckpointIds, checkpointId),
    };
  };

  return {
    ...prev,
    stages: prev.stages.map((s) => ({
      ...s,
      checkpoints: (s.checkpoints || []).filter((cp) => !(s.id === stageId && cp.id === checkpointId)),
      ideas: (s.ideas || []).map(stripLinks),
    })),
    backlog: (prev.backlog || []).map(stripLinks),
    canvasStickies: (prev.canvasStickies || []).map(stripLinks),
    canvasObstacles: (prev.canvasObstacles || []).map(stripLinks),
    canvasResources: (prev.canvasResources || []).map(stripLinks),
    canvasTasks: (prev.canvasTasks || []).map(stripLinks),
    notes: (prev.notes || []).map(stripLinks),
    canvasConnections: (prev.canvasConnections || []).filter(
      (conn) => !connectionInvolvesCheckpoint(conn, stageId, checkpointId)
    ),
  };
}

function relayoutStages(stages, mapTheme) {
  const layout = getRoadmapLayout(mapTheme);
  return processStages(syncRoadmapPositions(stages, layout), layout);
}

function prepareProjectPayload(data, { relayout = true } = {}) {
  let mapTheme = mergeMapTheme(data.mapTheme);
  const anchorDates = (data.lifelineAnchors || [])
    .map((p) => p.lifelineAnchorDate)
    .filter(Boolean);
  if (data.isLifeline && relayout) {
    mapTheme = syncLifelineMapTheme(mapTheme, anchorDates);
  }
  let stages = data.stages || [];
  if (relayout) {
    stages = relayoutStages(stages, mapTheme);
    if (data.isLifeline) {
      stages = alignLifelinePlanStages(stages, mapTheme, anchorDates);
    }
  } else {
    stages = processStages(stages);
  }
  return { stages, mapTheme };
}

function pickLoadedJson(value, prevValue, fallback, keepUi) {
  if (value !== undefined && value !== null) return value;
  if (keepUi && prevValue !== undefined) return prevValue;
  return fallback;
}

function assembleProjectState(data, { keepUi = false, prev = null, resetSelection = false } = {}) {
  const payload = {
    ...data,
    stages: pickLoadedJson(data.stages, prev?.stages, [], keepUi),
    mapTheme: pickLoadedJson(data.mapTheme, prev?.mapTheme, {}, keepUi),
    canvasInk: pickLoadedJson(data.canvasInk, prev?.canvasInk, [], keepUi),
    whiteboardStrokes: pickLoadedJson(data.whiteboardStrokes, prev?.whiteboardStrokes, [], keepUi),
    notes: pickLoadedJson(data.notes, prev?.notes, [], keepUi),
    backlog: pickLoadedJson(data.backlog, prev?.backlog, [], keepUi),
    goals: pickLoadedJson(data.goals, prev?.goals, [], keepUi),
    lifelineDays: pickLoadedJson(data.lifelineDays, prev?.lifelineDays, {}, keepUi),
  };
  const prepared = prepareProjectPayload(payload, { relayout: !keepUi });
  const isLifeline = data.isLifeline === true;
  return {
    projectId: data.projectId,
    projectTitle: data.projectTitle,
    isLifeline,
    isOwner: data.isOwner,
    ownerUserId: data.ownerUserId,
    lifelineAnchorDate: data.lifelineAnchorDate ?? prev?.lifelineAnchorDate ?? null,
    lifelineDays: normalizeLifelineDays(payload.lifelineDays),
    stages: prepared.stages,
    goals: payload.goals || [],
    notes: payload.notes || [],
    backlog: payload.backlog || [],
    canvasConnections: pickLoadedJson(data.canvasConnections, prev?.canvasConnections, [], keepUi),
    canvasStickies: pickLoadedJson(data.canvasStickies, prev?.canvasStickies, [], keepUi),
    canvasObstacles: pickLoadedJson(data.canvasObstacles, prev?.canvasObstacles, [], keepUi),
    canvasResources: pickLoadedJson(data.canvasResources, prev?.canvasResources, [], keepUi),
    canvasTasks: pickLoadedJson(data.canvasTasks, prev?.canvasTasks, [], keepUi),
    canvasInk: normalizeInk(payload.canvasInk),
    whiteboardStrokes: normalizeInk(payload.whiteboardStrokes),
    mapTheme: prepared.mapTheme,
    projectBrief: normalizeProjectBrief(pickLoadedJson(data.projectBrief, prev?.projectBrief, {}, keepUi)),
    selectedStageId: resetSelection
      ? null
      : (keepUi && prev ? prev.selectedStageId : (data.selectedStageId || null)),
    focusMode: data.focusMode === true,
    cloudUpdatedAt: data.cloudUpdatedAt || null,
    activeView: keepUi && prev
      ? prev.activeView
      : (data.activeView === 'overview' ? 'roadmap' : data.activeView || 'roadmap'),
  };
}

export function useAppState(userId) {
  const [state, setState] = useState(null);
  const [projectList, setProjectList] = useState([]);
  const [lifelineProjectId, setLifelineProjectId] = useState(null);
  const [lifelineAnchors, setLifelineAnchors] = useState([]);
  const [projectActivity, setProjectActivity] = useState([]);
  const [selfHubDays, setSelfHubDays] = useState({});
  const [lifelineArchiveDays, setLifelineArchiveDays] = useState({});
  const lifelineDaysRef = useRef({});
  const selfHubDaysRef = useRef({});
  const [lifelineFocusToken, setLifelineFocusToken] = useState(0);
  const lastRegularProjectIdRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(null);
  const [syncConflict, setSyncConflict] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const stateRef = useRef(null);
  const dirtyRef = useRef(false);
  const dirtyColumnsRef = useRef(new Set());
  const pendingCloudRef = useRef(new Set());
  const syncedPersistableRef = useRef(null);
  const savingRef = useRef(false);
  const savePromiseRef = useRef(null);
  const applyingRemoteRef = useRef(false);
  const ownWriteGraceUntilRef = useRef(0);
  const flushSaveNowRef = useRef(async () => true);
  const pendingLifelineBundleRef = useRef(false);
  const sessionProjectsRef = useRef(new Map());
  const projectListRef = useRef([]);

  const hydrateLifelineHubFromState = useCallback((next) => {
    if (!next?.isLifeline) return;
    const hub = normalizeSelfHubDays(next.mapTheme?.lifeline?.selfHubDays);
    const days = normalizeLifelineDays(next.lifelineDays);
    selfHubDaysRef.current = hub;
    lifelineDaysRef.current = days;
    setSelfHubDays(hub);
  }, []);

  const markOwnCloudWrite = useCallback(() => {
    ownWriteGraceUntilRef.current = Date.now() + 4000;
  }, []);

  const applyCloudTimestamp = useCallback((cloudUpdatedAt) => {
    if (!cloudUpdatedAt) return;
    markOwnCloudWrite();
    if (stateRef.current) {
      stateRef.current = { ...stateRef.current, cloudUpdatedAt };
    }
    setState((prev) =>
      prev && prev.cloudUpdatedAt !== cloudUpdatedAt
        ? { ...prev, cloudUpdatedAt }
        : prev
    );
  }, [markOwnCloudWrite]);

  const applyLifelineBundleLocally = useCallback((bundle, { fromRemote = false } = {}) => {
    const lifelineDays = bundle.lifelineDays
      ? normalizeLifelineDays(bundle.lifelineDays)
      : null;
    const selfHubDaysNext = bundle.selfHubDays
      ? normalizeSelfHubDays(bundle.selfHubDays)
      : null;

    if (lifelineDays) {
      lifelineDaysRef.current = lifelineDays;
    }
    if (selfHubDaysNext) {
      selfHubDaysRef.current = selfHubDaysNext;
      setSelfHubDays(selfHubDaysNext);
    }

    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      if (lifelineDays) next.lifelineDays = lifelineDays;
      if (selfHubDaysNext) {
        next.mapTheme = {
          ...prev.mapTheme,
          lifeline: {
            ...(prev.mapTheme?.lifeline || {}),
            selfHubDays: selfHubDaysNext,
          },
        };
      }
      if (fromRemote) {
        const synced = syncedPersistableRef.current;
        if (synced) {
          syncedPersistableRef.current = {
            ...synced,
            ...(lifelineDays && !dirtyColumnsRef.current.has('lifeline_days')
              ? { lifelineDays }
              : {}),
            ...(selfHubDaysNext && !dirtyColumnsRef.current.has('map_theme')
              ? { mapTheme: next.mapTheme }
              : {}),
          };
        }
      }
      stateRef.current = next;
      return next;
    });

    if (!fromRemote) {
      pendingLifelineBundleRef.current = true;
    }
  }, []);

  useEffect(() => {
    stateRef.current = state;
    if (state?.isLifeline) {
      lifelineDaysRef.current = state.lifelineDays || {};
      const fromTheme = normalizeSelfHubDays(state.mapTheme?.lifeline?.selfHubDays);
      if (Object.keys(fromTheme).length) {
        selfHubDaysRef.current = fromTheme;
      }
    }
  }, [state]);

  useEffect(() => {
    projectListRef.current = projectList;
  }, [projectList]);

  const snapshotPendingHub = useCallback(() => (
    pendingLifelineBundleRef.current
      ? { selfHubDays: selfHubDaysRef.current, lifelineDays: lifelineDaysRef.current }
      : null
  ), []);

  const stashCurrentProject = useCallback(() => {
    const current = stateRef.current;
    if (!current?.projectId) return;
    sessionProjectsRef.current.set(current.projectId, {
      state: current,
      dirtyColumns: new Set(dirtyColumnsRef.current),
      dirty: dirtyRef.current,
      syncedPersistable: syncedPersistableRef.current,
    });
  }, []);

  const persistInactiveSessionProjects = useCallback(async () => {
    const currentId = stateRef.current?.projectId;
    for (const [id, cached] of sessionProjectsRef.current) {
      if (id === currentId || !cached?.dirty || !cached.state) continue;
      const columns = [...cached.dirtyColumns];
      if (!columns.length) {
        cached.dirty = false;
        continue;
      }
      try {
        const result = await saveProjectToSupabase(cached.state, { columns });
        if (result?.ok === false || result?.conflict) continue;
        cached.dirty = false;
        cached.dirtyColumns = new Set();
        cached.syncedPersistable = capturePersistable(cached.state);
        if (result.cloudUpdatedAt) {
          cached.state = { ...cached.state, cloudUpdatedAt: result.cloudUpdatedAt };
        }
      } catch {
        /* keep dirty for the next manual / interval save */
      }
    }
  }, []);

  const sessionHasUnsavedWork = useCallback(() => {
    if (dirtyRef.current || pendingLifelineBundleRef.current) return true;
    for (const cached of sessionProjectsRef.current.values()) {
      if (cached?.dirty) return true;
    }
    return false;
  }, []);

  const applyTrackedState = useCallback((updater) => {
    let changed = [];
    setState((prev) => {
      if (!prev) return prev;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!next || next === prev) return prev;
      changed = diffDirtyColumns(capturePersistable(prev), next);
      if (changed.length) {
        for (const column of changed) dirtyColumnsRef.current.add(column);
        dirtyRef.current = true;
      }
      stateRef.current = next;
      return next;
    });
    if (changed.length) {
      setHasUnsavedChanges(true);
    }
  }, []);

  const { recordBeforeChange, clearHistory, undo } = useUndoRedo(stateRef, applyTrackedState);

  const patchState = useCallback(
    (updater, undoOptions) => {
      applyTrackedState((prev) => {
        if (!prev) return prev;
        recordBeforeChange(prev, undoOptions);
        return typeof updater === 'function' ? updater(prev) : updater;
      });
    },
    [applyTrackedState, recordBeforeChange]
  );

  const { closeStage } = useAppHistory(state, setState, loading);

  const rememberSyncedState = useCallback((nextState) => {
    syncedPersistableRef.current = capturePersistable(nextState);
    dirtyColumnsRef.current = new Set();
    dirtyRef.current = false;
    pendingCloudRef.current = new Set();
    setHasUnsavedChanges(false);
  }, []);

  const restoreSessionProject = useCallback((projectId, extras = {}) => {
    const cached = sessionProjectsRef.current.get(projectId);
    if (!cached?.state) return false;
    sessionProjectsRef.current.delete(projectId);
    const pendingHub = snapshotPendingHub();
    setSyncConflict(false);
    clearHistory();
    const next = { ...cached.state };
    if (extras.activeView) {
      next.activeView = extras.activeView === 'overview' ? 'roadmap' : extras.activeView;
    }
    if (Object.prototype.hasOwnProperty.call(extras, 'selectedStageId')) {
      next.selectedStageId = extras.selectedStageId || null;
    }
    if (!next.isLifeline && next.projectId) {
      lastRegularProjectIdRef.current = next.projectId;
    } else if (next.isLifeline) {
      setLifelineFocusToken(Date.now());
    }
    syncedPersistableRef.current = cached.syncedPersistable;
    dirtyColumnsRef.current = new Set(cached.dirtyColumns);
    dirtyRef.current = cached.dirty === true;
    pendingCloudRef.current = new Set();
    stateRef.current = next;
    setState(next);
    hydrateLifelineHubFromState(next);
    if (pendingHub && next.isLifeline) {
      applyLifelineBundleLocally(pendingHub);
    }
    setHasUnsavedChanges(sessionHasUnsavedWork());
    setStoredProjectId(projectId);
    return true;
  }, [applyLifelineBundleLocally, clearHistory, hydrateLifelineHubFromState, sessionHasUnsavedWork, snapshotPendingHub]);

  const applyLoadedProject = useCallback(
    (data) => {
      setProjectList(data.projectList || []);
      if (data.lifelineProjectId) setLifelineProjectId(data.lifelineProjectId);
      if (!data.isLifeline && data.projectId) {
        lastRegularProjectIdRef.current = data.projectId;
      } else if (data.isLifeline) {
        lastRegularProjectIdRef.current = data.projectList?.[0]?.id || null;
        setLifelineFocusToken(Date.now());
      }
      const assembled = assembleProjectState(data, { resetSelection: true });
      assembled.activeView = 'self';
      rememberSyncedState(assembled);
      setState(assembled);
      hydrateLifelineHubFromState(assembled);
      clearHistory();
    },
    [clearHistory, rememberSyncedState, hydrateLifelineHubFromState]
  );

  const retryLoadWorkspace = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setSyncError(null);
    try {
      const data = await withTimeout(
        loadInitialProject(),
        LOAD_PROJECT_TIMEOUT_MS,
        'Η βάση αργεί πολύ. Δοκίμασε ξανά ή έλεγξε internet.',
      );
      applyLoadedProject(data);
      acceptPendingInvites().catch(() => {});
    } catch (err) {
      setState(null);
      setSyncError(err.message || 'Failed to load from database');
    } finally {
      setLoading(false);
    }
  }, [userId, applyLoadedProject]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setSyncError(null);

    withTimeout(
      loadInitialProject(),
      LOAD_PROJECT_TIMEOUT_MS,
      'Η βάση αργεί πολύ. Δοκίμασε ξανά ή έλεγξε internet.',
    )
      .then(async (data) => {
        if (cancelled) return;
        applyLoadedProject(data);
        try {
          await acceptPendingInvites();
          const pendingToken = getPendingInviteToken();
          if (pendingToken) {
            const inviteResult = await acceptProjectInvite(pendingToken);
            clearPendingInviteToken();
            if (inviteResult?.projectId) {
              const switched = await switchActiveProject(inviteResult.projectId);
              applyLoadedProject(switched);
            }
          }
        } catch (inviteErr) {
          clearPendingInviteToken();
          console.warn('Invite acceptance failed', inviteErr);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState(null);
        setSyncError(err.message || 'Failed to load from database');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, applyLoadedProject]);

  useEffect(() => {
    if (!state?.isLifeline && state?.activeView !== 'self') return;
    let cancelled = false;
    loadLifelineAnchors()
      .then((anchors) => {
        if (!cancelled) setLifelineAnchors(anchors);
      })
      .catch(() => {
        if (!cancelled) setLifelineAnchors([]);
      });
    loadAllProjectsActivity()
      .then((activity) => {
        if (!cancelled) setProjectActivity(activity);
      })
      .catch(() => {
        if (!cancelled) setProjectActivity([]);
      });
    return () => {
      cancelled = true;
    };
  }, [state?.isLifeline, state?.activeView, state?.projectId, projectList.length]);

  useEffect(() => {
    if (!lifelineProjectId || !isSupabaseConfigured()) return undefined;
    let cancelled = false;
    loadProjectById(lifelineProjectId)
      .then((data) => {
        if (cancelled) return;
        const hubDays = normalizeSelfHubDays(data.mapTheme?.lifeline?.selfHubDays);
        const days = normalizeLifelineDays(data.lifelineDays);
        if (!pendingLifelineBundleRef.current) {
          selfHubDaysRef.current = hubDays;
          lifelineDaysRef.current = days;
          setSelfHubDays(hubDays);
          setLifelineArchiveDays(days);
        }
        if (stateRef.current?.projectId === lifelineProjectId) return;
        const existing = sessionProjectsRef.current.get(lifelineProjectId);
        if (existing?.dirty) return;
        const assembled = assembleProjectState(
          { ...data, activeView: 'roadmap' },
          { resetSelection: true }
        );
        sessionProjectsRef.current.set(lifelineProjectId, {
          state: assembled,
          dirtyColumns: new Set(),
          dirty: false,
          syncedPersistable: capturePersistable(assembled),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lifelineProjectId]);

  const markLifelineBundlePending = useCallback(() => {
    if (!lifelineProjectId || !isSupabaseConfigured()) return;
    pendingLifelineBundleRef.current = true;
    setHasUnsavedChanges(true);
  }, [lifelineProjectId]);

  const captureSelfHubLiveDay = useCallback((date, patch) => {
    const current = stateRef.current;
    const lifelineDaysSource = current?.isLifeline
      ? current.lifelineDays
      : lifelineDaysRef.current;

    const merged = mergeSelfHubCapture({
      selfHubDays: selfHubDaysRef.current,
      lifelineDays: lifelineDaysSource,
      date,
      patch,
    });

    selfHubDaysRef.current = merged.selfHubDays;
    lifelineDaysRef.current = merged.lifelineDays;
    setSelfHubDays(merged.selfHubDays);

    if (current?.isLifeline) {
      applyLifelineBundleLocally({
        lifelineDays: merged.lifelineDays,
        selfHubDays: merged.selfHubDays,
      });
      markLifelineBundlePending();
      return;
    }

    setLifelineArchiveDays(merged.lifelineDays);
    markLifelineBundlePending();
  }, [applyLifelineBundleLocally, markLifelineBundlePending]);

  const lastRegularProjectId = useMemo(() => {
    if (!state?.isLifeline) return state?.projectId || lastRegularProjectIdRef.current;
    const remembered = lastRegularProjectIdRef.current;
    if (remembered && projectList.some((p) => p.id === remembered)) return remembered;
    return projectList[0]?.id || null;
  }, [state?.isLifeline, state?.projectId, projectList]);

  const applyRemoteProject = useCallback((data, { keepUi = true } = {}) => {
    applyingRemoteRef.current = true;
    setSyncConflict(false);
    setSyncError(null);
    clearHistory();
    const next = assembleProjectState(
      { ...data, isLifeline: data.isLifeline === true || stateRef.current?.isLifeline === true },
      { keepUi, prev: stateRef.current }
    );
    rememberSyncedState(next);
    setState(next);
    hydrateLifelineHubFromState(next);
    queueMicrotask(() => {
      applyingRemoteRef.current = false;
    });
  }, [clearHistory, rememberSyncedState, hydrateLifelineHubFromState]);

  const reloadFromCloud = useCallback(async () => {
    const projectId = stateRef.current?.projectId;
    if (!projectId) return;
    setLoading(true);
    setSyncError(null);
    try {
      const data = await loadProjectById(projectId);
      applyRemoteProject(data, { keepUi: true });
    } catch (err) {
      setSyncError(err.message || 'Failed to reload from cloud');
    } finally {
      setLoading(false);
    }
  }, [applyRemoteProject]);

  const handleSaveResult = useCallback((result, savedColumns, savedSnapshot) => {
    if (result?.conflict) {
      setSyncConflict(true);
      setHasUnsavedChanges(true);
      setSyncError(result.warning || 'Conflict with another device');
      return;
    }
    if (result?.ok !== false) {
      const savedPersistable = capturePersistable(savedSnapshot);
      const currentPersistable = capturePersistable(stateRef.current);
      const actuallySaved = Array.isArray(result?.writtenColumns)
        ? result.writtenColumns
        : savedColumns;
      if (savedPersistable && actuallySaved?.length) {
        const nextSynced = { ...(syncedPersistableRef.current || savedPersistable) };
        for (const column of actuallySaved) {
          const field = COLUMN_TO_STATE[column];
          if (field) nextSynced[field] = savedPersistable[field];
          if (persistableValuesEqual(column, currentPersistable?.[field], savedPersistable[field])) {
            dirtyColumnsRef.current.delete(column);
          }
        }
        syncedPersistableRef.current = nextSynced;
      }
      dirtyRef.current = dirtyColumnsRef.current.size > 0;
      setHasUnsavedChanges(sessionHasUnsavedWork());
      setSyncConflict(false);
      setSyncError(result?.warning || null);
      markOwnCloudWrite();
      if (result?.cloudUpdatedAt) {
        if (stateRef.current) {
          stateRef.current = {
            ...stateRef.current,
            cloudUpdatedAt: result.cloudUpdatedAt,
          };
        }
        setState((prev) => (
          prev && prev.cloudUpdatedAt !== result.cloudUpdatedAt
            ? { ...prev, cloudUpdatedAt: result.cloudUpdatedAt }
            : prev
        ));
      }
      return;
    }
    if (result?.warning) {
      setSyncError(result.warning);
    }
  }, [markOwnCloudWrite, sessionHasUnsavedWork]);

  const runSave = useCallback(async (columnsWanted) => {
    if (syncConflict) return savePromiseRef.current;
    if (columnsWanted?.length) {
      for (const column of columnsWanted) pendingCloudRef.current.add(column);
    } else {
      for (const column of dirtyColumnsRef.current) pendingCloudRef.current.add(column);
    }

    if (savingRef.current) return savePromiseRef.current;

    savingRef.current = true;
    setSyncing(true);
    const promise = (async () => {
      let lastResult = { ok: true };
      try {
        while (pendingCloudRef.current.size) {
          const pending = [...pendingCloudRef.current].filter((column) =>
            dirtyColumnsRef.current.has(column)
          );
          pendingCloudRef.current.clear();
          if (!pending.length) break;

          if (pending.some((column) => column === 'canvas_ink' || column === 'whiteboard_strokes')) {
            if (isInkGestureActive()) {
              await new Promise((resolve) => {
                onInkGestureIdle(resolve);
              });
            }
          }

          const snapshot = stateRef.current;
          if (!snapshot?.projectId) return { ok: true };

          lastResult = await saveProjectToSupabase(snapshot, { columns: pending });
          handleSaveResult(lastResult, pending, snapshot);
          if (lastResult?.conflict || lastResult?.ok === false) return lastResult;
        }
        return lastResult;
      } catch (err) {
        setHasUnsavedChanges(true);
        const timedOut = err?.name === 'AbortError';
        setSyncError(
          timedOut
            ? 'Η αποθήκευση έληξε — η βάση δεδομένων δεν απαντά. Έλεγξε το Supabase dashboard (Next Move) και δοκίμασε ξανά.'
            : err.message || 'Database save failed'
        );
        throw err;
      } finally {
        savingRef.current = false;
        setSyncing(false);
        savePromiseRef.current = null;
      }
    })();
    savePromiseRef.current = promise;
    return promise;
  }, [handleSaveResult, syncConflict]);

  const flushPendingLifelineBundle = useCallback(async () => {
    if (!pendingLifelineBundleRef.current || !lifelineProjectId || !isSupabaseConfigured()) {
      return;
    }
    if (stateRef.current?.isLifeline) {
      dirtyColumnsRef.current.add('lifeline_days');
      dirtyColumnsRef.current.add('map_theme');
      dirtyRef.current = true;
      return;
    }
    const cached = sessionProjectsRef.current.get(lifelineProjectId);
    if (cached?.state) {
      cached.state = {
        ...cached.state,
        lifelineDays: lifelineDaysRef.current,
        mapTheme: {
          ...cached.state.mapTheme,
          lifeline: {
            ...(cached.state.mapTheme?.lifeline || {}),
            selfHubDays: selfHubDaysRef.current,
          },
        },
      };
      cached.dirtyColumns.add('lifeline_days');
      cached.dirtyColumns.add('map_theme');
      cached.dirty = true;
      pendingLifelineBundleRef.current = false;
      return;
    }
    pendingLifelineBundleRef.current = false;
    try {
      const result = await patchLifelineProjectBundle(lifelineProjectId, {
        selfHubDays: selfHubDaysRef.current,
        lifelineDays: lifelineDaysRef.current,
      });
      if (result?.ok && result.cloudUpdatedAt) {
        applyCloudTimestamp(result.cloudUpdatedAt);
      } else if (!result?.ok) {
        pendingLifelineBundleRef.current = true;
      }
    } catch {
      pendingLifelineBundleRef.current = true;
    }
  }, [lifelineProjectId, applyCloudTimestamp]);

  const flushSaveNow = useCallback(async () => {
    if (syncConflict) return false;
    if (savingRef.current && savePromiseRef.current) {
      try {
        await savePromiseRef.current;
      } catch {
        return false;
      }
    }
    await flushPendingLifelineBundle();
    flushActiveInkStroke();
    try {
      if (dirtyRef.current) {
        await runSave([...dirtyColumnsRef.current]);
        if (!dirtyRef.current) pendingLifelineBundleRef.current = false;
      }
      await persistInactiveSessionProjects();
      const stillDirty = sessionHasUnsavedWork();
      setHasUnsavedChanges(stillDirty);
      return !stillDirty && !syncConflict;
    } catch {
      return false;
    }
  }, [runSave, syncConflict, flushPendingLifelineBundle, persistInactiveSessionProjects, sessionHasUnsavedWork]);

  useEffect(() => {
    flushSaveNowRef.current = flushSaveNow;
    window.__lifev1FlushSave = flushSaveNow;
    return () => {
      delete window.__lifev1FlushSave;
    };
  }, [flushSaveNow]);

  useEffect(() => {
    if (loading || !state?.projectId) return undefined;
    const intervalId = setInterval(() => {
      if (sessionHasUnsavedWork() && !savingRef.current && !syncConflict) {
        flushSaveNowRef.current().catch(() => {});
      }
    }, SAVE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [loading, state?.projectId, syncConflict, sessionHasUnsavedWork]);

  useEffect(() => {
    const onKey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.code !== 'KeyS') return;
      event.preventDefault();
      flushSaveNowRef.current().catch(() => {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const blockUnload = (event) => {
      if (sessionHasUnsavedWork() || savingRef.current || syncConflict) {
        event.preventDefault();
        event.returnValue = 'Υπάρχουν μη αποθηκευμένες αλλαγές. Αποθήκευσε πριν κλείσεις.';
      }
    };

    window.addEventListener('beforeunload', blockUnload);
    return () => {
      window.removeEventListener('beforeunload', blockUnload);
    };
  }, []);

  useEffect(() => {
    let unsubscribe;
    import('../platform/save').then(({ onFlushBeforeClose }) => {
      unsubscribe = onFlushBeforeClose(() => flushSaveNowRef.current());
    });
    return () => unsubscribe?.();
  }, []);

  // Live sync from other devices
  useEffect(() => {
    if (loading || !state?.projectId || !isSupabaseConfigured()) return;

    const projectId = state.projectId;

    const unsub = subscribeToProjectChanges(projectId, (remote) => {
      if (remote.projectId !== stateRef.current?.projectId) return;
      if (savingRef.current || Date.now() < ownWriteGraceUntilRef.current) {
        applyCloudTimestamp(remote.cloudUpdatedAt);
        return;
      }
      if (remote.cloudUpdatedAt && remote.cloudUpdatedAt === stateRef.current?.cloudUpdatedAt) {
        return;
      }
      if (dirtyRef.current || pendingLifelineBundleRef.current) {
        setSyncConflict(true);
        setHasUnsavedChanges(true);
        setSyncError(
          'Το project ενημερώθηκε από άλλη συσκευή. Πάτα «Φόρτωση cloud» για συγχρονισμό.'
        );
        return;
      }
      applyRemoteProject(remote, { keepUi: true });
    });

    const pullIfClean = async () => {
      const snapshot = stateRef.current;
      if (
        !snapshot?.projectId
        || dirtyRef.current
        || pendingLifelineBundleRef.current
        || savingRef.current
        || syncConflict
      ) return;
      try {
        const remoteAt = await fetchProjectCloudUpdatedAt(snapshot.projectId);
        if (!remoteAt || remoteAt === snapshot.cloudUpdatedAt) return;
        const data = await loadProjectById(snapshot.projectId);
        if (dirtyRef.current || pendingLifelineBundleRef.current) {
          setSyncConflict(true);
          setHasUnsavedChanges(true);
          setSyncError(
            'Το project ενημερώθηκε από άλλη συσκευή. Πάτα «Φόρτωση cloud» για συγχρονισμό.'
          );
          return;
        }
        applyRemoteProject(data, { keepUi: true });
      } catch {
        /* ignore focus refetch errors */
      }
    };

    window.addEventListener('focus', pullIfClean);

    return () => {
      unsub();
      window.removeEventListener('focus', pullIfClean);
    };
  }, [loading, state?.projectId, applyRemoteProject, syncConflict, applyCloudTimestamp]);

  const updateMapTheme = useCallback((updates) => {
    patchState((prev) => {
      let mapTheme = mergeMapTheme(prev.mapTheme, updates);
      let stages = prev.stages;
      let canvasInk = prev.canvasInk;
      if (prev.isLifeline) {
        const anchorDates = (lifelineAnchors || [])
          .map((p) => p.lifelineAnchorDate)
          .filter(Boolean);
        const oldSynced = syncLifelineMapTheme(prev.mapTheme, anchorDates);
        const oldDayHeight = clampLifelineDayHeight(
          oldSynced.lifeline?.dayHeight ?? DEFAULT_LIFELINE_CONFIG.dayHeight
        );
        mapTheme = syncLifelineMapTheme(mapTheme, anchorDates);
        const persistableThemeUnchanged = persistableValuesEqual(
          'map_theme',
          prev.mapTheme,
          mapTheme
        );
        if (persistableThemeUnchanged && canvasInk === prev.canvasInk) {
          return prev;
        }
        const newDayHeight = clampLifelineDayHeight(
          mapTheme.lifeline?.dayHeight ?? DEFAULT_LIFELINE_CONFIG.dayHeight
        );
        const dayHeightRatio = newDayHeight / oldDayHeight;
        if (dayHeightRatio !== 1 && canvasInk?.length) {
          const focus =
            toDateString(mapTheme.lifeline?.viewCenterDate)
            || toDateString(prev.mapTheme?.lifeline?.viewCenterDate)
            || toDateString(new Date());
          const oldLayout = getRoadmapLayout(oldSynced);
          const newLayout = getRoadmapLayout(mapTheme);
          const oldConfig = getLifelineConfig(oldSynced, anchorDates);
          const newConfig = getLifelineConfig(mapTheme, anchorDates);
          const anchorY =
            getDayTickCanvasY(focus, oldConfig, oldLayout, anchorDates)
            ?? getDayTickCanvasY(focus, newConfig, newLayout, anchorDates);
          if (typeof anchorY === 'number') {
            canvasInk = scaleInkStrokesForLifelineZoom(canvasInk, {
              centerX: newLayout.centerX ?? oldLayout.centerX ?? 480,
              anchorY,
              ratio: dayHeightRatio,
            });
          }
        }
        // Avoid re-render/save loops when sync produces the same viewport.
        // Must still persist lifeline-only fields (e.g. routineTemplates).
        const routineTemplatesChanged = !routineTemplatesEqual(
          prev.mapTheme?.lifeline?.routineTemplates,
          mapTheme.lifeline?.routineTemplates
        );
        if (
          !routineTemplatesChanged
          && mapTheme.lifeline?.dayHeight === prev.mapTheme?.lifeline?.dayHeight
          && mapTheme.lifeline?.viewCenterDate === prev.mapTheme?.lifeline?.viewCenterDate
          && mapTheme.lifeline?.startDate === prev.mapTheme?.lifeline?.startDate
          && mapTheme.lifeline?.futureDays === prev.mapTheme?.lifeline?.futureDays
          && mapTheme.roadmap?.height === prev.mapTheme?.roadmap?.height
          && mapTheme.roadmap?.top === prev.mapTheme?.roadmap?.top
          && mapTheme.roadmap?.baseY === prev.mapTheme?.roadmap?.baseY
          && mapTheme.roadmap?.spacing === prev.mapTheme?.roadmap?.spacing
          && mapTheme.roadmap?.centerX === prev.mapTheme?.roadmap?.centerX
          && canvasInk === prev.canvasInk
        ) {
          return prev;
        }
        stages = alignLifelinePlanStages(stages, mapTheme, anchorDates);
      }
      return { ...prev, mapTheme, stages, canvasInk };
    }, { debounce: true });
  }, [patchState, lifelineAnchors]);

  const applyProject = useCallback((data) => {
    const pendingHub = snapshotPendingHub();
    setSyncConflict(false);
    clearHistory();
    if (Array.isArray(data.projectList)) setProjectList(data.projectList);
    if (data.lifelineProjectId) setLifelineProjectId(data.lifelineProjectId);
    if (!data.isLifeline && data.projectId) {
      lastRegularProjectIdRef.current = data.projectId;
    } else if (data.isLifeline) {
      setLifelineFocusToken(Date.now());
    }
    const next = assembleProjectState(data, { resetSelection: data.selectedStageId == null });
    if (data.selectedStageId !== undefined) next.selectedStageId = data.selectedStageId || null;
    if (data.activeView) next.activeView = data.activeView === 'overview' ? 'roadmap' : data.activeView;
    rememberSyncedState(next);
    setState(next);
    hydrateLifelineHubFromState(next);
    if (pendingHub && next.isLifeline) {
      applyLifelineBundleLocally(pendingHub);
    }
    setHasUnsavedChanges(sessionHasUnsavedWork());
  }, [applyLifelineBundleLocally, clearHistory, hydrateLifelineHubFromState, rememberSyncedState, sessionHasUnsavedWork, snapshotPendingHub]);

  const switchProject = useCallback(async (projectId) => {
    if (!projectId || stateRef.current?.projectId === projectId) return;
    setSyncError(null);
    stashCurrentProject();
    if (restoreSessionProject(projectId, { selectedStageId: null })) return;
    setLoading(true);
    try {
      const data = await loadProjectById(projectId);
      setStoredProjectId(projectId);
      applyProject({
        ...data,
        projectList: projectListRef.current,
        selectedStageId: null,
        activeView: data.activeView === 'overview' ? 'roadmap' : data.activeView || 'roadmap',
      });
    } catch (err) {
      setSyncError(err.message || 'Failed to switch project');
    } finally {
      setLoading(false);
    }
  }, [applyProject, restoreSessionProject, stashCurrentProject]);

  const createNewProject = useCallback(async (title) => {
    setSyncError(null);
    try {
      await flushSaveNow();
      const data = await createProject(title);
      applyProject(data);
    } catch (err) {
      const message = err.message || 'Failed to create project';
      setSyncError(message);
      window.alert(message);
    }
  }, [applyProject, flushSaveNow]);

  const deleteCurrentProject = useCallback(async (projectId) => {
    setLoading(true);
    setSyncError(null);
    try {
      await flushSaveNow();
      const data = await deleteProject(projectId, stateRef.current?.projectId);
      sessionProjectsRef.current.delete(projectId);
      applyProject(data);
    } catch (err) {
      setSyncError(err.message || 'Failed to delete project');
    } finally {
      setLoading(false);
    }
  }, [applyProject, flushSaveNow]);

  const updateGoals = useCallback((updater, undoOptions) => {
    patchState((prev) => {
      const newGoals = typeof updater === 'function' ? updater(prev.goals || []) : updater;
      return { ...prev, goals: reindexGoals(newGoals) };
    }, undoOptions);
  }, [patchState]);

  const updateStages = useCallback((updater, undoOptions) => {
    patchState((prev) => {
      const newStages = typeof updater === 'function' ? updater(prev.stages) : updater;
      return { ...prev, stages: processStages(newStages) };
    }, undoOptions);
  }, [patchState]);

  const setProjectTitle = useCallback((title) => {
    patchState((prev) => ({ ...prev, projectTitle: title }));
    setProjectList((list) =>
      list.map((p) => (p.id === stateRef.current?.projectId ? { ...p, title } : p))
    );
  }, [patchState]);

  const setProjectBrief = useCallback((updater) => {
    patchState((prev) => {
      const nextBrief = typeof updater === 'function'
        ? updater(normalizeProjectBrief(prev.projectBrief))
        : updater;
      return { ...prev, projectBrief: normalizeProjectBrief(nextBrief) };
    });
  }, [patchState]);

  const setSelectedStageId = useCallback((id) => {
    setState((prev) => (prev ? { ...prev, selectedStageId: id } : prev));
  }, []);

  const setFocusMode = useCallback((focusMode) => {
    setState((prev) => (prev ? { ...prev, focusMode } : prev));
  }, []);

  const setActiveView = useCallback((activeView) => {
    setState((prev) => (prev ? { ...prev, activeView, selectedStageId: null } : prev));
  }, []);

  const openStage = useCallback((stageId) => {
    setState((prev) => (prev ? { ...prev, activeView: 'roadmap', selectedStageId: stageId } : prev));
  }, []);

  const loadTemplate = useCallback((stages) => {
    patchState((prev) => ({
      ...prev,
      stages: processStages(stages),
      selectedStageId: null,
    }));
  }, [patchState]);

  const addNote = useCallback((note) => {
    patchState((prev) => ({ ...prev, notes: [note, ...(prev.notes || [])] }));
  }, [patchState]);

  const updateNote = useCallback((noteId, updates) => {
    patchState((prev) => ({
      ...prev,
      notes: (prev.notes || []).map((n) => (n.id === noteId ? { ...n, ...updates } : n)),
    }));
  }, [patchState]);

  const deleteNote = useCallback((noteId) => {
    patchState((prev) => ({
      ...prev,
      notes: (prev.notes || []).filter((n) => n.id !== noteId),
    }));
  }, [patchState]);

  const updateStage = useCallback((stageId, updates, undoOptions) => {
    updateStages((stages) => {
      let next = stages.map((s) => (s.id === stageId ? { ...s, ...updates } : s));
      if (updates.status === 'Current') {
        next = next.map((s) =>
          s.id !== stageId && s.status === 'Current' ? { ...s, status: 'Locked' } : s
        );
      }
      return next;
    }, undoOptions);
  }, [updateStages]);

  const updateStagePlan = useCallback((stageId, updates, { shiftCheckpoints = false } = {}, undoOptions) => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      const lifelineCtx = prev.isLifeline
        ? buildLifelinePlanContext(
            getLifelineConfig(
              prev.mapTheme,
              (lifelineAnchors || []).map((p) => p.lifelineAnchorDate).filter(Boolean)
            ),
            layout
          )
        : null;

      const stages = prev.stages.map((s) => {
        if (s.id !== stageId) return s;

        if (updates.planMode === true && !s.planMode) {
          const dates = getDefaultPlanDates();
          const enabled = {
            ...s,
            planMode: true,
            planStartDate: updates.planStartDate || dates.planStartDate,
            planEndDate: updates.planEndDate || dates.planEndDate,
            planGoal: updates.planGoal ?? s.planGoal ?? s.description ?? '',
          };
          let next = { ...enabled, checkpoints: distributeCheckpointPlanDates(enabled) };
          if (lifelineCtx && isOnRoadmap(next)) {
            next = snapLifelinePlanMilestoneToEndDate(next, lifelineCtx, layout);
          }
          return next;
        }

        if (updates.planMode === false) {
          return { ...s, planMode: false };
        }

        let next = { ...s, ...updates };

        if (
          shiftCheckpoints &&
          updates.planStartDate &&
          updates.planStartDate !== s.planStartDate
        ) {
          const planUpdates = buildPlanStartUpdates(s, updates.planStartDate, true);
          next = { ...next, ...planUpdates };
        }

        if (updates.planEndDate && updates.planEndDate !== s.planEndDate && isPlanMode(next)) {
          const duration = daysBetween(next.planStartDate, next.planEndDate);
          if (duration >= 1 && next.checkpoints?.length) {
            const stripped = next.checkpoints.map((cp) => ({ ...cp, planDate: null }));
            next = { ...next, checkpoints: distributeCheckpointPlanDates({ ...next, checkpoints: stripped }) };
          }
        }

        if (lifelineCtx && isPlanMode(next) && isOnRoadmap(next)) {
          next = snapLifelinePlanMilestoneToEndDate(next, lifelineCtx, layout);
        }

        return next;
      });

      return { ...prev, stages };
    }, undoOptions);
  }, [patchState, lifelineAnchors]);

  const moveStagePosition = useCallback((stageId, posX, posY, { commit = false } = {}) => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      const lifelineCtx = prev.isLifeline
        ? buildLifelinePlanContext(
            getLifelineConfig(
              prev.mapTheme,
              (lifelineAnchors || []).map((p) => p.lifelineAnchorDate).filter(Boolean)
            ),
            layout
          )
        : null;
      return {
        ...prev,
        stages: prev.stages.map((s) => {
          if (s.id !== stageId) return s;
          return resolveMilestoneDrag(
            s,
            posX,
            typeof posY === 'number' ? posY : s.posY ?? ORIGIN_Y,
            layout,
            lifelineCtx,
            { commitPlanDates: commit }
          );
        }),
      };
    }, commit ? undefined : { debounce: true });
  }, [patchState, lifelineAnchors]);

  const moveStageTimelineY = useCallback((stageId, timelineY) => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      const lifelineCtx = prev.isLifeline
        ? buildLifelinePlanContext(
            getLifelineConfig(
              prev.mapTheme,
              (lifelineAnchors || []).map((p) => p.lifelineAnchorDate).filter(Boolean)
            ),
            layout
          )
        : null;
      return {
        ...prev,
        stages: prev.stages.map((s) => {
          if (s.id !== stageId) return s;
          if (lifelineCtx && isPlanMode(s) && isOnRoadmap(s)) {
            return syncLifelinePlanMilestoneFromTimelineY(s, timelineY, lifelineCtx, layout);
          }
          return positionMilestoneOnTimeline(s, timelineY, layout, s.roadmapSide || 'right');
        }),
      };
    }, { debounce: true });
  }, [patchState, lifelineAnchors]);

  const moveItemTimelineY = useCallback((node, timelineY) => {
    if (!node) return;
    if (node.kind === 'milestone') {
      moveStageTimelineY(node.refId, timelineY);
      return;
    }
    if (node.kind === 'planStart') {
      patchState((prev) => ({
        ...prev,
        stages: prev.stages.map((s) => {
          if (s.id !== node.refId || !isPlanMode(s)) return s;
          const layout = getRoadmapLayout(prev.mapTheme);
          const lifelineCtx = prev.isLifeline
            ? buildLifelinePlanContext(getLifelineConfig(prev.mapTheme), layout)
            : null;
          if (lifelineCtx) {
            const newStartDate = timelineYToDate(
              timelineY,
              lifelineCtx.config,
              lifelineCtx.lineMetrics,
              lifelineCtx.layout
            );
            if (!newStartDate || newStartDate === s.planStartDate) return s;
            if (daysBetween(newStartDate, s.planEndDate) < 1) return s;
            const dayDelta = daysBetween(s.planStartDate, newStartDate);
            return {
              ...s,
              planStartDate: newStartDate,
              checkpoints: shiftCheckpointPlanDates(s.checkpoints || [], dayDelta),
            };
          }
          const endY = getPlanEndY(s);
          const spacing = resolvePlanDayHeight(null);
          const newDuration = Math.max(1, Math.round((timelineY - endY) / spacing));
          const newStartDate = addDays(s.planEndDate, -newDuration);
          if (newStartDate === s.planStartDate) return s;
          const dayDelta = daysBetween(s.planStartDate, newStartDate);
          return {
            ...s,
            planStartDate: newStartDate,
            checkpoints: shiftCheckpointPlanDates(s.checkpoints || [], dayDelta),
          };
        }),
      }), { debounce: true });
      return;
    }
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      if (node.kind === 'idea') {
        const apply = (idea) => {
          if (idea.id !== node.refId) return idea;
          const next = resolveCanvasItemDrag(
            { ...idea, onRoadmap: true },
            idea.canvasX ?? 0,
            timelineY - 60,
            layout,
            { w: 240, h: 120 }
          );
          return {
            ...idea,
            onRoadmap: true,
            canvasX: next.x,
            canvasY: next.y,
            timelineY: next.timelineY,
            roadmapSide: next.roadmapSide || idea.roadmapSide || 'right',
          };
        };
        // node.id format idea:backlog:id or idea:stage:id — source in id
        const isBacklog = String(node.id).includes(':backlog:');
        if (isBacklog) {
          return { ...prev, backlog: (prev.backlog || []).map(apply) };
        }
        return {
          ...prev,
          stages: prev.stages.map((stage) => ({
            ...stage,
            ideas: (stage.ideas || []).map(apply),
          })),
        };
      }
      if (node.kind === 'sticky') {
        return {
          ...prev,
          canvasStickies: (prev.canvasStickies || []).map((sticky) => {
            if (sticky.id !== node.refId) return sticky;
            const w = sticky.width || 200;
            const h = sticky.height || 140;
            const next = resolveCanvasItemDrag(
              { ...sticky, onRoadmap: true },
              sticky.canvasX ?? 0,
              timelineY - h / 2,
              layout,
              { w, h }
            );
            return {
              ...sticky,
              onRoadmap: true,
              canvasX: next.x,
              canvasY: next.y,
              timelineY: next.timelineY,
              roadmapSide: next.roadmapSide || sticky.roadmapSide || 'right',
            };
          }),
        };
      }
      if (node.kind === 'obstacle') {
        return {
          ...prev,
          canvasObstacles: (prev.canvasObstacles || []).map((item) => {
            if (item.id !== node.refId) return item;
            const next = resolveCanvasItemDrag(
              { ...item, onRoadmap: true },
              item.canvasX ?? 0,
              timelineY - 60,
              layout,
              { w: 240, h: 120 }
            );
            return {
              ...item,
              onRoadmap: true,
              canvasX: next.x,
              canvasY: next.y,
              timelineY: next.timelineY,
              roadmapSide: next.roadmapSide || item.roadmapSide || 'right',
            };
          }),
        };
      }
      if (node.kind === 'resource') {
        return {
          ...prev,
          canvasResources: (prev.canvasResources || []).map((item) => {
            if (item.id !== node.refId) return item;
            const next = resolveCanvasItemDrag(
              { ...item, onRoadmap: true },
              item.canvasX ?? 0,
              timelineY - 60,
              layout,
              { w: 240, h: 120 }
            );
            return {
              ...item,
              onRoadmap: true,
              canvasX: next.x,
              canvasY: next.y,
              timelineY: next.timelineY,
              roadmapSide: next.roadmapSide || item.roadmapSide || 'right',
            };
          }),
        };
      }
      if (node.kind === 'task') {
        return {
          ...prev,
          canvasTasks: (prev.canvasTasks || []).map((item) => {
            if (item.id !== node.refId) return item;
            const next = resolveCanvasItemDrag(
              { ...item, onRoadmap: true },
              item.canvasX ?? 0,
              timelineY - 60,
              layout,
              { w: 240, h: 120 }
            );
            return {
              ...item,
              onRoadmap: true,
              canvasX: next.x,
              canvasY: next.y,
              timelineY: next.timelineY,
              roadmapSide: next.roadmapSide || item.roadmapSide || 'right',
            };
          }),
        };
      }
      return prev;
    }, { debounce: true });
  }, [patchState, moveStageTimelineY]);

  const attachStageToRoadmap = useCallback((stageId, timelineY) => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      const lifelineCtx = prev.isLifeline
        ? buildLifelinePlanContext(
            getLifelineConfig(
              prev.mapTheme,
              (lifelineAnchors || []).map((p) => p.lifelineAnchorDate).filter(Boolean)
            ),
            layout
          )
        : null;
      return {
        ...prev,
        stages: prev.stages.map((s) => {
          if (s.id !== stageId) return s;
          const y = typeof timelineY === 'number' ? timelineY : (s.posY ?? ORIGIN_Y) + 100;
          let next = positionMilestoneOnTimeline(s, y, layout);
          if (lifelineCtx && isPlanMode(next)) {
            next = snapLifelinePlanMilestoneToEndDate(next, lifelineCtx, layout);
          }
          return next;
        }),
      };
    });
  }, [patchState, lifelineAnchors]);

  const detachStageFromRoadmap = useCallback((stageId) => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      const centerX = layout.centerX ?? 480;
      return {
        ...prev,
        stages: prev.stages.map((s) => {
          if (s.id !== stageId) return s;
          return {
            ...s,
            onRoadmap: false,
            timelineY: null,
            posX: (s.posX ?? centerX) + 180,
            posY: s.posY ?? ORIGIN_Y,
            roadmapSide: null,
          };
        }),
      };
    });
  }, [patchState]);

  const clearStageFromCanvas = useCallback((stageId) => {
    updateStage(stageId, { posX: null, posY: null });
  }, [updateStage]);

  const addStage = useCallback((options = {}) => {
    const title = typeof options.title === 'string' ? options.title.trim() : '';
    const description = typeof options.description === 'string' ? options.description.trim() : '';
    const category = typeof options.category === 'string' ? options.category.trim() : '';
    const hasCanvasPos =
      typeof options.posX === 'number' && typeof options.posY === 'number';
    let created = null;

    patchState((prev) => {
      const sorted = [...prev.stages].sort((a, b) => a.order - b.order);
      const maxOrder = sorted.length ? Math.max(...sorted.map((s) => s.order)) : 0;
      const stage = {
        ...createEmptyStage(maxOrder + 1, sorted.length === 0),
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(category ? { category } : {}),
        ...(options.canvasStyle ? { canvasStyle: options.canvasStyle } : {}),
      };

      if (hasCanvasPos) {
        created = {
          ...stage,
          posX: options.posX,
          posY: options.posY,
          onRoadmap: options.onRoadmap === true,
          timelineY: options.onRoadmap === true ? options.timelineY ?? null : null,
          roadmapSide: options.onRoadmap === true ? options.roadmapSide ?? null : null,
        };
        return { ...prev, stages: [...sorted, created] };
      }

      created = { ...stage, posX: null, posY: null };
      return {
        ...prev,
        stages: relayoutStages([...sorted, created], prev.mapTheme),
      };
    });

    return created;
  }, [patchState]);

  const addGoal = useCallback((overrides = {}) => {
    updateGoals((goals) => {
      const sorted = [...goals].sort((a, b) => a.order - b.order);
      const maxOrder = sorted.length ? Math.max(...sorted.map((g) => g.order)) : 0;
      const goal = createEmptyGoal(maxOrder + 1, sorted.length === 0);
      if (overrides.title) goal.title = overrides.title.trim();
      return [...sorted, goal];
    });
  }, [updateGoals]);

  const updateGoal = useCallback((goalId, updates) => {
    updateGoals((goals) => {
      let next = goals.map((g) => (g.id === goalId ? { ...g, ...updates } : g));
      if (updates.status === 'Current') {
        next = next.map((g) =>
          g.id !== goalId && g.status === 'Current' ? { ...g, status: 'Locked' } : g
        );
      }
      return next;
    });
  }, [updateGoals]);

  const moveGoal = useCallback((goalId, direction) => {
    updateGoals((goals) => {
      const sorted = [...goals].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((g) => g.id === goalId);
      if (idx < 0) return goals;
      const swapIdx = direction === 'up' ? idx + 1 : idx - 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return goals;
      const next = [...sorted];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return reindexGoals(next);
    });
  }, [updateGoals]);

  const removeGoal = useCallback((goalId) => {
    updateGoals((goals) => {
      const removed = goals.find((g) => g.id === goalId);
      let next = goals.filter((g) => g.id !== goalId);
      next = reindexGoals(next);
      if (removed?.status === 'Current' && next.length > 0) {
        const firstLocked = next.find((g) => g.status === 'Locked');
        if (firstLocked) {
          next = next.map((g) =>
            g.id === firstLocked.id ? { ...g, status: 'Current' } : g
          );
        } else {
          next = next.map((g, i) => (i === 0 ? { ...g, status: 'Current' } : g));
        }
      }
      return next;
    });
  }, [updateGoals]);

  const reorderStage = useCallback((stageId, targetStageId) => {
    patchState((prev) => {
      const sorted = [...prev.stages].sort((a, b) => b.order - a.order);
      const fromIdx = sorted.findIndex((s) => s.id === stageId);
      const toIdx = sorted.findIndex((s) => s.id === targetStageId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;

      const next = [...sorted];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      const reindexed = next.map((s, i) => ({ ...s, order: next.length - i }));
      return { ...prev, stages: relayoutStages(reindexed, prev.mapTheme) };
    });
  }, [patchState]);

  const moveStage = useCallback((stageId, direction) => {
    patchState((prev) => {
      const sorted = [...prev.stages].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((s) => s.id === stageId);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx + 1 : idx - 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const next = [...sorted];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return { ...prev, stages: relayoutStages(reindexStages(next), prev.mapTheme) };
    });
  }, [patchState]);

  const removeStage = useCallback((stageId) => {
    patchState((prev) => {
      if (prev.stages.length === 0) return prev;
      const removed = prev.stages.find((s) => s.id === stageId);
      let next = prev.stages.filter((s) => s.id !== stageId);
      next = reindexStages(next);
      if (removed?.status === 'Current') {
        const firstLocked = next.find((s) => s.status === 'Locked');
        if (firstLocked) {
          next = next.map((s) =>
            s.id === firstLocked.id ? { ...s, status: 'Current' } : s
          );
        } else if (next.length > 0) {
          next = next.map((s, i) => (i === 0 ? { ...s, status: 'Current' } : s));
        }
      }
      return { ...prev, stages: relayoutStages(next, prev.mapTheme) };
    });
    setSelectedStageId(null);
  }, [patchState, setSelectedStageId]);

  const addCheckpoint = useCallback((stageId, checkpoint) => {
    updateStages((stages) =>
      stages.map((s) => {
        if (s.id !== stageId) return s;
        const next = { ...s, checkpoints: [...(s.checkpoints || []), checkpoint] };
        if (isPlanMode(s)) {
          return { ...next, checkpoints: distributeCheckpointPlanDates(next) };
        }
        return next;
      })
    );
  }, [updateStages]);

  const updateCheckpoint = useCallback((stageId, checkpointId, updates) => {
    updateStages((stages) =>
      stages.map((s) =>
        s.id === stageId
          ? {
              ...s,
              checkpoints: (s.checkpoints || []).map((cp) =>
                cp.id === checkpointId ? { ...cp, ...updates } : cp
              ),
            }
          : s
      )
    );
  }, [updateStages]);

  const removeCheckpoint = useCallback((stageId, checkpointId) => {
    patchState((prev) => stripCheckpointFromState(prev, stageId, checkpointId));
  }, [patchState]);

  const reorderCheckpoint = useCallback((stageId, checkpointId, dropTimelineY) => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      const lifelineCtx = prev.isLifeline
        ? buildLifelinePlanContext(getLifelineConfig(prev.mapTheme), layout)
        : null;
      return {
        ...prev,
        stages: prev.stages.map((s) => {
          if (s.id !== stageId) return s;
          return {
            ...s,
            checkpoints: reorderCheckpointsByTimelineY(
              s,
              checkpointId,
              dropTimelineY,
              layout,
              lifelineCtx
            ),
          };
        }),
      };
    }, { debounce: true });
  }, [patchState]);

  const addIdea = useCallback((stageId, idea) => {
    updateStages((stages) =>
      stages.map((s) =>
        s.id === stageId ? { ...s, ideas: [...(s.ideas || []), idea] } : s
      )
    );
  }, [updateStages]);

  const updateIdea = useCallback((stageId, ideaId, updates, undoOptions) => {
    updateStages((stages) =>
      stages.map((s) =>
        s.id === stageId
          ? {
              ...s,
              ideas: (s.ideas || []).map((idea) =>
                idea.id === ideaId ? { ...idea, ...updates } : idea
              ),
            }
          : s
      )
    , undoOptions);
  }, [updateStages]);

  const removeIdea = useCallback((stageId, ideaId) => {
    patchState((prev) => {
      const stages = prev.stages.map((s) =>
        s.id === stageId
          ? { ...s, ideas: (s.ideas || []).filter((idea) => idea.id !== ideaId) }
          : s
      );
      return {
        ...prev,
        stages: processStages(stages),
        canvasConnections: (prev.canvasConnections || []).filter(
          (c) =>
            !(
              (c.from.type === 'idea' &&
                c.from.id === ideaId &&
                (c.from.stageId || '') === (stageId || '')) ||
              (c.to.type === 'idea' &&
                c.to.id === ideaId &&
                (c.to.stageId || '') === (stageId || ''))
            )
        ),
      };
    });
  }, [patchState]);

  const moveIdeaPosition = useCallback((stageId, ideaId, canvasX, canvasY) => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      return {
        ...prev,
        stages: prev.stages.map((stage) => {
          if (stage.id !== stageId) return stage;
          return {
            ...stage,
            ideas: (stage.ideas || []).map((idea) => {
              if (idea.id !== ideaId) return idea;
              const next = resolveCanvasItemDrag(idea, canvasX, canvasY, layout, { w: 240, h: 120 });
              return {
                ...idea,
                canvasX: next.x,
                canvasY: next.y,
                onRoadmap: next.onRoadmap,
                timelineY: next.timelineY,
                roadmapSide: next.roadmapSide,
              };
            }),
          };
        }),
      };
    }, { debounce: true });
  }, [patchState]);

  const moveBacklogIdeaPosition = useCallback((ideaId, canvasX, canvasY) => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      return {
        ...prev,
        backlog: (prev.backlog || []).map((idea) => {
          if (idea.id !== ideaId) return idea;
          const next = resolveCanvasItemDrag(idea, canvasX, canvasY, layout, { w: 240, h: 120 });
          return {
            ...idea,
            canvasX: next.x,
            canvasY: next.y,
            onRoadmap: next.onRoadmap,
            timelineY: next.timelineY,
            roadmapSide: next.roadmapSide,
          };
        }),
      };
    }, { debounce: true });
  }, [patchState]);

  const moveCanvasSticky = useCallback((stickyId, canvasX, canvasY) => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      return {
        ...prev,
        canvasStickies: (prev.canvasStickies || []).map((sticky) => {
          if (sticky.id !== stickyId) return sticky;
          const w = sticky.width || 200;
          const h = sticky.height || 140;
          const next = resolveCanvasItemDrag(sticky, canvasX, canvasY, layout, { w, h });
          return {
            ...sticky,
            canvasX: next.x,
            canvasY: next.y,
            onRoadmap: next.onRoadmap,
            timelineY: next.timelineY,
            roadmapSide: next.roadmapSide,
          };
        }),
      };
    }, { debounce: true });
  }, [patchState]);

  const applyRoadmapSpineMove = useCallback((spine) => {
    if (!spine) return;
    patchState((prev) => {
      const oldLayout = getRoadmapLayout(prev.mapTheme);
      const height = Math.max(240, spine.height ?? oldLayout.height);
      const top = typeof spine.top === 'number' ? spine.top : oldLayout.top;
      const centerX = typeof spine.centerX === 'number' ? spine.centerX : oldLayout.centerX;
      const newLayout = {
        ...oldLayout,
        centerX,
        top,
        height,
        baseY: top + height - 80,
      };

      const shifted = shiftRoadmapAttachedItems(prev, oldLayout, newLayout);

      return {
        ...prev,
        ...shifted,
        mapTheme: mergeMapTheme(prev.mapTheme, {
          roadmap: {
            centerX: newLayout.centerX,
            top: newLayout.top,
            height: newLayout.height,
            baseY: newLayout.baseY,
          },
        }),
      };
    }, { debounce: true });
  }, [patchState]);

  const shiftRoadmapSpine = applyRoadmapSpineMove;

  const resizeRoadmapSpine = useCallback((top, height) => {
    patchState((prev) => {
      const h = Math.max(240, height);
      return {
        ...prev,
        mapTheme: mergeMapTheme(prev.mapTheme, {
          roadmap: {
            top,
            height: h,
            baseY: top + h - 80,
          },
        }),
      };
    }, { debounce: true });
  }, [patchState]);

  const moveRoadmapSpinePreview = applyRoadmapSpineMove;

  const addBacklogIdea = useCallback((ideaData = {}) => {
    const idea = createEmptyIdea({
      title: ideaData.title?.trim() || 'New idea',
      description: ideaData.description?.trim() || '',
      impact: ideaData.impact || 'Medium',
      effort: ideaData.effort || 'Medium',
      timing: ideaData.timing || 'Too Early',
      ...ideaData,
    });
    patchState((prev) => ({ ...prev, backlog: [...(prev.backlog || []), idea] }));
    return idea;
  }, [patchState]);

  const updateBacklogIdea = useCallback((ideaId, updates, undoOptions) => {
    patchState(
      (prev) => ({
        ...prev,
        backlog: (prev.backlog || []).map((idea) =>
          idea.id === ideaId ? { ...idea, ...updates } : idea
        ),
      }),
      undoOptions
    );
  }, [patchState]);

  const removeBacklogIdea = useCallback((ideaId) => {
    patchState((prev) => ({
      ...prev,
      backlog: (prev.backlog || []).filter((i) => i.id !== ideaId),
    }));
  }, [patchState]);

  const clearIdeaFromCanvas = useCallback((source, stageId, ideaId) => {
    if (source === 'backlog') {
      updateBacklogIdea(ideaId, {
        canvasX: null,
        canvasY: null,
        linkedStageId: null,
        onRoadmap: false,
        timelineY: null,
        roadmapSide: null,
      });
      return;
    }
    updateIdea(stageId, ideaId, {
      canvasX: null,
      canvasY: null,
      linkedStageId: null,
      onRoadmap: false,
      timelineY: null,
      roadmapSide: null,
    });
  }, [updateBacklogIdea, updateIdea]);

  const addCanvasConnection = useCallback((from, to) => {
    if (sameNodeRef(from, to)) return;
    patchState((prev) => {
      const exists = (prev.canvasConnections || []).some(
        (c) => sameNodeRef(c.from, from) && sameNodeRef(c.to, to)
      );
      if (exists) return prev;
      const pair = getStickyMilestonePair(from, to);
      let canvasStickies = prev.canvasStickies || [];
      if (pair) {
        canvasStickies = canvasStickies.map((s) =>
          s.id === pair.stickyId ? { ...s, relatedStageId: pair.stageId } : s
        );
      }
      let next = {
        ...prev,
        canvasStickies,
        canvasConnections: [
          ...(prev.canvasConnections || []),
          { id: `conn-${generateId()}`, from, to },
        ],
      };
      const cpPair = getEntityCheckpointPair(from, to);
      if (cpPair) {
        next = applyCheckpointLinkToState(next, cpPair.other, cpPair.checkpointId, 'add');
      }
      return next;
    });
  }, [patchState]);

  const removeCanvasConnection = useCallback((connectionId) => {
    patchState((prev) => {
      const connections = prev.canvasConnections || [];
      const removed = connections.find((c) => c.id === connectionId);
      const nextConnections = connections.filter((c) => c.id !== connectionId);
      let canvasStickies = prev.canvasStickies || [];
      const pair = removed ? getStickyMilestonePair(removed.from, removed.to) : null;
      if (pair) {
        const stillLinked = stickyLinkedToStage(
          { id: pair.stickyId, relatedStageId: null },
          pair.stageId,
          nextConnections
        );
        if (!stillLinked) {
          canvasStickies = canvasStickies.map((s) =>
            s.id === pair.stickyId && s.relatedStageId === pair.stageId
              ? { ...s, relatedStageId: null }
              : s
          );
        }
      }
      let next = {
        ...prev,
        canvasStickies,
        canvasConnections: nextConnections,
      };
      const cpPair = removed ? getEntityCheckpointPair(removed.from, removed.to) : null;
      if (cpPair) {
        const stillLinked = nextConnections.some((c) =>
          connectionLinksEntityToCheckpoint(c, cpPair.other, cpPair.checkpointId)
        );
        if (!stillLinked) {
          next = applyCheckpointLinkToState(next, cpPair.other, cpPair.checkpointId, 'remove');
        }
      }
      return next;
    });
  }, [patchState]);

  const addCanvasSticky = useCallback((data = {}) => {
    const sticky = createEmptySticky({
      text: data.text != null ? data.text : 'New note…',
      ...data,
    });
    patchState((prev) => ({
      ...prev,
      canvasStickies: [...(prev.canvasStickies || []), sticky],
    }));
    return sticky;
  }, [patchState]);

  const updateCanvasSticky = useCallback((stickyId, updates, undoOptions) => {
    patchState((prev) => {
      const canvasStickies = (prev.canvasStickies || []).map((s) =>
        s.id === stickyId ? { ...s, ...updates } : s
      );
      if (!Object.prototype.hasOwnProperty.call(updates, 'relatedStageId')) {
        return { ...prev, canvasStickies };
      }

      const stageId = updates.relatedStageId || null;
      const withoutStickyMilestone = (prev.canvasConnections || []).filter((c) => {
        const pair = getStickyMilestonePair(c.from, c.to);
        return !(pair && pair.stickyId === stickyId);
      });
      const canvasConnections = stageId
        ? [
            ...withoutStickyMilestone,
            {
              id: `conn-${generateId()}`,
              from: { type: 'milestone', id: stageId },
              to: { type: 'sticky', id: stickyId },
            },
          ]
        : withoutStickyMilestone;

      return { ...prev, canvasStickies, canvasConnections };
    }, undoOptions);
  }, [patchState]);

  const removeCanvasSticky = useCallback((stickyId) => {
    patchState((prev) => ({
      ...prev,
      canvasStickies: (prev.canvasStickies || []).filter((s) => s.id !== stickyId),
      canvasConnections: (prev.canvasConnections || []).filter(
        (c) =>
          !(c.from.type === 'sticky' && c.from.id === stickyId) &&
          !(c.to.type === 'sticky' && c.to.id === stickyId)
      ),
    }));
  }, [patchState]);

  const clearStickyFromCanvas = useCallback((stickyId) => {
    updateCanvasSticky(stickyId, { canvasX: null, canvasY: null });
  }, [updateCanvasSticky]);

  const addCanvasObstacle = useCallback((data = {}) => {
    const obstacle = createEmptyCanvasObstacle({
      title: data.title?.trim() || 'New obstacle',
      description: data.description?.trim() || '',
      severity: data.severity || 'Medium',
      ...data,
    });
    patchState((prev) => ({
      ...prev,
      canvasObstacles: [...(prev.canvasObstacles || []), obstacle],
    }));
    return obstacle;
  }, [patchState]);

  const updateCanvasObstacle = useCallback((obstacleId, updates, undoOptions) => {
    patchState(
      (prev) => ({
        ...prev,
        canvasObstacles: (prev.canvasObstacles || []).map((item) =>
          item.id === obstacleId ? { ...item, ...updates } : item
        ),
      }),
      undoOptions
    );
  }, [patchState]);

  const moveCanvasObstacle = useCallback((obstacleId, canvasX, canvasY) => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      return {
        ...prev,
        canvasObstacles: (prev.canvasObstacles || []).map((item) => {
          if (item.id !== obstacleId) return item;
          const next = resolveCanvasItemDrag(item, canvasX, canvasY, layout, { w: 240, h: 120 });
          return {
            ...item,
            canvasX: next.x,
            canvasY: next.y,
            onRoadmap: next.onRoadmap,
            timelineY: next.timelineY,
            roadmapSide: next.roadmapSide,
          };
        }),
      };
    }, { debounce: true });
  }, [patchState]);

  const removeCanvasObstacle = useCallback((obstacleId) => {
    patchState((prev) => ({
      ...prev,
      canvasObstacles: (prev.canvasObstacles || []).filter((item) => item.id !== obstacleId),
      canvasConnections: (prev.canvasConnections || []).filter(
        (c) =>
          !(c.from.type === 'obstacle' && c.from.id === obstacleId) &&
          !(c.to.type === 'obstacle' && c.to.id === obstacleId)
      ),
    }));
  }, [patchState]);

  const clearCanvasObstacleFromCanvas = useCallback((obstacleId) => {
    updateCanvasObstacle(obstacleId, {
      canvasX: null,
      canvasY: null,
      onRoadmap: false,
      timelineY: null,
      roadmapSide: null,
    });
  }, [updateCanvasObstacle]);

  const addCanvasResource = useCallback((data = {}) => {
    const resource = createEmptyCanvasResource({
      title: data.title?.trim() || 'New resource',
      description: data.description?.trim() || '',
      resourceType: data.resourceType || 'People',
      ...data,
    });
    patchState((prev) => ({
      ...prev,
      canvasResources: [...(prev.canvasResources || []), resource],
    }));
    return resource;
  }, [patchState]);

  const updateCanvasResource = useCallback((resourceId, updates, undoOptions) => {
    patchState(
      (prev) => ({
        ...prev,
        canvasResources: (prev.canvasResources || []).map((item) =>
          item.id === resourceId ? { ...item, ...updates } : item
        ),
      }),
      undoOptions
    );
  }, [patchState]);

  const moveCanvasResource = useCallback((resourceId, canvasX, canvasY) => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      return {
        ...prev,
        canvasResources: (prev.canvasResources || []).map((item) => {
          if (item.id !== resourceId) return item;
          const next = resolveCanvasItemDrag(item, canvasX, canvasY, layout, { w: 240, h: 120 });
          return {
            ...item,
            canvasX: next.x,
            canvasY: next.y,
            onRoadmap: next.onRoadmap,
            timelineY: next.timelineY,
            roadmapSide: next.roadmapSide,
          };
        }),
      };
    }, { debounce: true });
  }, [patchState]);

  const removeCanvasResource = useCallback((resourceId) => {
    patchState((prev) => ({
      ...prev,
      canvasResources: (prev.canvasResources || []).filter((item) => item.id !== resourceId),
      canvasConnections: (prev.canvasConnections || []).filter(
        (c) =>
          !(c.from.type === 'resource' && c.from.id === resourceId) &&
          !(c.to.type === 'resource' && c.to.id === resourceId)
      ),
    }));
  }, [patchState]);

  const clearCanvasResourceFromCanvas = useCallback((resourceId) => {
    updateCanvasResource(resourceId, {
      canvasX: null,
      canvasY: null,
      onRoadmap: false,
      timelineY: null,
      roadmapSide: null,
    });
  }, [updateCanvasResource]);

  const addCanvasTask = useCallback((data = {}) => {
    const task = createEmptyCanvasTask({
      title: data.title?.trim() || 'New task',
      description: data.description?.trim() || '',
      category: data.category || '',
      status: data.status || 'Todo',
      ...data,
    });
    patchState((prev) => ({
      ...prev,
      canvasTasks: [...(prev.canvasTasks || []), task],
    }));
    return task;
  }, [patchState]);

  const updateCanvasTask = useCallback((taskId, updates, undoOptions) => {
    patchState(
      (prev) => ({
        ...prev,
        canvasTasks: (prev.canvasTasks || []).map((item) =>
          item.id === taskId ? { ...item, ...updates } : item
        ),
      }),
      undoOptions
    );
  }, [patchState]);

  const moveCanvasTask = useCallback((taskId, canvasX, canvasY) => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      return {
        ...prev,
        canvasTasks: (prev.canvasTasks || []).map((item) => {
          if (item.id !== taskId) return item;
          const next = resolveCanvasItemDrag(item, canvasX, canvasY, layout, { w: 240, h: 120 });
          return {
            ...item,
            canvasX: next.x,
            canvasY: next.y,
            onRoadmap: next.onRoadmap,
            timelineY: next.timelineY,
            roadmapSide: next.roadmapSide,
          };
        }),
      };
    }, { debounce: true });
  }, [patchState]);

  const removeCanvasTask = useCallback((taskId) => {
    patchState((prev) => ({
      ...prev,
      canvasTasks: (prev.canvasTasks || []).filter((item) => item.id !== taskId),
      canvasConnections: (prev.canvasConnections || []).filter(
        (c) =>
          !(c.from.type === 'task' && c.from.id === taskId) &&
          !(c.to.type === 'task' && c.to.id === taskId)
      ),
    }));
  }, [patchState]);

  const clearCanvasTaskFromCanvas = useCallback((taskId) => {
    updateCanvasTask(taskId, {
      canvasX: null,
      canvasY: null,
      onRoadmap: false,
      timelineY: null,
      roadmapSide: null,
    });
  }, [updateCanvasTask]);

  const addCanvasInkStroke = useCallback((stroke) => {
    if (!stroke?.id || !Array.isArray(stroke.points) || stroke.points.length === 0) return;
    patchState((prev) => ({
      ...prev,
      canvasInk: [...(prev.canvasInk || []), stroke],
    }), { debounce: true });
  }, [patchState]);

  const removeCanvasInkStrokes = useCallback((ids) => {
    if (!ids?.length) return;
    const idSet = new Set(ids);
    patchState(
      (prev) => ({
        ...prev,
        canvasInk: (prev.canvasInk || []).filter((s) => !idSet.has(s.id)),
      }),
      { debounce: true }
    );
  }, [patchState]);

  const moveCanvasInkStrokes = useCallback((ids, dx, dy) => {
    if (!ids?.length || (!dx && !dy)) return;
    const idSet = new Set(ids);
    patchState(
      (prev) => ({
        ...prev,
        canvasInk: (prev.canvasInk || []).map((stroke) => {
          if (!idSet.has(stroke.id)) return stroke;
          return {
            ...stroke,
            points: (stroke.points || []).map((p) => {
              if (!p || p.length < 2) return p;
              return p.length >= 3 ? [p[0] + dx, p[1] + dy, p[2]] : [p[0] + dx, p[1] + dy];
            }),
          };
        }),
      }),
      { debounce: true }
    );
  }, [patchState]);

  const clearCanvasInk = useCallback(() => {
    patchState((prev) => ({ ...prev, canvasInk: [] }));
  }, [patchState]);

  const addWhiteboardStroke = useCallback((stroke) => {
    if (!stroke?.id || !Array.isArray(stroke.points) || stroke.points.length === 0) return;
    patchState((prev) => ({
      ...prev,
      whiteboardStrokes: [...(prev.whiteboardStrokes || []), stroke],
    }));
  }, [patchState]);

  const removeWhiteboardStrokes = useCallback((ids) => {
    if (!ids?.length) return;
    const idSet = new Set(ids);
    patchState(
      (prev) => ({
        ...prev,
        whiteboardStrokes: (prev.whiteboardStrokes || []).filter((s) => !idSet.has(s.id)),
      }),
      { debounce: true }
    );
  }, [patchState]);

  const moveWhiteboardStrokes = useCallback((ids, dx, dy) => {
    if (!ids?.length || (!dx && !dy)) return;
    const idSet = new Set(ids);
    patchState(
      (prev) => ({
        ...prev,
        whiteboardStrokes: (prev.whiteboardStrokes || []).map((stroke) => {
          if (!idSet.has(stroke.id)) return stroke;
          return {
            ...stroke,
            points: (stroke.points || []).map((p) => {
              if (!p || p.length < 2) return p;
              return p.length >= 3 ? [p[0] + dx, p[1] + dy, p[2]] : [p[0] + dx, p[1] + dy];
            }),
          };
        }),
      }),
      { debounce: true }
    );
  }, [patchState]);

  const clearWhiteboardStrokes = useCallback(() => {
    patchState((prev) => ({ ...prev, whiteboardStrokes: [] }));
  }, [patchState]);

  const updateNodeCanvasStyle = useCallback((nodeRef, styleUpdates) => {
    const mergeStyle = (entity) => {
      if (styleUpdates?.resetStyle) {
        return { ...entity, canvasStyle: { ...DEFAULT_CANVAS_STYLE } };
      }
      const { resetStyle, ...updates } = styleUpdates || {};
      return {
        ...entity,
        canvasStyle: { ...(entity.canvasStyle || {}), ...updates },
      };
    };

    patchState((prev) => {
      if (nodeRef.type === 'milestone') {
        return {
          ...prev,
          stages: prev.stages.map((s) => (s.id === nodeRef.id ? mergeStyle(s) : s)),
        };
      }

      if (nodeRef.type === 'idea') {
        if (nodeRef.source === 'backlog') {
          return {
            ...prev,
            backlog: (prev.backlog || []).map((i) =>
              i.id === nodeRef.id ? mergeStyle(i) : i
            ),
          };
        }
        return {
          ...prev,
          stages: prev.stages.map((s) =>
            s.id === nodeRef.stageId
              ? {
                  ...s,
                  ideas: (s.ideas || []).map((i) =>
                    i.id === nodeRef.id ? mergeStyle(i) : i
                  ),
                }
              : s
          ),
        };
      }

      if (nodeRef.type === 'sticky') {
        return {
          ...prev,
          canvasStickies: (prev.canvasStickies || []).map((s) =>
            s.id === nodeRef.id ? mergeStyle(s) : s
          ),
        };
      }

      if (nodeRef.type === 'obstacle') {
        return {
          ...prev,
          canvasObstacles: (prev.canvasObstacles || []).map((item) =>
            item.id === nodeRef.id ? mergeStyle(item) : item
          ),
        };
      }

      if (nodeRef.type === 'resource') {
        return {
          ...prev,
          canvasResources: (prev.canvasResources || []).map((item) =>
            item.id === nodeRef.id ? mergeStyle(item) : item
          ),
        };
      }

      if (nodeRef.type === 'task') {
        return {
          ...prev,
          canvasTasks: (prev.canvasTasks || []).map((item) =>
            item.id === nodeRef.id ? mergeStyle(item) : item
          ),
        };
      }

      return prev;
    });
  }, [patchState]);

  const applyCanvasAutoLayout = useCallback(() => {
    patchState((prev) => {
      const layout = getRoadmapLayout(prev.mapTheme);
      const updates = computeAutoLayout(
        prev.stages,
        prev.backlog,
        prev.canvasStickies,
        prev.canvasConnections,
        layout
      );

      let stages = prev.stages.map((s) =>
        updates.stages[s.id] ? { ...s, ...updates.stages[s.id] } : s
      );

      stages = stages.map((s) => {
        const ideaUpdates = updates.ideas[s.id];
        if (!ideaUpdates) return s;
        return {
          ...s,
          ideas: (s.ideas || []).map((i) =>
            ideaUpdates[i.id] ? { ...i, ...ideaUpdates[i.id] } : i
          ),
        };
      });

      const backlog = (prev.backlog || []).map((i) =>
        updates.backlog[i.id] ? { ...i, ...updates.backlog[i.id] } : i
      );

      const canvasStickies = (prev.canvasStickies || []).map((st) =>
        updates.stickies[st.id] ? { ...st, ...updates.stickies[st.id] } : st
      );

      return {
        ...prev,
        stages: processStages(stages),
        backlog,
        canvasStickies,
      };
    });
  }, [patchState]);

  const addBlocker = useCallback((stageId, blocker) => {
    updateStages((stages) =>
      stages.map((s) =>
        s.id === stageId ? { ...s, blockers: [...(s.blockers || []), blocker] } : s
      )
    );
  }, [updateStages]);

  const updateBlocker = useCallback((stageId, blockerId, updates) => {
    updateStages((stages) =>
      stages.map((s) =>
        s.id === stageId
          ? {
              ...s,
              blockers: (s.blockers || []).map((b) =>
                b.id === blockerId ? { ...b, ...updates } : b
              ),
            }
          : s
      )
    );
  }, [updateStages]);

  const addDecision = useCallback((stageId, decision) => {
    updateStages((stages) =>
      stages.map((s) =>
        s.id === stageId ? { ...s, decisions: [...(s.decisions || []), decision] } : s
      )
    );
  }, [updateStages]);

  const updateDecision = useCallback((stageId, decisionId, updates) => {
    updateStages((stages) =>
      stages.map((s) =>
        s.id === stageId
          ? {
              ...s,
              decisions: (s.decisions || []).map((d) =>
                d.id === decisionId ? { ...d, ...updates } : d
              ),
            }
          : s
      )
    );
  }, [updateStages]);

  const markStageDone = useCallback((stageId) => {
    updateStages((stages) => setStageComplete(stages, stageId, true));
  }, [updateStages]);

  const toggleStageComplete = useCallback((stageId) => {
    updateStages((stages) => toggleStageCompleteState(stages, stageId));
  }, [updateStages]);

  const clearAllData = useCallback(async () => {
    if (stateRef.current?.isLifeline) {
      throw new Error('Το Lifeline δεν μπορεί να μηδενιστεί από εδώ.');
    }
    await flushSaveNow();
    const reset = await resetSupabaseProject(stateRef.current || {});
    clearHistory();
    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...reset, projectId: prev.projectId };
      rememberSyncedState(next);
      return next;
    });
  }, [clearHistory, flushSaveNow, rememberSyncedState]);

  const openProjectRoadmap = useCallback(async (projectId, stageId = null) => {
    if (stateRef.current?.projectId === projectId) {
      setState((prev) =>
        prev ? { ...prev, activeView: 'roadmap', selectedStageId: stageId } : prev
      );
      return;
    }

    const switchingToLifeline = Boolean(lifelineProjectId && projectId === lifelineProjectId);
    setSyncError(null);
    stashCurrentProject();
    if (restoreSessionProject(projectId, { activeView: 'roadmap', selectedStageId: stageId })) {
      return;
    }
    if (!switchingToLifeline) setLoading(true);
    try {
      const data = await loadProjectById(projectId);
      setStoredProjectId(projectId);
      applyProject({
        ...data,
        projectList: projectListRef.current,
        activeView: 'roadmap',
        selectedStageId: stageId,
      });
    } catch (err) {
      setSyncError(err.message || 'Failed to open project');
    } finally {
      if (!switchingToLifeline) setLoading(false);
    }
  }, [applyProject, lifelineProjectId, restoreSessionProject, stashCurrentProject]);

  const openLifeline = useCallback(async () => {
    if (!lifelineProjectId) return;
    if (stateRef.current?.projectId && !stateRef.current?.isLifeline) {
      lastRegularProjectIdRef.current = stateRef.current.projectId;
    }
    if (stateRef.current?.projectId === lifelineProjectId && stateRef.current?.isLifeline) {
      setLifelineFocusToken(Date.now());
      const localStages = stateRef.current.stages || [];
      const localCheckpointCount = localStages.reduce(
        (sum, s) => sum + (s.checkpoints?.length || 0),
        0
      );
      const needsFreshData =
        !localStages.length ||
        localCheckpointCount === 0;
      if (needsFreshData) {
        try {
          const fresh = await loadProjectById(lifelineProjectId);
          const freshCheckpointCount = (fresh.stages || []).reduce(
            (sum, s) => sum + (s.checkpoints?.length || 0),
            0
          );
          if (fresh.stages?.length && freshCheckpointCount >= localCheckpointCount) {
            applyRemoteProject(fresh, { keepUi: true });
            return;
          }
        } catch {
          /* fall through */
        }
      }
      setState((prev) => (prev ? { ...prev, activeView: 'roadmap', selectedStageId: null } : prev));
      return;
    }
    await openProjectRoadmap(lifelineProjectId);
  }, [lifelineProjectId, openProjectRoadmap, applyRemoteProject]);

  const setLifelineAnchorDate = useCallback(async (projectId, anchorDate) => {
    setLifelineAnchors((prev) => {
      const next = prev.map((p) => (p.id === projectId ? { ...p, lifelineAnchorDate: anchorDate } : p));
      if (stateRef.current?.isLifeline) {
        const anchorDates = next.map((p) => p.lifelineAnchorDate).filter(Boolean);
        setState((current) =>
          current
            ? {
                ...current,
                mapTheme: syncLifelineMapTheme(current.mapTheme, anchorDates),
              }
            : current
        );
      }
      return next;
    });
    setProjectList((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, lifelineAnchorDate: anchorDate } : p))
    );
    try {
      await updateLifelineAnchor(projectId, anchorDate);
    } catch (err) {
      setSyncError(err.message || 'Failed to update lifeline anchor');
    }
  }, []);

  const updateLifelineDay = useCallback((date, patch) => {
    const current = stateRef.current;
    const lifelineSource = current?.isLifeline ? current.lifelineDays : lifelineDaysRef.current;
    const nextLifelineDays = patchDayEntry(lifelineSource, date, patch);

    const journalPatch = {};
    if (patch.notes !== undefined) journalPatch.notes = patch.notes;
    if (patch.todos) journalPatch.todos = patch.todos;
    if (patch.routines) journalPatch.routines = patch.routines;

    const merged = mergeSelfHubCapture({
      selfHubDays: selfHubDaysRef.current,
      lifelineDays: nextLifelineDays,
      date,
      patch: Object.keys(journalPatch).length
        ? { journal: journalPatch, updatedAt: new Date().toISOString() }
        : { updatedAt: new Date().toISOString() },
    });

    selfHubDaysRef.current = merged.selfHubDays;
    lifelineDaysRef.current = merged.lifelineDays;
    setSelfHubDays(merged.selfHubDays);

    if (current?.isLifeline) {
      const hasJournalEdit =
        patch.notes !== undefined || patch.todos !== undefined || patch.routines !== undefined;
      if (hasJournalEdit) {
        patchState((prev) => ({
          ...prev,
          lifelineDays: merged.lifelineDays,
          mapTheme: {
            ...prev.mapTheme,
            lifeline: {
              ...(prev.mapTheme?.lifeline || {}),
              selfHubDays: merged.selfHubDays,
            },
          },
        }));
      } else {
        applyLifelineBundleLocally({
          lifelineDays: merged.lifelineDays,
          selfHubDays: merged.selfHubDays,
        });
      }
      markLifelineBundlePending();
      return;
    }

    setLifelineArchiveDays(merged.lifelineDays);
    markLifelineBundlePending();
  }, [patchState, applyLifelineBundleLocally, markLifelineBundlePending]);

  const updateLifelineDaysBatch = useCallback((patchesByDate) => {
    const current = stateRef.current;
    const lifelineSource = current?.isLifeline
      ? current.lifelineDays
      : lifelineDaysRef.current;

    const filtered = {};
    for (const [dateStr, patch] of Object.entries(patchesByDate ?? {})) {
      const key = toDateString(dateStr);
      if (!key) continue;
      const dayEntry = getDayEntry(lifelineSource, key);
      if (patch?.metrics && JSON.stringify(dayEntry?.metrics) === JSON.stringify(patch.metrics)) {
        continue;
      }
      filtered[dateStr] = patch;
    }
    if (Object.keys(filtered).length === 0) return;

    const nextLifelineDays = patchMultipleDayEntries(lifelineSource, filtered);
    lifelineDaysRef.current = nextLifelineDays;

    if (current?.isLifeline) {
      applyLifelineBundleLocally({ lifelineDays: nextLifelineDays });
    } else {
      setLifelineArchiveDays(nextLifelineDays);
    }

    markLifelineBundlePending();
  }, [applyLifelineBundleLocally, markLifelineBundlePending]);

  const refreshProjectActivity = useCallback(async () => {
    try {
      const activity = await loadAllProjectsActivity();
      setProjectActivity(activity);
    } catch {
      setProjectActivity([]);
    }
  }, []);

  const assignLifelineAnchorToday = useCallback((projectId) => {
    setLifelineAnchorDate(projectId, toDateString(new Date()));
  }, [setLifelineAnchorDate]);

  const applyAssistantIntents = useCallback(async (intents) => {
    const created = { goals: 0, ideas: 0, notes: 0, checkpoints: 0 };
    const removed = { goals: 0 };
    let lastGoalId = null;

    patchState((prev) => {
      let stages = [...prev.stages];
      let goals = [...(prev.goals || [])];
      let notes = [...(prev.notes || [])];
      let selectedStageId = prev.selectedStageId;
      const now = new Date().toISOString();

      for (const intent of intents) {
        if (intent.type === 'delete_all_goals') {
          removed.goals = goals.length;
          goals = [];
          continue;
        }

        if (intent.type === 'delete_goal') {
          const goalId = findGoalIdFromHint(goals, intent.goalHint);
          if (goalId) {
            goals = reindexGoals(goals.filter((g) => g.id !== goalId));
            removed.goals += 1;
          }
          continue;
        }

        if (intent.type === 'goal') {
          const sorted = [...goals].sort((a, b) => a.order - b.order);
          const maxOrder = sorted.length ? Math.max(...sorted.map((g) => g.order)) : 0;
          const goal = {
            ...createEmptyGoal(maxOrder + 1, sorted.length === 0),
            title: intent.title,
            description: intent.description || '',
          };
          goals = [...sorted, goal];
          lastGoalId = goal.id;
          created.goals += 1;
          continue;
        }

        const stageId =
          intent.stageHint
            ? findStageIdFromHint(stages, intent.stageHint)
            : findStageIdFromHint(stages, null);

        if (intent.type === 'idea') {
          if (!stageId) continue;
          const idea = {
            id: generateId(),
            title: intent.title,
            description: intent.description || '',
            reasonToWait: '',
            unlockStageId: null,
            linkedCheckpointIds: [],
            actionAfterUnlock: '',
            impact: 'Medium',
            effort: 'Medium',
            timing: 'Too Early',
            status: 'Locked',
            reviewDate: null,
          };
          stages = stages.map((s) =>
            s.id === stageId ? { ...s, ideas: [...(s.ideas || []), idea] } : s
          );
          created.ideas += 1;
          continue;
        }

        if (intent.type === 'checkpoint') {
          if (!stageId) continue;
          const checkpoint = {
            id: generateId(),
            title: intent.title,
            checkpointType: 'Quality',
            metricName: intent.title,
            currentValue: 0,
            targetValue: 1,
            unit: '',
            currency: 'EUR',
            checklistItems: [{ id: generateId(), text: intent.title, checked: false }],
            done: false,
            completedAt: null,
          };
          stages = stages.map((s) =>
            s.id === stageId
              ? { ...s, checkpoints: [...(s.checkpoints || []), checkpoint] }
              : s
          );
          created.checkpoints += 1;
          continue;
        }

        if (intent.type === 'note') {
          const relatedStageId = stageId || null;
          notes = [
            {
              id: generateId(),
              title: intent.title,
              body: intent.body || intent.title,
              relatedStageId,
              relatedGoalId: lastGoalId || findGoalIdFromHint(goals, null),
              createdAt: now,
              updatedAt: now,
            },
            ...notes,
          ];
          created.notes += 1;
        }
      }

      return {
        ...prev,
        stages: processStages(stages),
        goals: reindexGoals(goals),
        notes,
        selectedStageId,
      };
    });

    const parts = [];
    if (removed.goals) parts.push(`διέγραψα ${removed.goals} στόχος/ους`);
    if (created.goals) parts.push(`πρόσθεσα ${created.goals} στόχος/ους`);
    if (created.ideas) parts.push(`${created.ideas} ιδέα/ες`);
    if (created.checkpoints) parts.push(`${created.checkpoints} checkpoint(s)`);
    if (created.notes) parts.push(`${created.notes} σημείωση/ες`);

    if (parts.length === 0) {
      if (intents.some((i) => i.type === 'delete_goal')) {
        throw new Error('Δεν βρήκα τον στόχο για διαγραφή. Δοκίμασε με το όνομά του.');
      }
      if (intents.some((i) => i.type === 'idea' || i.type === 'checkpoint')) {
        throw new Error('Δεν βρέθηκε milestone στο roadmap. Πρόσθεσε πρώτα φάση στο Roadmap ή φόρτωσε template.');
      }
      throw new Error('Δεν κατάλαβα την εντολή. Δοκίμασε ξανά.');
    }

    return { message: `Έτοιμο! ${parts.join(', ')}.` };
  }, [patchState]);

  const applySmartCapture = useCallback(async (capture) => {
    const current = stateRef.current;
    const currentId = current?.projectId;
    const targetId = capture?.projectId || currentId;
    if (!targetId || !current) {
      throw new Error('Δεν υπάρχει project για αποθήκευση.');
    }

    const classified = {
      ...capture,
      itemId: capture.itemId || generateId(),
    };

    if (targetId === currentId) {
      let applied = null;
      patchState((prev) => {
        applied = applyCaptureToState(prev, classified);
        return applied.state;
      });
      if (!applied) {
        throw new Error('Δεν αποθηκεύτηκε η σημείωση.');
      }
      return {
        remote: false,
        itemId: applied.itemId,
        type: applied.type,
        stageId: classified.stageId || null,
        projectId: targetId,
        projectTitle: current.projectTitle || classified.projectTitle,
        message: captureSuccessMessage({ ...classified, type: applied.type }),
      };
    }

    const remote = await appendCaptureToRemoteProject(targetId, classified);
    return {
      remote: true,
      itemId: remote.itemId,
      type: remote.type,
      stageId: classified.stageId || null,
      projectId: targetId,
      projectTitle: remote.projectTitle || classified.projectTitle,
      message: captureSuccessMessage({
        ...classified,
        type: remote.type,
        projectTitle: remote.projectTitle || classified.projectTitle,
      }),
    };
  }, [patchState]);

  const undoSmartCapture = useCallback(async (ref) => {
    if (!ref?.itemId) return;
    const currentId = stateRef.current?.projectId;
    if (!ref.remote || ref.projectId === currentId) {
      patchState((prev) => removeCaptureFromState(prev, ref).state);
      return;
    }
    await removeCaptureFromRemoteProject(ref.projectId, ref);
  }, [patchState]);

  const base = {
    loading,
    workspaceReady: Boolean(state?.projectId),
    syncing,
    hasUnsavedChanges,
    syncError,
    syncConflict,
    reloadFromCloud,
    retryLoadWorkspace,
    flushSaveNow,
    isSupabaseConfigured,
    projectList,
    setProjectTitle,
    setProjectBrief,
    setSelectedStageId,
    setFocusMode,
    setActiveView,
    openStage,
    openProjectRoadmap,
    openLifeline,
    lifelineProjectId,
    lastRegularProjectId,
    lifelineFocusToken,
    lifelineAnchors,
    setLifelineAnchorDate,
    updateLifelineDay,
    updateLifelineDaysBatch,
    selfHubDays,
    captureSelfHubLiveDay,
    projectActivity,
    refreshProjectActivity,
    assignLifelineAnchorToday,
    closeStage,
    switchProject,
    createNewProject,
    deleteCurrentProject,
    loadTemplate,
    updateStage,
    updateStagePlan,
    addStage,
    reorderStage,
    moveStagePosition,
    moveStageTimelineY,
    moveItemTimelineY,
    attachStageToRoadmap,
    detachStageFromRoadmap,
    clearStageFromCanvas,
    addGoal,
    updateGoal,
    moveGoal,
    removeGoal,
    moveStage,
    removeStage,
    addCheckpoint,
    updateCheckpoint,
    removeCheckpoint,
    reorderCheckpoint,
    addIdea,
    updateIdea,
    removeIdea,
    moveIdeaPosition,
    addBacklogIdea,
    updateBacklogIdea,
    removeBacklogIdea,
    moveBacklogIdeaPosition,
    clearIdeaFromCanvas,
    addCanvasConnection,
    removeCanvasConnection,
    addCanvasSticky,
    updateCanvasSticky,
    moveCanvasSticky,
    removeCanvasSticky,
    shiftRoadmapSpine,
    resizeRoadmapSpine,
    moveRoadmapSpinePreview,
    applyRoadmapSpineMove,
    clearStickyFromCanvas,
    addCanvasInkStroke,
    removeCanvasInkStrokes,
    moveCanvasInkStrokes,
    clearCanvasInk,
    addWhiteboardStroke,
    removeWhiteboardStrokes,
    moveWhiteboardStrokes,
    clearWhiteboardStrokes,
    undo,
    updateNodeCanvasStyle,
    applyCanvasAutoLayout,
    updateMapTheme,
    addBlocker,
    updateBlocker,
    addCanvasObstacle,
    updateCanvasObstacle,
    moveCanvasObstacle,
    removeCanvasObstacle,
    clearCanvasObstacleFromCanvas,
    addCanvasResource,
    updateCanvasResource,
    moveCanvasResource,
    removeCanvasResource,
    clearCanvasResourceFromCanvas,
    addCanvasTask,
    updateCanvasTask,
    moveCanvasTask,
    removeCanvasTask,
    clearCanvasTaskFromCanvas,
    addDecision,
    updateDecision,
    markStageDone,
    toggleStageComplete,
    clearAllData,
    addNote,
    updateNote,
    deleteNote,
    updateStages,
    applyAssistantIntents,
    applySmartCapture,
    undoSmartCapture,
  };

  if (!state) {
    return {
      ...base,
      projectTitle: '',
      stages: [],
      goals: [],
      notes: [],
      backlog: [],
      canvasConnections: [],
      canvasStickies: [],
      canvasObstacles: [],
      canvasResources: [],
      canvasTasks: [],
      canvasInk: [],
      whiteboardStrokes: [],
      mapTheme: DEFAULT_MAP_THEME,
      projectBrief: normalizeProjectBrief(),
      selectedStageId: null,
      focusMode: false,
      activeView: 'self',
      cloudUpdatedAt: null,
      projectId: null,
      isLifeline: false,
      lifelineAnchorDate: null,
      lifelineDays: {},
    };
  }

  return {
    ...base,
    ...state,
    lifelineDays: state?.isLifeline ? state.lifelineDays : lifelineArchiveDays,
    lifelineProjectId,
    lastRegularProjectId,
    lifelineFocusToken,
    lifelineAnchors,
    projectActivity,
    selfHubDays,
  };
};
