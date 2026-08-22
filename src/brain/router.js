import { compactText, findMentionedProjects, normalizeSearchText } from './snapshot/loadAppCatalog';

const CREATE_RE = /φτιαξ|δημιουργησ|κανε το|καντο|create it|προσθεσ|ftiax|dimiourg/;
const TODAY_RE = /σημερα|τωρα|να κανω|next move|επομενη κινηση|τι να κανω|τι καν|today/;
const STRATEGY_RE = /χρονι|στρατηγ|προσεγγιση|portfolio|2 χρον|διετ|συνολικ|ολα τα project|ολα τα προτζεκτ|δυο χρον/;

export function userAskedToCreate(question) {
  return CREATE_RE.test(normalizeSearchText(question));
}

export function routeQuestion(question, { catalog = [], kind = 'ask' } = {}) {
  const text = normalizeSearchText(question);
  const mentioned = findMentionedProjects(question, catalog);

  if (kind === 'briefing') return { mode: 'briefing', mentioned };
  if (kind === 'analyze') return { mode: 'analyze', mentioned };
  if (userAskedToCreate(question)) return { mode: 'create', mentioned };

  const today = TODAY_RE.test(text);
  const strategy = STRATEGY_RE.test(text);

  if (mentioned.length === 1 && !strategy) {
    return { mode: 'project', focusId: mentioned[0].id, mentioned };
  }
  if (today && !strategy) return { mode: 'today', mentioned };
  if (strategy) return { mode: 'strategy', mentioned };
  return { mode: 'default', mentioned };
}

function compactProjectCard(project, depth = 'full') {
  if (!project) return null;
  if (depth === 'title') {
    return {
      id: project.id,
      title: project.title,
      sourceId: project.sourceId,
      progress: project.progress || 0,
      checkpointCounts: project.checkpointCounts || { open: 0, done: 0 },
      nextMove: project.nextMove || null,
      topBlocker: project.topBlocker || null,
      openCheckpoints: [],
      notes: [],
      recentlyDone: [],
      currentGoals: [],
      brief: null,
    };
  }
  if (depth === 'brief') {
    return {
      ...project,
      notes: (project.notes || []).slice(0, 2).map((note) => ({
        ...note,
        body: compactText(note.body, 80),
      })),
      openCheckpoints: (project.openCheckpoints || []).slice(0, 4),
    };
  }
  return project;
}

function scoreProject(project) {
  const open = project?.checkpointCounts?.open || 0;
  const stuck = project?.topBlocker ? 4 : 0;
  const progress = Number(project?.progress) || 0;
  return stuck + open + (progress > 0 && progress < 80 ? 2 : 0);
}

function pickProjects(catalog, { ids = [], limit = 8, depth = 'full' } = {}) {
  const wanted = new Set((ids || []).filter(Boolean));
  const regular = (catalog || []).filter((project) => project && project.isLifeline !== true);
  const selected = [];
  const seen = new Set();

  const take = (project) => {
    if (!project?.id || seen.has(project.id)) return;
    seen.add(project.id);
    selected.push(compactProjectCard(project, depth));
  };

  for (const project of regular) {
    if (wanted.has(project.id)) take(project);
  }

  const rest = regular
    .filter((project) => !seen.has(project.id))
    .sort((a, b) => scoreProject(b) - scoreProject(a));
  for (const project of rest) {
    if (selected.length >= limit) break;
    take(project);
  }

  return selected.filter(Boolean);
}

export function applyRouteToSnapshot(snapshot, route, catalog = []) {
  if (!snapshot) return snapshot;
  const mentionedIds = (route?.mentioned || []).map((project) => project.id);
  const next = {
    ...snapshot,
    route: {
      mode: route?.mode || 'default',
      focusId: route?.focusId || null,
      mentioned: (route?.mentioned || []).map((project) => ({
        id: project.id,
        title: project.title,
        sourceId: project.sourceId,
      })),
    },
  };

  const days = snapshot.lifeline?.recentDays || [];
  const keepDay = (day, index, max) => day?.hadWork || index >= days.length - max;
  const finish = (payload) => ({
    ...payload,
    coverage: {
      ...(snapshot.coverage || {}),
      projectCount: payload.projects?.length || 0,
      catalogCount: snapshot.coverage?.projectCount
        || catalog.filter((project) => project && project.isLifeline !== true).length,
      lifelineDays: payload.lifeline?.recentDays?.length || 0,
      routed: route?.mode || 'default',
    },
  });

  if (route?.mode === 'strategy') {
    next.projects = pickProjects(catalog, { ids: mentionedIds, limit: 20, depth: 'brief' });
    next.app = { ...(snapshot.app || {}), scope: 'strategy' };
    return finish(next);
  }

  if (route?.mode === 'today') {
    next.lifeline = {
      focusDay: snapshot.lifeline?.focusDay || null,
      recentDays: days.filter((day, index) => keepDay(day, index, 7)).slice(-7),
    };
    next.projects = pickProjects(catalog, {
      ids: [...mentionedIds, snapshot.currentProject?.id],
      limit: 2,
      depth: 'full',
    });
    next.mentionedProjects = (route.mentioned || []).slice(0, 2);
    next.app = { ...(snapshot.app || {}), scope: 'today' };
    return finish(next);
  }

  if (route?.mode === 'project') {
    const focusId = route.focusId || mentionedIds[0];
    next.lifeline = {
      focusDay: snapshot.lifeline?.focusDay || null,
      recentDays: days.filter((day) => day?.hadWork).slice(-5),
    };
    next.projects = pickProjects(catalog, {
      ids: [focusId, snapshot.currentProject?.id],
      limit: 2,
      depth: 'full',
    });
    next.mentionedProjects = (route.mentioned || []).slice(0, 2);
    next.app = { ...(snapshot.app || {}), scope: 'project' };
    return finish(next);
  }

  if (route?.mode === 'create') {
    next.projects = pickProjects(catalog, {
      ids: [...mentionedIds, snapshot.currentProject?.id],
      limit: 6,
      depth: 'title',
    });
    next.mentionedProjects = (route.mentioned || []).slice(0, 4);
    next.lifeline = {
      focusDay: snapshot.lifeline?.focusDay || null,
      recentDays: days.filter((day) => day?.hadWork).slice(-5),
    };
    next.app = { ...(snapshot.app || {}), scope: 'create' };
    return finish(next);
  }

  if (route?.mode === 'briefing') {
    next.lifeline = {
      focusDay: snapshot.lifeline?.focusDay || null,
      recentDays: days.slice(-14),
    };
    next.projects = pickProjects(catalog, { ids: mentionedIds, limit: 16, depth: 'brief' });
    next.app = { ...(snapshot.app || {}), scope: 'briefing' };
    return finish(next);
  }

  if (route?.mode === 'analyze') {
    next.lifeline = {
      focusDay: snapshot.lifeline?.focusDay || null,
      recentDays: days.slice(-14),
    };
    next.projects = pickProjects(catalog, { ids: mentionedIds, limit: 16, depth: 'brief' });
    next.app = { ...(snapshot.app || {}), scope: 'analyze' };
    return finish(next);
  }

  next.lifeline = {
    focusDay: snapshot.lifeline?.focusDay || null,
    recentDays: days.filter((day, index) => keepDay(day, index, 14)).slice(-14),
  };
  next.projects = pickProjects(catalog, {
    ids: [...mentionedIds, snapshot.currentProject?.id],
    limit: 8,
    depth: 'brief',
  });
  next.app = { ...(snapshot.app || {}), scope: 'default' };
  return finish(next);
}
