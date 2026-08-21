import { sourceId } from '../context';
import {
  getCurrentStage,
  getNextBestMove,
  getStageProgress,
  getTopBlocker,
  isCheckpointDone,
} from '../../utils/logic';
import { loadAllProjectsForBrain, loadProjectById } from '../../utils/supabaseDb';

const PROJECT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function compactText(value, max = 280) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function briefText(project) {
  const brief = project.brief || project.projectBrief;
  if (!brief) return null;
  if (typeof brief === 'string') return compactText(brief, 160);
  return compactText(brief.summary || brief.oneLiner || brief.goal || '', 160) || null;
}

export function summarizeProjectForBrain(project, { includeNotes = true } = {}) {
  if (!project) return null;
  const id = project.id || project.projectId;
  const stages = project.stages || [];
  const currentStage = getCurrentStage(stages);
  const nextMove = getNextBestMove(stages);
  const blocker = getTopBlocker(stages);
  const goals = (project.goals || []).filter((goal) => {
    const status = String(goal.status || '').toLowerCase();
    return status === 'current' || status === 'active' || status === '';
  });

  const openCheckpoints = [];
  for (const stage of stages) {
    for (const checkpoint of stage.checkpoints || []) {
      if (isCheckpointDone(checkpoint)) continue;
      openCheckpoints.push({
        id: checkpoint.id,
        title: compactText(checkpoint.title, 80),
        stageTitle: compactText(stage.title, 60),
        sourceId: sourceId('checkpoint', checkpoint.id),
      });
      if (openCheckpoints.length >= 6) break;
    }
    if (openCheckpoints.length >= 6) break;
  }

  return {
    id,
    title: project.title || project.projectTitle || 'Untitled',
    isLifeline: project.isLifeline === true,
    updatedAt: project.updatedAt || project.cloudUpdatedAt || project.updated_at || null,
    sourceId: sourceId('project', id),
    currentStage: currentStage
      ? {
        id: currentStage.id,
        title: currentStage.title,
        status: currentStage.status || null,
        progress: getStageProgress(currentStage),
      }
      : null,
    nextMove: nextMove
      ? {
        action: nextMove.action,
        reason: nextMove.reason,
        type: nextMove.type || null,
      }
      : null,
    currentGoals: goals.slice(0, 4).map((goal) => compactText(goal.title, 80)),
    openCheckpoints,
    topBlocker: blocker
      ? { title: compactText(blocker.title, 80), severity: blocker.severity || null }
      : null,
    notes: includeNotes
      ? (project.notes || []).slice(0, 5).map((note) => compactText(note.title || note.body, 80))
      : [],
    brief: briefText(project),
  };
}

export async function loadAppCatalog() {
  const rows = await loadAllProjectsForBrain();
  return rows.map((row) => summarizeProjectForBrain(row)).filter(Boolean);
}

export function catalogFromProjectList(projectList = []) {
  return (projectList || [])
    .map((project) => summarizeProjectForBrain({
      id: project.id,
      title: project.title,
      isLifeline: project.isLifeline === true,
      updatedAt: project.updatedAt || project.updated_at || null,
      stages: project.stages || [],
      goals: project.goals || [],
      notes: project.notes || [],
    }))
    .filter(Boolean);
}

export function findProjectsByHint(catalog, hint) {
  const needle = normalizeSearchText(hint);
  if (!needle || needle.length < 2) return [];
  const exact = catalog.filter((project) => normalizeSearchText(project.title) === needle);
  if (exact.length) return exact;
  return catalog.filter((project) => {
    const title = normalizeSearchText(project.title);
    return title.length >= 2 && (title.includes(needle) || needle.includes(title));
  });
}

export function findMentionedProjects(text, catalog) {
  const haystack = normalizeSearchText(text);
  if (!haystack) return [];
  return (catalog || []).filter((project) => {
    const title = normalizeSearchText(project.title);
    return title.length >= 2 && haystack.includes(title);
  });
}

function fromLoadedProject(data) {
  return summarizeProjectForBrain({
    id: data.projectId,
    title: data.projectTitle,
    isLifeline: data.isLifeline === true,
    stages: data.stages,
    goals: data.goals,
    notes: data.notes,
    brief: data.projectBrief,
    updatedAt: data.cloudUpdatedAt,
  });
}

export async function resolveProjectQuery(query, catalog = []) {
  const raw = String(query || '').trim();
  if (!raw) throw new Error('Missing project query.');

  if (PROJECT_UUID.test(raw)) {
    return fromLoadedProject(await loadProjectById(raw));
  }

  const matches = findProjectsByHint(catalog, raw);
  if (matches.length === 1) {
    return fromLoadedProject(await loadProjectById(matches[0].id));
  }
  if (matches.length > 1) {
    return {
      ambiguous: true,
      matches: matches.map((project) => ({
        id: project.id,
        title: project.title,
        sourceId: project.sourceId,
      })),
    };
  }

  throw new Error(`Δεν βρέθηκε project με όνομα ή id «${raw}».`);
}
