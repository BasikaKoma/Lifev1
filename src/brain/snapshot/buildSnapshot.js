import { sourceId } from '../context';
import { getSelfHubDayEntry } from '../../utils/selfHubDays';
import { getDayEntry } from '../../utils/lifelineDays';
import { localTodayIsoDate } from '../../utils/selfDateUtils';
import { computeCapacity, deriveCircadianContext, deriveCurrentState } from '../../utils/capacityEngine';
import { computeFocusWindow } from '../../utils/focusWindowEngine';

function compactText(value, max = 280) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function metricNumber(metric) {
  const value = metric?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function summarizeDay(date, lifelineDays, selfHubDays) {
  const day = getDayEntry(lifelineDays, date);
  const hub = getSelfHubDayEntry(selfHubDays, date);
  return {
    date,
    sourceIds: [sourceId('lifeline-day', date), sourceId('self', date)].filter(Boolean),
    notes: compactText(day.notes || hub.journal?.notes, 200),
    todos: (day.todos || []).slice(0, 6).map((todo) => ({
      text: compactText(todo.text, 80),
      done: todo.done === true,
    })),
    capacity: hub.hub?.capacity?.label || null,
    completed: (hub.projects?.completed || day.projectSnapshot?.completed || []).slice(0, 6).map((item) => item.title),
  };
}

function summarizeProject(project, extras = {}) {
  if (!project) return null;
  return {
    id: project.id,
    title: project.title || 'Untitled',
    updatedAt: project.updatedAt || project.updated_at || null,
    currentGoal: extras.currentGoal || null,
    openCheckpoints: extras.openCheckpoints || [],
    notes: extras.notes || [],
    sourceId: sourceId('project', project.id),
  };
}

export function buildSnapshot({
  context,
  policy,
  selfData = null,
  lifelineDays = {},
  selfHubDays = {},
  projectList = [],
  projectCatalog = [],
  mentionedProjects = [],
  localFolders = [],
  currentProject = null,
  stages = [],
  goals = [],
  notes = [],
} = {}) {
  const scopes = policy?.appScopes || {};
  const date = context?.selectedDate || localTodayIsoDate();
  const sources = [];

  const snapshot = {
    capturedAt: context?.capturedAt,
    focus: {
      selectedDate: context?.selectedDate || date,
      selectedProjectId: context?.selectedProjectId || null,
      selectedCheckpointId: context?.selectedCheckpointId || null,
      selectedStageId: context?.selectedStageId || null,
      openedFrom: context?.openedFrom || 'lifeline',
    },
    self: null,
    lifeline: null,
    projects: null,
    mentionedProjects: [],
    localFolders: [],
    currentProject: null,
  };

  if (scopes.self) {
    const readiness = metricNumber(selfData?.metrics?.readiness);
    const sleep = metricNumber(selfData?.metrics?.sleep);
    const circadian = deriveCircadianContext();
    const currentState = deriveCurrentState(null, readiness);
    const capacity = computeCapacity({ recovery: readiness, currentState, circadianContext: circadian });
    const focusWindow = computeFocusWindow({ recovery: readiness, sleepScore: sleep });
    snapshot.self = {
      date,
      readiness,
      sleep,
      capacity: capacity.label,
      focusWindow: focusWindow.status,
      sourceId: sourceId('self', date),
    };
    sources.push(snapshot.self.sourceId);
  }

  if (scopes.lifeline) {
    const dates = Object.keys(lifelineDays || {}).sort().slice(-14);
    if (!dates.includes(date)) dates.push(date);
    snapshot.lifeline = {
      focusDay: summarizeDay(date, lifelineDays, selfHubDays),
      recentDays: dates.slice(-14).map((key) => summarizeDay(key, lifelineDays, selfHubDays)),
    };
    sources.push(...(snapshot.lifeline.focusDay.sourceIds || []));
  }

  if (scopes.projects) {
    const catalog = (projectCatalog || []).length
      ? projectCatalog
      : (projectList || []).slice(0, 40).map((project) => summarizeProject(project));
    snapshot.projects = catalog.filter((project) => project && project.isLifeline !== true).slice(0, 40);
    snapshot.lifelineProject = catalog.find((project) => project?.isLifeline === true) || null;
    snapshot.mentionedProjects = (mentionedProjects || []).slice(0, 6);
    if (!scopes.notes) {
      snapshot.projects = snapshot.projects.map((project) => ({ ...project, notes: [] }));
      if (snapshot.lifelineProject) snapshot.lifelineProject = { ...snapshot.lifelineProject, notes: [] };
      snapshot.mentionedProjects = snapshot.mentionedProjects.map((project) => ({ ...project, notes: [] }));
    }
    for (const project of snapshot.mentionedProjects) {
      if (project?.sourceId) sources.push(project.sourceId);
    }
    snapshot.app = {
      scope: 'full',
      projectCount: snapshot.projects.length,
      note: 'focus/currentProject is only what the user is looking at. projects[] is the full app catalog.',
    };
    const currentGoals = (goals || []).filter((goal) => goal.status === 'Current' || goal.status === 'current');
    const openCheckpoints = [];
    for (const stage of stages || []) {
      for (const checkpoint of stage.checkpoints || []) {
        if (checkpoint.done || checkpoint.status === 'done') continue;
        openCheckpoints.push({
          id: checkpoint.id,
          title: compactText(checkpoint.title, 80),
          stageId: stage.id,
          sourceId: sourceId('checkpoint', checkpoint.id),
        });
        if (openCheckpoints.length >= 8) break;
      }
      if (openCheckpoints.length >= 8) break;
    }
    const selectedCheckpoint = openCheckpoints.find((item) => item.id === context?.selectedCheckpointId)
      || (stages || []).flatMap((stage) => stage.checkpoints || []).find((item) => item.id === context?.selectedCheckpointId);
    const selectedStage = (stages || []).find((stage) => stage.id === context?.selectedStageId);

    snapshot.currentProject = summarizeProject(currentProject, {
      currentGoal: currentGoals[0]?.title || null,
      openCheckpoints: openCheckpoints.map((item) => item.title),
      notes: scopes.notes
        ? (notes || []).slice(0, 6).map((note) => compactText(note.title || note.body, 80))
        : [],
    });
    if (snapshot.currentProject) sources.push(snapshot.currentProject.sourceId);
    if (selectedCheckpoint) {
      snapshot.focus.checkpointTitle = selectedCheckpoint.title;
      sources.push(sourceId('checkpoint', selectedCheckpoint.id));
    }
    if (selectedStage) {
      snapshot.focus.stageTitle = selectedStage.title;
      sources.push(sourceId('project', currentProject?.id));
    }
  }

  if (Array.isArray(localFolders) && localFolders.length) {
    snapshot.localFolders = localFolders.map((folder) => ({
      rootId: folder.rootId,
      displayName: folder.displayName,
      entries: (folder.entries || []).slice(0, 40).map((entry) => ({
        name: entry.name,
        kind: entry.kind,
        relativePath: entry.relativePath,
      })),
    }));
    for (const folder of snapshot.localFolders) {
      sources.push(`file:${folder.rootId}`);
    }
  }

  snapshot.sources = [...new Set(sources.filter(Boolean))];
  return snapshot;
}

export function redactSnapshotForCloud(snapshot) {
  return {
    capturedAt: snapshot?.capturedAt || null,
    focus: snapshot?.focus || null,
    redacted: true,
    reason: 'cloudMaySeeAppData is off',
    sources: [],
  };
}
