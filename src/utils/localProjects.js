import { generateId, createDefaultStages, createStarterStages, migrateProjectGoals, reindexGoals } from '../data/templates';
import { processStages } from './logic';
import { DEFAULT_MAP_THEME } from './mapTheme';
import { createLifelineProject, findLifelineProject, isLifelineProject } from './lifeline';
import { normalizeLifelineDays } from './lifelineDays';
import { normalizeProjectBrief } from './projectBrief';
import { normalizeActiveView } from './appNavigation';

const STORAGE_KEY = 'business-evolution-map';
const STORAGE_KEY_V2 = 'business-evolution-map-v2';

export function createEmptyProject(title = 'My Business', { isLifeline = false } = {}) {
  if (isLifeline) return createLifelineProject();

  return {
    id: `local-${generateId()}`,
    title,
    isLifeline: false,
    lifelineAnchorDate: null,
    stages: processStages(createStarterStages()),
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
    mapTheme: { ...DEFAULT_MAP_THEME },
    projectBrief: normalizeProjectBrief(),
    selectedStageId: null,
    focusMode: false,
    activeView: 'projects',
  };
}

function migrateV1ToV2(v1) {
  const project = {
    id: `local-${generateId()}`,
    title: v1.projectTitle || 'My Business',
    stages: v1.stages || processStages(createDefaultStages()),
    notes: v1.notes || [],
    selectedStageId: v1.selectedStageId || null,
    focusMode: v1.focusMode || false,
    activeView: normalizeActiveView(v1.activeView || 'projects'),
  };
  return { activeProjectId: project.id, projects: [project] };
}

export function loadLocalWorkspace() {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const data = JSON.parse(rawV2);
      const workspace = ensureLocalLifeline({
        activeProjectId: data.activeProjectId,
        projects: (data.projects || []).map(normalizeLocalProject),
      });
      saveLocalWorkspace(workspace);
      return workspace;
    }

    const rawV1 = localStorage.getItem(STORAGE_KEY);
    if (rawV1) {
      const v1 = JSON.parse(rawV1);
      const workspace = migrateV1ToV2(v1);
      saveLocalWorkspace(workspace);
      return workspace;
    }
  } catch {
    /* fall through */
  }

  const lifeline = createLifelineProject();
  const project = createEmptyProject();
  const workspace = { activeProjectId: lifeline.id, projects: [lifeline, project] };
  saveLocalWorkspace(workspace);
  return workspace;
}

export function ensureLocalLifeline(workspace) {
  if (findLifelineProject(workspace.projects)) return workspace;
  const lifeline = createLifelineProject();
  return {
    ...workspace,
    projects: [lifeline, ...workspace.projects],
  };
}

function normalizeLocalProject(p) {
  const stages = processStages(p.stages || createDefaultStages());
  const { stages: migratedStages, goals } = migrateProjectGoals(stages, p.goals);
  return {
    ...p,
    stages: processStages(migratedStages),
    goals: reindexGoals(goals),
    notes: p.notes || [],
    backlog: p.backlog || [],
    canvasConnections: p.canvasConnections || [],
    canvasStickies: p.canvasStickies || [],
    canvasObstacles: p.canvasObstacles || [],
    canvasResources: p.canvasResources || [],
    canvasTasks: p.canvasTasks || [],
    canvasInk: p.canvasInk || [],
    whiteboardStrokes: p.whiteboardStrokes || [],
    mapTheme: p.mapTheme || { ...DEFAULT_MAP_THEME },
    projectBrief: normalizeProjectBrief(p.projectBrief || p.brief),
    activeView: normalizeActiveView(p.activeView || 'projects'),
    isLifeline: isLifelineProject(p),
    lifelineAnchorDate: p.lifelineAnchorDate || p.lifeline_anchor_date || null,
    lifelineDays: normalizeLifelineDays(p.lifelineDays || p.lifeline_days),
  };
}

export function saveLocalWorkspace(workspace) {
  localStorage.setItem(
    STORAGE_KEY_V2,
    JSON.stringify({
      activeProjectId: workspace.activeProjectId,
      projects: workspace.projects.map((p) => ({
        ...p,
        stages: p.stages,
      })),
    })
  );
}

export function saveLocalProject(state) {
  if (!state?.projectId) return;

  const workspace = loadLocalWorkspace();
  const idx = workspace.projects.findIndex((p) => p.id === state.projectId);
  const row = {
    id: state.projectId,
    title: state.projectTitle,
    stages: state.stages,
    goals: state.goals || [],
    notes: state.notes || [],
    backlog: state.backlog || [],
    canvasConnections: state.canvasConnections || [],
    canvasStickies: state.canvasStickies || [],
    canvasObstacles: state.canvasObstacles || [],
    canvasResources: state.canvasResources || [],
    canvasTasks: state.canvasTasks || [],
    canvasInk: state.canvasInk || [],
    whiteboardStrokes: state.whiteboardStrokes || [],
    mapTheme: state.mapTheme || { ...DEFAULT_MAP_THEME },
    projectBrief: normalizeProjectBrief(state.projectBrief),
    selectedStageId: state.selectedStageId,
    focusMode: state.focusMode,
    activeView: state.activeView,
    isLifeline: state.isLifeline === true,
    lifelineAnchorDate: state.lifelineAnchorDate || null,
    lifelineDays: normalizeLifelineDays(state.lifelineDays),
  };

  if (idx >= 0) {
    workspace.projects[idx] = row;
  } else {
    workspace.projects.push(row);
  }
  workspace.activeProjectId = state.projectId;
  saveLocalWorkspace(workspace);
}

export function clearLocalStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY_V2);
}

export function projectStateFromLocal(project) {
  const normalized = normalizeLocalProject(project);
  return {
    projectId: normalized.id,
    projectTitle: normalized.title,
    stages: normalized.stages,
    goals: normalized.goals,
    notes: normalized.notes,
    backlog: normalized.backlog || [],
    canvasConnections: normalized.canvasConnections || [],
    canvasStickies: normalized.canvasStickies || [],
    canvasObstacles: normalized.canvasObstacles || [],
    canvasResources: normalized.canvasResources || [],
    canvasTasks: normalized.canvasTasks || [],
    canvasInk: normalized.canvasInk || [],
    whiteboardStrokes: normalized.whiteboardStrokes || [],
    mapTheme: normalized.mapTheme || { ...DEFAULT_MAP_THEME },
    projectBrief: normalizeProjectBrief(normalized.projectBrief),
    selectedStageId: normalized.selectedStageId || null,
    focusMode: normalized.focusMode || false,
    activeView: normalized.activeView,
    isLifeline: normalized.isLifeline === true,
    lifelineAnchorDate: normalized.lifelineAnchorDate || null,
    lifelineDays: normalized.lifelineDays || {},
  };
}

export function updateLocalProjectAnchor(projectId, anchorDate) {
  const workspace = loadLocalWorkspace();
  const idx = workspace.projects.findIndex((p) => p.id === projectId);
  if (idx < 0) return false;
  workspace.projects[idx] = {
    ...workspace.projects[idx],
    lifelineAnchorDate: anchorDate,
  };
  saveLocalWorkspace(workspace);
  return true;
}

export function loadLocalLifelineAnchors() {
  const workspace = loadLocalWorkspace();
  return workspace.projects
    .filter((p) => !isLifelineProject(p))
    .map((p) => ({
      id: p.id,
      title: p.title,
      lifelineAnchorDate: p.lifelineAnchorDate || p.lifeline_anchor_date || null,
    }));
}
