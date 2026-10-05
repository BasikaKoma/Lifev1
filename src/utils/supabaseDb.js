import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { waitForAuthSession } from '../lib/auth';
import { createDefaultStages, createStarterStages, migrateProjectGoals, reindexGoals } from '../data/templates';
import { processStages } from './logic';
import { clearStoredProjectId, getStoredProjectId, setStoredProjectId } from './projectSession';
import { mergeMapTheme } from './mapTheme';
import {
  LIFELINE_PROTECTION_COLUMNS,
  PERSISTABLE_COLUMNS,
  applyColumnValuesToState,
  getStateValueForColumn,
} from './projectSavePatch';
import {
  applyCaptureToState,
  removeCaptureFromState,
} from './smartCapture';
import {
  readLocalColumns,
  readLocalMeta,
  writeLocalColumnsQuiet,
  clearLocalProject,
} from './projectLocalStore';
import {
  createLifelineProject,
  syncLifelineMapTheme,
} from './lifeline';
import { mergeLifelineDaysMaps, normalizeLifelineDays } from './lifelineDays';
import { normalizeSelfHubDays } from './selfHubDays';
import { normalizeProjectBrief } from './projectBrief';
import { normalizeProjectRhythm } from './projectRhythm';
import { normalizeActiveView } from './appNavigation';
import {
  mergeLifelineRowData,
  protectLifelineDataFromAccidentalWipe,
} from './lifelineMerge';
import { isCloudSyncEnabled } from '../lib/vault/config';
import { overlayVaultProjectData } from '../lib/vault/projects';
import {
  cloudConflictWarning,
  localMetaMatchesCloud,
  readCloudVersion,
} from './cloudRevision';

const MINIMAL_PROJECT_COLUMNS = new Set([
  'title',
  'stages',
  'active_view',
  'focus_mode',
  'selected_stage_id',
]);

const EXTENDED_PROJECT_COLUMNS = new Set([
  'goals',
  'notes',
  'backlog',
  'canvas_connections',
  'canvas_stickies',
  'canvas_obstacles',
  'canvas_resources',
  'canvas_tasks',
  'canvas_ink',
  'whiteboard_strokes',
  'map_theme',
  'brief',
  'recurring',
  'lifeline_days',
]);

const LIFELINE_COLUMNS = new Set([
  'title',
  'stages',
  'goals',
  'active_view',
  'focus_mode',
  'selected_stage_id',
  'notes',
  'backlog',
  'canvas_connections',
  'canvas_stickies',
  'canvas_obstacles',
  'canvas_resources',
  'canvas_tasks',
  'canvas_ink',
  'whiteboard_strokes',
  'map_theme',
  'lifeline_days',
]);

let projectColumnCache = null;
let lifelineColumnCache = null;

export function invalidateProjectColumnCache() {
  projectColumnCache = null;
  lifelineColumnCache = null;
}

function requireCloud() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Project data is stored in the database only.');
  }
}

async function refreshProjectColumns(projectId) {
  requireCloud();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client unavailable');

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();

  if (error || !data) {
    return projectColumnCache || MINIMAL_PROJECT_COLUMNS;
  }

  projectColumnCache = new Set(Object.keys(data));
  return projectColumnCache;
}

function filterRowByColumns(row, columns) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (columns.has(key)) out[key] = value;
  }
  return out;
}

function normalizeActiveViewForDb(activeView) {
  return normalizeActiveView(activeView);
}

function buildCoreRow(state) {
  const row = {
    title: state.projectTitle || 'My Business',
    stages: processStages(state.stages || []),
    active_view: normalizeActiveViewForDb(state.activeView),
    focus_mode: state.focusMode === true,
  };

  if (state.selectedStageId) {
    row.selected_stage_id = state.selectedStageId;
  }

  if (state.isLifeline !== true && state.lifelineAnchorDate) {
    row.lifeline_anchor_date = state.lifelineAnchorDate;
  }

  return sanitizeForDb(row);
}

function buildExtendedRow(state) {
  return sanitizeForDb({
    goals: state.goals || [],
    notes: state.notes || [],
    backlog: state.backlog || [],
    canvas_connections: state.canvasConnections || [],
    canvas_stickies: state.canvasStickies || [],
    canvas_obstacles: state.canvasObstacles || [],
    canvas_resources: state.canvasResources || [],
    canvas_tasks: state.canvasTasks || [],
    canvas_ink: state.canvasInk || [],
    whiteboard_strokes: state.whiteboardStrokes || [],
    map_theme: state.mapTheme || {},
    brief: normalizeProjectBrief(state.projectBrief),
    recurring: normalizeProjectRhythm(state.projectRhythm),
    lifeline_days: normalizeLifelineDays(state.lifelineDays),
  });
}

function mapProjectListItem(row) {
  return {
    id: row.id,
    title: row.title,
    updated_at: row.updated_at || null,
    isLifeline: row.is_lifeline === true || row.isLifeline === true,
    lifelineAnchorDate: row.lifeline_anchor_date || row.lifelineAnchorDate || null,
  };
}

function normalizeActiveViewFromDb(activeView) {
  return normalizeActiveView(activeView);
}

function jsonbField(row, snake, camel) {
  if (row && Object.prototype.hasOwnProperty.call(row, snake)) return row[snake];
  if (row && Object.prototype.hasOwnProperty.call(row, camel)) return row[camel];
  return undefined;
}

function normalizeRow(row, { isLifeline = false, userId = null } = {}) {
  const lifeline = isLifeline || row.is_lifeline === true || row.isLifeline === true;
  const rawStages = jsonbField(row, 'stages', 'stages');
  const rawGoals = jsonbField(row, 'goals', 'goals');
  let stages;
  let goals;
  if (rawStages != null || rawGoals != null) {
    const migrated = migrateProjectGoals(processStages(rawStages || []), rawGoals);
    stages = processStages(migrated.stages);
    goals = reindexGoals(migrated.goals);
  }
  const rawTheme = jsonbField(row, 'map_theme', 'mapTheme');
  let mapTheme;
  if (rawTheme != null) {
    mapTheme = mergeMapTheme(rawTheme);
    if (lifeline) mapTheme = syncLifelineMapTheme(mapTheme);
  }
  const ownerUserId = row.user_id || row.userId || null;
  return {
    projectId: row.id,
    projectTitle: row.title,
    isLifeline: lifeline,
    isOwner: userId ? ownerUserId === userId : true,
    ownerUserId,
    lifelineAnchorDate: lifeline ? null : (row.lifeline_anchor_date || row.lifelineAnchorDate || null),
    stages,
    goals,
    notes: jsonbField(row, 'notes', 'notes'),
    backlog: jsonbField(row, 'backlog', 'backlog'),
    canvasConnections: jsonbField(row, 'canvas_connections', 'canvasConnections'),
    canvasStickies: jsonbField(row, 'canvas_stickies', 'canvasStickies'),
    canvasObstacles: jsonbField(row, 'canvas_obstacles', 'canvasObstacles'),
    canvasResources: jsonbField(row, 'canvas_resources', 'canvasResources'),
    canvasTasks: jsonbField(row, 'canvas_tasks', 'canvasTasks'),
    canvasInk: jsonbField(row, 'canvas_ink', 'canvasInk'),
    whiteboardStrokes: jsonbField(row, 'whiteboard_strokes', 'whiteboardStrokes'),
    mapTheme,
    projectBrief: jsonbField(row, 'brief', 'projectBrief'),
    projectRhythm: jsonbField(row, 'recurring', 'projectRhythm'),
    lifelineDays: jsonbField(row, 'lifeline_days', 'lifelineDays'),
    selectedStageId: row.selected_stage_id || null,
    focusMode: row.focus_mode === true,
    cloudUpdatedAt: row.updated_at || null,
    cloudVersion: readCloudVersion(row),
    activeView: normalizeActiveViewFromDb(row.active_view),
  };
}

function sanitizeForDb(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildPatchRow(state, columns, allowedColumns) {
  const wanted = columns?.length ? columns : PERSISTABLE_COLUMNS;
  const row = {};
  for (const column of wanted) {
    if (!allowedColumns.has(column)) continue;
    if (column === 'lifeline_anchor_date' && state.isLifeline === true) continue;
    row[column] = getStateValueForColumn(state, column);
  }
  return sanitizeForDb(row);
}

function patchNeedsLifelineProtection(row) {
  return Object.keys(row).some((column) => LIFELINE_PROTECTION_COLUMNS.has(column));
}

function formatSupabaseError(error) {
  return [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' — ');
}

function isMissingColumnError(error) {
  const message = formatSupabaseError(error);
  return /could not find the .* column|PGRST204|42703|column .* does not exist/i.test(message);
}

async function insertProjectRow(supabase, row) {
  const { user_id, title, stages, ...optional } = row;
  const minimal = sanitizeForDb({
    user_id,
    title: title || 'My Business',
    stages: stages || [],
  });

  const full = sanitizeForDb({ ...minimal, ...optional });
  let { data, error } = await supabase.from('projects').insert(full).select('*').single();

  if (error && isMissingColumnError(error)) {
    ({ data, error } = await supabase.from('projects').insert(minimal).select('*').single());
  }

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        `${formatSupabaseError(error)}. Τρέξε supabase/010_schema_complete.sql στο Supabase SQL Editor.`
      );
    }
    throw new Error(formatSupabaseError(error));
  }

  if (data) {
    projectColumnCache = new Set(Object.keys(data));
  }

  return data;
}

function requireSupabase() {
  requireCloud();
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');
  return client;
}

async function requireUserId() {
  const session = await waitForAuthSession();
  if (!session?.user) throw new Error('Not signed in');
  return session.user.id;
}

function isMissingTableError(error) {
  const message = formatSupabaseError(error);
  return /could not find the table|PGRST205|relation .* does not exist|42P01/i.test(message);
}

async function refreshLifelineColumns(lifelineId) {
  requireCloud();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client unavailable');

  const { data, error } = await supabase
    .from('lifelines')
    .select('*')
    .eq('id', lifelineId)
    .maybeSingle();

  if (error || !data) {
    return lifelineColumnCache || LIFELINE_COLUMNS;
  }

  lifelineColumnCache = new Set(Object.keys(data));
  return lifelineColumnCache;
}

async function loadLifelineRowById(lifelineId, userId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('lifelines')
    .select('*')
    .eq('id', lifelineId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  if (!data) return null;

  lifelineColumnCache = new Set(Object.keys(data));
  return data;
}

export async function loadAllProjectsOverview() {
  requireCloud();
  const supabase = requireSupabase();
  await requireUserId();
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, stages, is_lifeline')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return (data || [])
    .filter((row) => row.is_lifeline !== true)
    .map((row) => ({
      id: row.id,
      title: row.title,
      stages: processStages(row.stages || []),
    }));
}

export async function loadAllProjectsActivity() {
  requireCloud();
  const supabase = requireSupabase();
  await requireUserId();

  const selects = [
    'id, title, stages, notes, canvas_tasks, canvas_obstacles, canvas_resources, canvas_stickies, is_lifeline',
    'id, title, stages, notes, canvas_tasks, canvas_obstacles, canvas_stickies, is_lifeline',
    'id, title, stages, notes, canvas_tasks, canvas_obstacles, is_lifeline',
    'id, title, stages, notes, canvas_tasks, is_lifeline',
    'id, title, stages, notes, is_lifeline',
  ];

  let data;
  let error;
  for (const select of selects) {
    ({ data, error } = await supabase.from('projects').select(select));
    if (!error) break;
    if (!isMissingColumnError(error) && !/canvas_tasks|canvas_obstacles|canvas_resources|canvas_stickies|42703|column .* does not exist/i.test(formatSupabaseError(error))) {
      throw error;
    }
  }

  if (error) throw error;

  return (data || []).map((row) => {
    const isLifeline = row.is_lifeline === true;
    return {
      id: row.id,
      title: isLifeline ? row.title || 'Lifeline' : row.title,
      stages: isLifeline ? [] : processStages(row.stages || []),
      notes: row.notes || [],
      canvasTasks: isLifeline ? [] : row.canvas_tasks || row.canvasTasks || [],
      canvasObstacles: isLifeline ? [] : row.canvas_obstacles || row.canvasObstacles || [],
      canvasResources: isLifeline ? [] : row.canvas_resources || row.canvasResources || [],
      canvasStickies: isLifeline ? [] : row.canvas_stickies || row.canvasStickies || [],
    };
  });
}

/** Compact rows for Brain: every project the user owns, including Lifeline. */
export async function loadAllProjectsForBrain() {
  requireCloud();
  const supabase = requireSupabase();
  await requireUserId();

  const selects = [
    'id, title, updated_at, stages, goals, notes, canvas_tasks, canvas_obstacles, brief, is_lifeline',
    'id, title, updated_at, stages, goals, notes, canvas_tasks, is_lifeline',
    'id, title, updated_at, stages, goals, notes, is_lifeline',
    'id, title, updated_at, stages, notes, is_lifeline',
  ];

  let data;
  let error;
  for (const select of selects) {
    ({ data, error } = await supabase.from('projects').select(select).order('updated_at', { ascending: false }));
    if (!error) break;
    if (!isMissingColumnError(error) && !/canvas_tasks|canvas_obstacles|brief|42703|column .* does not exist/i.test(formatSupabaseError(error))) {
      throw error;
    }
  }
  if (error) throw error;

  return (data || []).map((row) => {
    const migrated = migrateProjectGoals(processStages(row.stages || []), row.goals);
    return {
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at || null,
      isLifeline: row.is_lifeline === true,
      stages: processStages(migrated.stages),
      goals: reindexGoals(migrated.goals),
      notes: row.notes || [],
      canvasTasks: row.canvas_tasks || row.canvasTasks || [],
      canvasObstacles: row.canvas_obstacles || row.canvasObstacles || [],
      brief: row.brief || null,
    };
  });
}

async function loadProjectSharingMeta(supabase, userId) {
  const memberCounts = new Map();
  const sharedProjectIds = new Set();

  const { data: memberRows, error } = await supabase
    .from('project_members')
    .select('project_id, user_id');

  if (error) {
    if (!/could not find|relation .* does not exist|PGRST205|42P01/i.test(formatSupabaseError(error))) {
      throw error;
    }
    return { memberCounts, sharedProjectIds };
  }

  for (const row of memberRows || []) {
    memberCounts.set(row.project_id, (memberCounts.get(row.project_id) || 0) + 1);
    if (row.user_id === userId) {
      sharedProjectIds.add(row.project_id);
    }
  }

  return { memberCounts, sharedProjectIds };
}

export async function listProjects() {
  requireCloud();
  const supabase = requireSupabase();
  const userId = await requireUserId();
  const sharingMeta = await loadProjectSharingMeta(supabase, userId);
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, updated_at, is_lifeline, lifeline_anchor_date, user_id')
    .eq('is_lifeline', false)
    .order('updated_at', { ascending: false });

  if (error) {
    const { data: fallback, error: fallbackError } = await supabase
      .from('projects')
      .select('id, title, updated_at, is_lifeline, user_id')
      .order('updated_at', { ascending: false });
    if (fallbackError) throw fallbackError;
    return (fallback || [])
      .filter((row) => row.is_lifeline !== true)
      .map((row) => mapProjectListItem(row, { userId, ...sharingMeta }));
  }
  return (data || []).map((row) => mapProjectListItem(row, { userId, ...sharingMeta }));
}

export async function loadProjectById(projectId) {
  requireCloud();
  const supabase = requireSupabase();
  const userId = await requireUserId();

  const lifelineRow = await loadLifelineRowById(projectId, userId);
  if (lifelineRow) {
    return {
      source: 'supabase-lifeline',
      ...normalizeRow(lifelineRow, { isLifeline: true }),
    };
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Project not found');

  if (data.is_lifeline === true) {
    if (data.user_id !== userId) {
      throw new Error('Project not found');
    }
    return {
      source: 'supabase-lifeline-legacy',
      ...normalizeRow(data, { isLifeline: true, userId }),
    };
  }

  setStoredProjectId(data.id);
  projectColumnCache = new Set(Object.keys(data));
  return {
    source: 'supabase',
    ...normalizeRow(data, { userId }),
  };
}

export async function fetchProjectCloudUpdatedAt(projectId) {
  if (!projectId) return null;
  requireCloud();
  const supabase = requireSupabase();
  const userId = await requireUserId();

  const lifeline = await readCloudRevision(supabase, 'lifelines', projectId, userId);
  if (lifeline?.cloudUpdatedAt) return lifeline;

  const project = await readCloudRevision(supabase, 'projects', projectId);
  return project?.cloudUpdatedAt ? project : null;
}

export function subscribeToProjectChanges(projectId, onChange) {
  if (!isSupabaseConfigured() || !projectId) {
    return () => {};
  }

  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  const applyChange = (row, isLifeline) => {
    if (!row) return;
    try {
      onChange(normalizeRow(row, { isLifeline }));
    } catch (err) {
      console.warn('Realtime project parse failed', err);
    }
  };

  const projectChannel = supabase
    .channel(`project-sync:${projectId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'projects',
        filter: `id=eq.${projectId}`,
      },
      (payload) => applyChange(payload.new, payload.new?.is_lifeline === true)
    )
    .subscribe();

  const lifelineChannel = supabase
    .channel(`lifeline-sync:${projectId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'lifelines',
        filter: `id=eq.${projectId}`,
      },
      (payload) => applyChange(payload.new, true)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(projectChannel);
    supabase.removeChannel(lifelineChannel);
  };
}

async function mergeOrphanedLifelines(supabase, userId, canonicalLifelineId) {
  const { data: orphans, error: orphanError } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .eq('is_lifeline', true);

  if (orphanError) {
    if (isMissingColumnError(orphanError)) return;
    throw orphanError;
  }
  if (!orphans?.length) return;

  const { data: canonical, error: canonicalError } = await supabase
    .from('lifelines')
    .select('*')
    .eq('id', canonicalLifelineId)
    .eq('user_id', userId)
    .maybeSingle();

  if (canonicalError) {
    if (isMissingTableError(canonicalError)) return;
    throw canonicalError;
  }
  if (!canonical) return;

  let merged = canonical;
  const orphanIds = [];

  for (const orphan of orphans) {
    if (orphan.id === canonicalLifelineId) continue;
    merged = mergeLifelineRowData(merged, orphan);
    orphanIds.push(orphan.id);
  }

  if (!orphanIds.length) return;

  const patch = sanitizeForDb({
    stages: merged.stages,
    goals: merged.goals,
    notes: merged.notes,
    backlog: merged.backlog,
    canvas_connections: merged.canvas_connections,
    canvas_stickies: merged.canvas_stickies,
    canvas_obstacles: merged.canvas_obstacles,
    canvas_resources: merged.canvas_resources,
    canvas_tasks: merged.canvas_tasks,
    canvas_ink: merged.canvas_ink,
    whiteboard_strokes: merged.whiteboard_strokes,
    map_theme: merged.map_theme,
    lifeline_days: merged.lifeline_days,
  });

  const { error: updateError } = await supabase
    .from('lifelines')
    .update(patch)
    .eq('id', canonicalLifelineId)
    .eq('user_id', userId);

  if (updateError) throw updateError;

  const { error: deleteError } = await supabase.from('projects').delete().in('id', orphanIds);
  if (deleteError) throw deleteError;
}

async function resolveLifelineId(supabase, userId) {
  const { data: lifelineRow, error: lifelineError } = await supabase
    .from('lifelines')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!lifelineError && lifelineRow?.id) {
    await mergeOrphanedLifelines(supabase, userId, lifelineRow.id);
    return lifelineRow.id;
  }

  if (lifelineError && !isMissingTableError(lifelineError)) {
    throw lifelineError;
  }

  const { data: rows, error: findError } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId)
    .eq('is_lifeline', true)
    .order('created_at', { ascending: true });

  if (findError && !isMissingColumnError(findError)) throw findError;
  if (!rows?.length) return null;

  const [keeper, ...extras] = rows;
  if (extras.length > 0) {
    let merged = keeper;
    for (const extra of extras) {
      merged = mergeLifelineRowData(merged, extra);
    }
    const patch = sanitizeForDb({
      stages: merged.stages,
      goals: merged.goals,
      notes: merged.notes,
      backlog: merged.backlog,
      canvas_connections: merged.canvas_connections,
      canvas_stickies: merged.canvas_stickies,
      canvas_obstacles: merged.canvas_obstacles,
      canvas_resources: merged.canvas_resources,
      canvas_tasks: merged.canvas_tasks,
      canvas_ink: merged.canvas_ink,
      whiteboard_strokes: merged.whiteboard_strokes,
      map_theme: merged.map_theme,
      lifeline_days: merged.lifeline_days,
    });
    await supabase.from('projects').update(patch).eq('id', keeper.id);
    await supabase.from('projects').delete().in(
      'id',
      extras.map((row) => row.id)
    );
  }
  return keeper.id;
}

export async function ensureLifelineProject() {
  requireCloud();
  const supabase = requireSupabase();
  const userId = await requireUserId();
  const existingId = await resolveLifelineId(supabase, userId);
  if (existingId) {
    const list = await listProjects();
    return { projectList: list, lifelineId: existingId };
  }

  const lifeline = createLifelineProject();
  const row = sanitizeForDb({
    user_id: userId,
    title: lifeline.title,
    stages: lifeline.stages,
    active_view: 'projects',
    focus_mode: false,
    map_theme: lifeline.mapTheme,
    lifeline_days: {},
    canvas_ink: [],
    whiteboard_strokes: [],
  });

  const { data, error } = await supabase.from('lifelines').insert(row).select('*').single();
  if (!error && data?.id) {
    await mergeOrphanedLifelines(supabase, userId, data.id);
    const list = await listProjects();
    lifelineColumnCache = new Set(Object.keys(data));
    return { projectList: list, lifelineId: data.id };
  }

  if (error && !isMissingTableError(error)) {
    const racedId = await resolveLifelineId(supabase, userId);
    if (racedId) {
      const list = await listProjects();
      return { projectList: list, lifelineId: racedId };
    }
    throw error;
  }

  // lifelines table missing — check for existing legacy row before creating another duplicate.
  const legacyExistingId = await resolveLifelineId(supabase, userId);
  if (legacyExistingId) {
    const list = await listProjects();
    return { projectList: list, lifelineId: legacyExistingId };
  }

  const legacyRow = sanitizeForDb({
    user_id: userId,
    title: lifeline.title,
    stages: lifeline.stages,
    is_lifeline: true,
    active_view: 'projects',
    focus_mode: false,
    map_theme: lifeline.mapTheme,
  });

  const { data: legacyData, error: legacyError } = await supabase
    .from('projects')
    .insert(legacyRow)
    .select('*')
    .single();

  if (legacyError) {
    const racedId = await resolveLifelineId(supabase, userId);
    if (racedId) {
      const list = await listProjects();
      return { projectList: list, lifelineId: racedId };
    }
    throw legacyError;
  }

  const list = await listProjects();
  return { projectList: list, lifelineId: legacyData.id };
}

export async function loadLifelineAnchors() {
  requireCloud();
  const supabase = requireSupabase();
  await requireUserId();
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, lifeline_anchor_date, is_lifeline')
    .eq('is_lifeline', false)
    .order('title');

  if (error) {
    if (isMissingColumnError(error)) return [];
    throw error;
  }

  return (data || [])
    .filter((row) => row.is_lifeline !== true)
    .map((row) => ({
      id: row.id,
      title: row.title,
      lifelineAnchorDate: row.lifeline_anchor_date || null,
    }));
}

export async function updateLifelineAnchor(projectId, anchorDate) {
  requireCloud();
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('projects')
    .update({ lifeline_anchor_date: anchorDate || null })
    .eq('id', projectId);

  if (error && isMissingColumnError(error)) {
    return { ok: false, warning: 'Run supabase/014_lifeline.sql for cloud anchor sync.' };
  }
  if (error) throw error;
  return { ok: true, source: 'supabase' };
}

export async function loadInitialProject() {
  requireCloud();
  const ensured = await ensureLifelineProject();
  const projectList = ensured.projectList;
  let projectId = getStoredProjectId();

  if (projectId && projectId === ensured.lifelineId) {
    clearStoredProjectId();
    projectId = null;
  }

  if (projectId) {
    try {
      const loaded = await loadProjectById(projectId);
      if (loaded.isLifeline) {
        clearStoredProjectId();
      } else {
        return { ...loaded, projectList, lifelineProjectId: ensured.lifelineId };
      }
    } catch {
      clearStoredProjectId();
    }
  }

  if (projectList.length > 0) {
    return { ...(await loadProjectById(projectList[0].id)), projectList, lifelineProjectId: ensured.lifelineId };
  }

  return createProject('My Business');
}

let versionColumnSupported = true;
const projectWriteTails = new Map();

function withProjectWriteLock(projectId, task) {
  if (!projectId) return Promise.resolve().then(task);
  const previous = projectWriteTails.get(projectId) || Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  const settled = run.then(() => {}, () => {});
  projectWriteTails.set(projectId, settled);
  settled.finally(() => {
    if (projectWriteTails.get(projectId) === settled) projectWriteTails.delete(projectId);
  });
  return run;
}

function expectedRevision(state) {
  return {
    updatedAt: state?.cloudUpdatedAt || null,
    version: state?.cloudVersion ?? null,
  };
}

function okSave(source, state, lockResult, writtenColumns, extra = {}) {
  return {
    ok: true,
    source,
    cloudUpdatedAt: lockResult?.updatedAt ?? state?.cloudUpdatedAt ?? null,
    cloudVersion: lockResult?.version ?? state?.cloudVersion ?? null,
    writtenColumns,
    ...extra,
  };
}

function conflictSave(state, lockResult) {
  return {
    ok: false,
    conflict: true,
    cloudUpdatedAt: lockResult?.cloudUpdatedAt ?? null,
    cloudVersion: lockResult?.cloudVersion ?? null,
    warning: cloudConflictWarning(state?.projectTitle),
  };
}

async function readCloudRevision(supabase, table, id, userId) {
  const run = (withVersion) => {
    let query = supabase
      .from(table)
      .select(withVersion ? 'updated_at, version' : 'updated_at')
      .eq('id', id);
    if (userId) query = query.eq('user_id', userId);
    return query.maybeSingle();
  };

  let { data, error } = await run(versionColumnSupported);
  if (error && versionColumnSupported && isMissingColumnError(error)) {
    versionColumnSupported = false;
    ({ data, error } = await run(false));
  }
  if (error) {
    if (table === 'lifelines' && isMissingTableError(error)) return null;
    if (table === 'lifelines') return null;
    throw error;
  }
  if (!data?.updated_at) return null;
  return {
    cloudUpdatedAt: data.updated_at,
    cloudVersion: readCloudVersion(data),
  };
}

function lockExpectation(expected) {
  if (!expected) return { updatedAt: null, version: null };
  if ('updatedAt' in expected || 'version' in expected) {
    return {
      updatedAt: expected.updatedAt || null,
      version: expected.version ?? null,
    };
  }
  return {
    updatedAt: expected.cloudUpdatedAt || null,
    version: expected.cloudVersion ?? null,
  };
}

async function updateRowWithLock(supabase, table, id, row, expected) {
  const revision = lockExpectation(expected);

  const attempt = async (useVersion) => {
    let query = supabase.from(table).update(row).eq('id', id);
    if (useVersion && revision.version != null) query = query.eq('version', revision.version);
    else if (revision.updatedAt) query = query.eq('updated_at', revision.updatedAt);
    const columns = useVersion ? 'updated_at, version' : 'updated_at';
    return query.select(columns).maybeSingle();
  };

  let useVersion = versionColumnSupported;
  let { data, error } = await attempt(useVersion);
  if (error && useVersion && isMissingColumnError(error)) {
    versionColumnSupported = false;
    useVersion = false;
    ({ data, error } = await attempt(false));
  }
  if (error) return { error };
  if (data?.updated_at) {
    return { updatedAt: data.updated_at, version: readCloudVersion(data) };
  }

  const usedFilter = (useVersion && revision.version != null) || Boolean(revision.updatedAt);
  if (!usedFilter) {
    return { error: new Error('Project not found or update returned no row') };
  }

  const existing = await readCloudRevision(supabase, table, id);
  if (!existing?.cloudUpdatedAt) return { error: new Error('Project not found') };
  return {
    conflict: true,
    cloudUpdatedAt: existing.cloudUpdatedAt,
    cloudVersion: existing.cloudVersion,
  };
}

async function updateProjectWithLock(supabase, projectId, row, expected) {
  return updateRowWithLock(supabase, 'projects', projectId, row, expected);
}

async function updateLifelineWithLock(supabase, lifelineId, row, expected) {
  return updateRowWithLock(supabase, 'lifelines', lifelineId, row, expected);
}

async function fetchLifelineProtectionSnapshot(supabase, lifelineId) {
  const { data, error } = await supabase
    .from('lifelines')
    .select('stages, lifeline_days, canvas_ink, notes')
    .eq('id', lifelineId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function applyLifelineSaveProtection(fullRow, cloudRow) {
  if (!cloudRow) return { row: fullRow, reconcile: null };
  return protectLifelineDataFromAccidentalWipe(fullRow, cloudRow);
}

async function saveLifelineToSupabase(state, { columns: requestedColumns } = {}) {
  const supabase = requireSupabase();
  const lifelineId = state.projectId;
  const expected = expectedRevision(state);
  const allowed = lifelineColumnCache || (await refreshLifelineColumns(lifelineId));
  let fullRow = buildPatchRow(state, requestedColumns, allowed);

  if (!Object.keys(fullRow).length) {
    return okSave('supabase-lifeline', state, null, []);
  }

  let reconcile = null;
  if (patchNeedsLifelineProtection(fullRow)) {
    const cloudRow = await fetchLifelineProtectionSnapshot(supabase, lifelineId);
    if (cloudRow) {
      const protectedResult = applyLifelineSaveProtection(fullRow, cloudRow);
      fullRow = protectedResult.row;
      reconcile = protectedResult.reconcile;
    }
  }

  const first = await updateLifelineWithLock(supabase, lifelineId, fullRow, expected);

  if (first.conflict) return conflictSave(state, first);

  if (!first.error) {
    return okSave('supabase-lifeline', state, first, Object.keys(fullRow), { reconcile });
  }

  if (isMissingTableError(first.error)) {
    return saveProjectToSupabaseLegacyLifeline(state, { columns: requestedColumns });
  }

  throw new Error(formatSupabaseError(first.error));
}

async function saveProjectToSupabaseLegacyLifeline(state, { columns: requestedColumns } = {}) {
  const supabase = requireSupabase();
  const projectId = state.projectId;
  const expected = expectedRevision(state);
  const allowed = new Set([
    ...(projectColumnCache || MINIMAL_PROJECT_COLUMNS),
    ...(projectColumnCache || EXTENDED_PROJECT_COLUMNS),
  ]);
  let legacyRow = {
    ...buildPatchRow(state, requestedColumns, allowed),
    is_lifeline: true,
  };

  let reconcile = null;
  if (patchNeedsLifelineProtection(legacyRow)) {
    const { data: cloudRow } = await supabase
      .from('projects')
      .select('stages, lifeline_days, canvas_ink, notes')
      .eq('id', projectId)
      .maybeSingle();

    if (cloudRow) {
      const protectedResult = applyLifelineSaveProtection(legacyRow, cloudRow);
      legacyRow = protectedResult.row;
      reconcile = protectedResult.reconcile;
    }
  }

  const result = await updateProjectWithLock(supabase, projectId, legacyRow, expected);

  if (result.conflict) return conflictSave(state, result);
  if (result.error) throw new Error(formatSupabaseError(result.error));
  return okSave(
    'supabase-lifeline-legacy',
    state,
    result,
    Object.keys(legacyRow).filter((key) => key !== 'is_lifeline'),
    { reconcile }
  );
}

async function saveProjectToSupabaseBody(state, { columns: requestedColumns } = {}) {
  requireCloud();
  if (!state?.projectId) {
    throw new Error('No project to save');
  }

  if (state.isLifeline === true) {
    return saveLifelineToSupabase(state, { columns: requestedColumns });
  }

  const supabase = requireSupabase();
  const projectId = state.projectId;
  const expected = expectedRevision(state);
  const allowed = projectColumnCache || (await refreshProjectColumns(projectId));
  const patchRow = buildPatchRow(state, requestedColumns, allowed);

  if (!Object.keys(patchRow).length) {
    return okSave('supabase', state, null, []);
  }

  const first = await updateProjectWithLock(supabase, projectId, patchRow, expected);

  if (first.conflict) return conflictSave(state, first);

  if (!first.error) {
    return okSave('supabase', state, first, Object.keys(patchRow));
  }

  if (isMissingColumnError(first.error)) {
    invalidateProjectColumnCache();
    const fallbackRow = buildPatchRow(state, requestedColumns, MINIMAL_PROJECT_COLUMNS);
    if (!Object.keys(fallbackRow).length) {
      return {
        ...okSave('supabase-partial', state, null, []),
        warning: `Cloud missing columns (${formatSupabaseError(first.error)}). Check Supabase schema.`,
      };
    }
    const fallback = await updateProjectWithLock(supabase, projectId, fallbackRow, expected);

    if (fallback.conflict) return conflictSave(state, fallback);

    if (fallback.error) {
      throw new Error(formatSupabaseError(fallback.error));
    }

    return {
      ...okSave('supabase-minimal', state, fallback, Object.keys(fallbackRow)),
      warning: `Basic sync only (${formatSupabaseError(first.error)}). Check Supabase schema and reload API cache.`,
    };
  }

  throw new Error(formatSupabaseError(first.error));
}

export function saveProjectToSupabase(state, options = {}) {
  if (options.unlocked) return saveProjectToSupabaseBody(state, options);
  return withProjectWriteLock(state?.projectId, () => saveProjectToSupabaseBody(state, options));
}

export async function createProject(title = 'New Business', options = {}) {
  requireCloud();
  const seed = options && typeof options === 'object' ? options.seed : null;
  const makeActive = options.makeActive !== false;
  const stages = seed?.stages || processStages(createStarterStages());
  const supabase = requireSupabase();
  const userId = await requireUserId();
  const data = await insertProjectRow(supabase, {
    user_id: userId,
    title,
    stages,
    goals: seed?.goals || [],
    notes: seed?.notes || [],
    active_view: 'projects',
    focus_mode: false,
    is_lifeline: false,
  });

  if (makeActive) setStoredProjectId(data.id);
  const list = await listProjects();
  const ensured = await ensureLifelineProject();
  return {
    projectList: list,
    lifelineProjectId: ensured.lifelineId,
    ...normalizeRow(data),
  };
}

export async function deleteProject(projectId, currentProjectId) {
  requireCloud();
  const supabase = requireSupabase();
  const userId = await requireUserId();

  const { data: lifelineTarget } = await supabase
    .from('lifelines')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (lifelineTarget?.id) {
    throw new Error('The Lifeline project cannot be deleted.');
  }

  const { data: target } = await supabase
    .from('projects')
    .select('is_lifeline')
    .eq('id', projectId)
    .maybeSingle();

  if (target?.is_lifeline) {
    throw new Error('The Lifeline project cannot be deleted.');
  }

  const { data: owned } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .maybeSingle();

  if (owned && owned.user_id !== userId) {
    throw new Error('Only the project owner can delete this project.');
  }

  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw error;
  await clearLocalProject(projectId);

  const list = await listProjects();
  if (list.length === 0) {
    return createProject('My Business');
  }

  const stayId =
    projectId === currentProjectId
      ? list[0].id
      : list.find((p) => p.id === currentProjectId)?.id || list[0].id;

  if (projectId === currentProjectId) {
    setStoredProjectId(stayId);
  }

  return { ...(await loadProjectById(stayId)), projectList: list };
}

export async function resetSupabaseProject(state) {
  requireCloud();
  if (state?.isLifeline === true) {
    throw new Error('Το Lifeline δεν μπορεί να μηδενιστεί. Διαγράψε milestones χειροκίνητα αν χρειάζεται.');
  }

  const defaults = processStages(createDefaultStages());
  const reset = {
    ...state,
    projectTitle: 'My Business',
    stages: defaults,
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
    mapTheme: state.mapTheme,
    projectBrief: normalizeProjectBrief(),
    projectRhythm: normalizeProjectRhythm(),
    selectedStageId: null,
    focusMode: false,
    activeView: 'projects',
  };

  if (!state.projectId) {
    throw new Error('No project to reset');
  }

  const supabase = requireSupabase();
  const result = await withProjectWriteLock(state.projectId, () => updateProjectWithLock(
    supabase,
    state.projectId,
    {
      title: 'My Business',
      stages: defaults,
      goals: [],
      notes: [],
      active_view: 'projects',
      focus_mode: false,
      selected_stage_id: null,
    },
    null
  ));

  if (result.error) throw new Error(formatSupabaseError(result.error));
  if (result.conflict) {
    throw new Error(cloudConflictWarning(state.projectTitle));
  }
  return {
    ...reset,
    cloudUpdatedAt: result.updatedAt || state.cloudUpdatedAt || null,
    cloudVersion: result.version ?? state.cloudVersion ?? null,
  };
}

export async function switchActiveProject(projectId) {
  requireCloud();
  setStoredProjectId(projectId);
  const loaded = await loadProjectById(projectId);
  const list = await listProjects();
  return { ...loaded, projectList: list };
}

function lifelineBundleRow(baseTheme, days, hubDays) {
  const mapTheme = mergeMapTheme(baseTheme, {
    lifeline: {
      ...(baseTheme?.lifeline || {}),
      selfHubDays: hubDays,
    },
  });
  return {
    row: sanitizeForDb({
      lifeline_days: days,
      map_theme: mapTheme,
    }),
    mapTheme,
  };
}

/** Persist Self Hub live store + lifeline archive on the lifeline project (background). */
export async function patchLifelineProjectBundle(lifelineProjectId, { selfHubDays, lifelineDays }) {
  requireCloud();
  const supabase = requireSupabase();
  await requireUserId();
  if (!lifelineProjectId) return { ok: false };
  return withProjectWriteLock(lifelineProjectId, () => patchLifelineProjectBundleBody(
    supabase,
    lifelineProjectId,
    { selfHubDays, lifelineDays }
  ));
}

async function patchLifelineProjectBundleBody(supabase, lifelineProjectId, { selfHubDays, lifelineDays }) {
  const loaded = await loadProjectById(lifelineProjectId);
  const incomingDays =
    lifelineDays != null ? normalizeLifelineDays(lifelineDays) : normalizeLifelineDays(loaded.lifelineDays);
  const mergedDays = mergeLifelineDaysMaps(loaded.lifelineDays, incomingDays);
  const mergedHubDays = {
    ...normalizeSelfHubDays(loaded.mapTheme?.lifeline?.selfHubDays),
    ...normalizeSelfHubDays(selfHubDays ?? loaded.mapTheme?.lifeline?.selfHubDays),
  };
  const built = lifelineBundleRow(loaded.mapTheme, mergedDays, mergedHubDays);

  const localState = {
    ...loaded,
    lifelineDays: mergedDays,
    mapTheme: built.mapTheme,
  };
  writeLocalColumnsQuiet(localState, ['lifeline_days', 'map_theme'], []);

  if (!isCloudSyncEnabled()) {
    return {
      ok: true,
      source: 'vault',
      cloudUpdatedAt: loaded.cloudUpdatedAt,
      cloudVersion: loaded.cloudVersion ?? null,
    };
  }

  let first = await updateLifelineWithLock(
    supabase,
    lifelineProjectId,
    built.row,
    expectedRevision(loaded)
  );

  if (first.conflict) {
    const reloaded = await loadProjectById(lifelineProjectId);
    const retryDays = mergeLifelineDaysMaps(reloaded.lifelineDays, incomingDays);
    const retryHub = {
      ...normalizeSelfHubDays(reloaded.mapTheme?.lifeline?.selfHubDays),
      ...normalizeSelfHubDays(selfHubDays ?? {}),
    };
    const retry = lifelineBundleRow(reloaded.mapTheme, retryDays, retryHub);
    first = await updateLifelineWithLock(
      supabase,
      lifelineProjectId,
      retry.row,
      expectedRevision(reloaded)
    );
  }

  if (first.conflict) return conflictSave({ projectTitle: 'Lifeline' }, first);
  if (first.error) return { ok: false, conflict: false, warning: formatSupabaseError(first.error) };
  return okSave('supabase-lifeline', loaded, first, ['lifeline_days', 'map_theme']);
}

const CAPTURE_MERGE_COLUMNS = ['notes', 'backlog', 'stages', 'goals', 'canvas_tasks'];

/** Load a project without switching the active workspace session. */
export async function peekProjectById(projectId) {
  requireCloud();
  const supabase = requireSupabase();
  const userId = await requireUserId();

  const lifelineRow = await loadLifelineRowById(projectId, userId);
  if (lifelineRow) {
    return normalizeRow(lifelineRow, { isLifeline: true, userId });
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Project not found');

  return normalizeRow(data, {
    isLifeline: data.is_lifeline === true,
    userId,
  });
}

async function mergeLocalCaptureBase(peeked) {
  const meta = await readLocalMeta(peeked.projectId);
  if (!meta?.dirtyColumns?.length) return { state: peeked, mergedLocalDirty: false };
  if (!localMetaMatchesCloud(meta, peeked)) return { state: peeked, mergedLocalDirty: false };
  const dirtyCapture = meta.dirtyColumns.filter((column) => CAPTURE_MERGE_COLUMNS.includes(column));
  if (!dirtyCapture.length) return { state: peeked, mergedLocalDirty: false };
  const values = await readLocalColumns(peeked.projectId, dirtyCapture);
  return {
    state: applyColumnValuesToState(peeked, values),
    mergedLocalDirty: true,
  };
}

function stampSavedState(state, result) {
  return {
    ...state,
    cloudUpdatedAt: result?.cloudUpdatedAt || state?.cloudUpdatedAt || null,
    cloudVersion: result?.cloudVersion ?? state?.cloudVersion ?? null,
  };
}

async function persistRemoteCapture(projectId, mutate, { retryCapture } = {}) {
  return withProjectWriteLock(projectId, () => persistRemoteCaptureBody(projectId, mutate, { retryCapture }));
}

async function persistRemoteCaptureBody(projectId, mutate, { retryCapture } = {}) {
  const peeked = await peekProjectById(projectId);
  const sourced = isCloudSyncEnabled() ? peeked : await overlayVaultProjectData(peeked);
  const merged = await mergeLocalCaptureBase(sourced);
  const applied = mutate(merged.state);
  if (!isCloudSyncEnabled()) {
    writeLocalColumnsQuiet(applied.state, applied.columns, []);
    return {
      ...applied,
      projectTitle: applied.state.projectTitle,
      isLifeline: applied.state.isLifeline === true,
      mergedLocalDirty: merged.mergedLocalDirty,
      writtenColumns: applied.columns,
    };
  }
  const result = await saveProjectToSupabase(applied.state, {
    columns: applied.columns,
    unlocked: true,
  });

  if (result.conflict) {
    const fresh = await peekProjectById(projectId);
    const retry = mutate(fresh, retryCapture);
    const retryResult = await saveProjectToSupabase(retry.state, {
      columns: retry.columns,
      unlocked: true,
    });
    if (retryResult.conflict) {
      return {
        ...retry,
        ok: false,
        conflict: true,
        projectTitle: fresh.projectTitle || retry.state?.projectTitle,
        isLifeline: retry.state?.isLifeline === true,
        warning: retryResult.warning || cloudConflictWarning(fresh.projectTitle),
        cloudUpdatedAt: retryResult.cloudUpdatedAt,
        cloudVersion: retryResult.cloudVersion ?? null,
        writtenColumns: retry.columns,
        mergedLocalDirty: false,
      };
    }
    if (!retryResult.ok) {
      throw new Error(retryResult.warning || 'Failed to save capture');
    }
    const saved = stampSavedState(retry.state, retryResult);
    writeLocalColumnsQuiet(saved, retryResult.writtenColumns || retry.columns, []);
    return {
      ...retry,
      state: saved,
      projectTitle: saved.projectTitle,
      isLifeline: saved.isLifeline === true,
      cloudUpdatedAt: retryResult.cloudUpdatedAt,
      cloudVersion: retryResult.cloudVersion ?? null,
      writtenColumns: retryResult.writtenColumns || retry.columns,
      mergedLocalDirty: false,
    };
  }

  if (!result.ok) {
    throw new Error(result.warning || 'Failed to save capture');
  }

  const saved = stampSavedState(applied.state, result);
  writeLocalColumnsQuiet(saved, result.writtenColumns || applied.columns, []);
  return {
    ...applied,
    state: saved,
    projectTitle: saved.projectTitle,
    isLifeline: saved.isLifeline === true,
    cloudUpdatedAt: result.cloudUpdatedAt,
    cloudVersion: result.cloudVersion ?? null,
    writtenColumns: result.writtenColumns || applied.columns,
    mergedLocalDirty: merged.mergedLocalDirty,
  };
}

export async function appendCaptureToRemoteProject(projectId, capture) {
  return persistRemoteCapture(projectId, (state) => applyCaptureToState(state, capture));
}

export async function mutateRemoteProject(projectId, mutate) {
  return persistRemoteCapture(projectId, mutate);
}

export async function removeCaptureFromRemoteProject(projectId, captureRef) {
  return persistRemoteCapture(projectId, (state) => removeCaptureFromState(state, captureRef));
}

export { getStoredProjectId, setStoredProjectId } from './projectSession';
