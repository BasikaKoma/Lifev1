import { sourceId } from '../context';
import { APP_MODEL } from '../appModel';
import { getSelfHubDayEntry } from '../../utils/selfHubDays';
import { collectCompletedItemsForDate, getDayEntry } from '../../utils/lifelineDays';
import { addDays, toDateString } from '../../utils/lifeline';
import { localTodayIsoDate } from '../../utils/selfDateUtils';
import { computeCapacity, deriveCircadianContext, deriveCurrentState } from '../../utils/capacityEngine';
import { computeFocusWindow } from '../../utils/focusWindowEngine';
import { readBrandBundleLocal } from '../../lib/brand/store';
import { itemsByStage } from '../../lib/brand/schema';
import { readNutritionBundleLocal } from '../../lib/nutrition/store';
import { activePlan, profileTargets } from '../../lib/nutrition/schema';

function compactText(value, max = 280) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function metricNumber(metric) {
  const value = metric?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metricFromList(metrics, id) {
  const all = [...(metrics?.leftMetrics || []), ...(metrics?.rightMetrics || [])];
  const found = all.find((item) => item?.id === id);
  return metricNumber(found);
}

function lastNDates(endDate, count) {
  const end = toDateString(endDate) || localTodayIsoDate();
  const dates = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    dates.push(addDays(end, -i));
  }
  return dates.filter(Boolean);
}

function summarizeDay(date, lifelineDays, selfHubDays, projectActivity = []) {
  const day = getDayEntry(lifelineDays, date);
  const hub = getSelfHubDayEntry(selfHubDays, date);
  const todos = day.todos?.length ? day.todos : (hub.journal?.todos || []);
  const completed = collectCompletedItemsForDate(projectActivity, date);
  const storedCompleted = hub.projects?.completed || day.projectSnapshot?.completed || [];
  const completedTitles = (completed.length ? completed : storedCompleted)
    .slice(0, 8)
    .map((item) => compactText(item.projectTitle ? `${item.projectTitle}: ${item.title}` : item.title, 90));
  const notes = compactText(day.notes || hub.journal?.notes, 220);
  const thoughts = (day.thoughts || []).slice(-6).map((thought) => compactText(thought.text, 80));
  const sleep = metricFromList(day.metrics, 'sleep');
  const readiness = metricFromList(day.metrics, 'readiness');
  const dayScore = typeof day.metrics?.dayScore?.value === 'number' ? day.metrics.dayScore.value : null;
  const todosDone = todos.filter((todo) => todo.done === true).length;

  return {
    date,
    sourceIds: [sourceId('lifeline-day', date), sourceId('self', date)].filter(Boolean),
    notes,
    thoughts,
    sleep,
    readiness,
    dayScore,
    capacity: hub.hub?.capacity?.label || day.hubSnapshot?.capacity?.label || null,
    todos: { done: todosDone, total: todos.length },
    completed: completedTitles,
    hadWork: completedTitles.length > 0 || todosDone > 0 || Boolean(notes) || thoughts.length > 0,
  };
}

function buildPatterns(recentDays, projects) {
  const scored = recentDays.filter((day) => day.sleep != null || day.readiness != null || day.dayScore != null);
  const avg = (key) => {
    const values = scored.map((day) => day[key]).filter((value) => typeof value === 'number');
    if (!values.length) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  };
  const daysWithWork = recentDays.filter((day) => day.hadWork).length;
  const emptyDays = recentDays.filter((day) => !day.hadWork).length;
  const byProject = {};
  for (const project of projects || []) {
    if (project?.isLifeline) continue;
    byProject[project.title] = {
      title: project.title,
      sourceId: project.sourceId,
      progress: project.progress || 0,
      open: project.checkpointCounts?.open || 0,
      done: project.checkpointCounts?.done || 0,
      next: project.nextMove?.action || null,
      blocker: project.topBlocker?.title || null,
    };
  }

  return {
    windowDays: recentDays.length,
    daysWithWork,
    emptyDays,
    avgSleep: avg('sleep'),
    avgReadiness: avg('readiness'),
    avgDayScore: avg('dayScore'),
    portfolio: Object.values(byProject).slice(0, 20),
    stuck: Object.values(byProject)
      .filter((item) => item.blocker || (item.open > 0 && item.progress < 20))
      .slice(0, 8),
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
  projectActivity = [],
  mentionedProjects = [],
  localFolders = [],
  currentProject = null,
  stages = [],
  goals = [],
  notes = [],
  northStars = [],
} = {}) {
  const scopes = policy?.appScopes || {};
  const includeSelf = scopes.self !== false;
  const includeLifeline = scopes.lifeline !== false;
  const includeBrand = scopes.brand !== false;
  const includeNutrition = scopes.nutrition !== false;
  const includeProjects = scopes.projects !== false;
  const includeNotes = scopes.notes !== false;
  const date = context?.selectedDate || localTodayIsoDate();
  const sources = [];

  const snapshot = {
    capturedAt: context?.capturedAt,
    role: 'You are the whole-app advisor for this person. SNAPSHOT is the evidence. Brain settings are only voice/preferences.',
    focus: {
      selectedDate: context?.selectedDate || date,
      selectedProjectId: context?.selectedProjectId || null,
      selectedCheckpointId: context?.selectedCheckpointId || null,
      selectedStageId: context?.selectedStageId || null,
      openedFrom: context?.openedFrom || 'lifeline',
    },
    self: null,
    lifeline: { focusDay: null, recentDays: [], northStars: [] },
    brand: null,
    nutrition: null,
    projects: [],
    mentionedProjects: [],
    localFolders: [],
    currentProject: null,
    patterns: null,
  };

  if (includeSelf) {
    const readiness = metricNumber(selfData?.metrics?.readiness);
    const sleep = metricNumber(selfData?.metrics?.sleep);
    const activity = metricNumber(selfData?.metrics?.activity);
    const circadian = deriveCircadianContext();
    const currentState = deriveCurrentState(null, readiness);
    const capacity = computeCapacity({ recovery: readiness, currentState, circadianContext: circadian });
    const focusWindow = computeFocusWindow({ recovery: readiness, sleepScore: sleep });
    snapshot.self = {
      date,
      readiness,
      sleep,
      activity,
      emotionalState: selfData?.metrics?.emotionalState?.status || null,
      systemStatus: selfData?.systemStatus?.label || null,
      capacity: capacity.label,
      focusWindow: focusWindow.status,
      nextMove: compactText(selfData?.metrics?.nextMove?.message, 160),
      sourceId: sourceId('self', date),
    };
    sources.push(snapshot.self.sourceId);
  }

  const activityRows = (projectActivity || []).length
    ? projectActivity
    : (projectCatalog || []).map((project) => ({
      id: project.id,
      title: project.title,
      stages: [],
      notes: project.notes || [],
    }));

  if (includeLifeline) {
    const recentDays = lastNDates(date, 21).map((key) => summarizeDay(key, lifelineDays, selfHubDays, activityRows));
    snapshot.lifeline = {
      focusDay: summarizeDay(date, lifelineDays, selfHubDays, activityRows),
      recentDays,
      northStars: (northStars || []).map((star) => compactText(star?.title, 80)).filter(Boolean).slice(0, 3),
    };
    sources.push(...(snapshot.lifeline.focusDay.sourceIds || []));
    for (const day of recentDays) {
      if (day.hadWork) sources.push(...(day.sourceIds || []));
    }
  }

  if (includeBrand) {
    const brand = readBrandBundleLocal();
    const staged = itemsByStage(brand.items || []);
    snapshot.brand = {
      handle: brand.handle || brand.dna?.handle || null,
      dna: {
        whoYouAre: compactText(brand.dna?.whoYouAre, 280),
        standFor: compactText(brand.dna?.standFor, 220),
        audience: compactText(brand.dna?.audience, 180),
        voice: compactText(brand.dna?.voice, 220),
        donts: compactText(brand.dna?.donts, 180),
      },
      pipeline: {
        idea: staged.idea.length,
        selected: staged.selected.length,
        drafting: staged.drafting.length,
        ready: staged.ready.length,
        published: staged.published.length,
      },
      activeDraft: brand.activeItemId
        ? compactText((brand.items || []).find((item) => item.id === brand.activeItemId)?.title, 80)
        : compactText((brand.items || []).find((item) => item.stage === 'drafting')?.title, 80),
      recentItems: (brand.items || []).slice(0, 8).map((item) => ({
        id: item.id,
        stage: item.stage,
        kind: item.kind,
        title: compactText(item.title, 80),
        sourceLabel: compactText(item.sourceLabel, 60),
        sourceId: sourceId('brand', item.id),
      })),
      sourceId: sourceId('brand', 'dna'),
      rule: 'Content must start from lived experience in items/signals. Never invent generic LinkedIn advice. Nobelle is out. Market Portal only as a lesson.',
    };
    sources.push(snapshot.brand.sourceId);
  }

  if (includeNutrition) {
    const nutrition = readNutritionBundleLocal();
    const plan = activePlan(nutrition);
    const targets = profileTargets(nutrition.profile);
    snapshot.nutrition = {
      goal: nutrition.profile?.goal || 'maintenance',
      calorieTarget: targets.calories,
      proteinTarget: targets.protein,
      targetsAreSuggestions: Boolean(targets.caloriesAreSuggestion || targets.proteinAreSuggestion),
      mealsPerDay: nutrition.profile?.mealsPerDay || 4,
      allergies: nutrition.profile?.allergies || [],
      activePlan: plan
        ? {
          startDate: plan.startDate,
          days: plan.days,
          avgCalories: plan.weeklyTotals?.avgCalories || null,
          avgProtein: plan.weeklyTotals?.avgProtein || null,
        }
        : null,
      pantryCount: (nutrition.pantry || []).length,
      sourceId: sourceId('nutrition', 'profile'),
      rule: 'Calories and macros are user targets or editable suggestions, not medical advice. Nutrition is an app screen, not a project.',
    };
    sources.push(snapshot.nutrition.sourceId);
  }

  if (includeProjects) {
    const catalog = (projectCatalog || []).length
      ? projectCatalog
      : (projectList || []).slice(0, 40).map((project) => summarizeProject(project));
    snapshot.projects = catalog.filter((project) => project && project.isLifeline !== true).slice(0, 40);
    snapshot.lifelineProject = catalog.find((project) => project?.isLifeline === true) || null;
    snapshot.mentionedProjects = (mentionedProjects || []).slice(0, 6);
    if (!includeNotes) {
      snapshot.projects = snapshot.projects.map((project) => ({ ...project, notes: [] }));
      if (snapshot.lifelineProject) snapshot.lifelineProject = { ...snapshot.lifelineProject, notes: [] };
      snapshot.mentionedProjects = snapshot.mentionedProjects.map((project) => ({ ...project, notes: [] }));
    }
    for (const project of snapshot.projects) {
      if (project?.sourceId) sources.push(project.sourceId);
      for (const checkpoint of project.openCheckpoints || []) {
        if (checkpoint?.sourceId) sources.push(checkpoint.sourceId);
      }
      for (const note of project.notes || []) {
        if (note?.sourceId) sources.push(note.sourceId);
      }
    }
    snapshot.app = {
      scope: 'full',
      projectCount: snapshot.projects.length,
      note: 'Use projects[].openCheckpoints, notes, nextMove, blockers, and lifeline.recentDays. focus/currentProject is only the open screen.',
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
      notes: includeNotes
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

  snapshot.patterns = buildPatterns(snapshot.lifeline?.recentDays || [], snapshot.projects || []);
  const coverage = {
    loaded: true,
    self: Boolean(snapshot.self?.sourceId),
    lifelineDays: snapshot.lifeline?.recentDays?.length || 0,
    projectCount: snapshot.projects?.length || 0,
    openCheckpoints: (snapshot.projects || []).reduce((sum, project) => sum + (project.openCheckpoints?.length || 0), 0),
    notes: (snapshot.projects || []).reduce((sum, project) => sum + (project.notes?.length || 0), 0),
    currentProject: snapshot.currentProject?.title || null,
    brand: Boolean(snapshot.brand?.sourceId),
    nutrition: Boolean(snapshot.nutrition?.sourceId),
  };

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

  snapshot.sources = [...new Set(sources.filter(Boolean))].slice(0, 80);
  return { coverage, appModel: APP_MODEL, ...snapshot };
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
