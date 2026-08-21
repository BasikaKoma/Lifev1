import {
  createEmptyCanvasTask,
  createEmptyGoal,
  createEmptyIdea,
  generateId,
  reindexGoals,
} from '../data/templates';
import { processStages } from './logic';

export const CAPTURE_TYPES = ['note', 'idea', 'task', 'goal'];

export const CAPTURE_TYPE_LABELS = {
  note: 'Σημείωση',
  idea: 'Ιδέα',
  task: 'Task',
  goal: 'Στόχος',
};

const MIN_NAME_LEN = 3;

export function normalizeCaptureText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u03c2/g, '\u03c3');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleAppearsIn(haystackNorm, titleNorm) {
  if (!titleNorm || titleNorm.length < 2) return false;
  if (titleNorm.length < MIN_NAME_LEN) {
    return haystackNorm.split(/[^\p{L}\p{N}]+/u).includes(titleNorm);
  }
  const pattern = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(titleNorm)}(?:$|[^\\p{L}\\p{N}])`,
    'u'
  );
  return pattern.test(haystackNorm);
}

function findBestNamedMatch(text, entities) {
  const haystack = normalizeCaptureText(text);
  let best = null;
  for (const entity of entities || []) {
    const title = (entity.title || '').trim();
    if (!title) continue;
    const titleNorm = normalizeCaptureText(title);
    if (!titleAppearsIn(haystack, titleNorm)) continue;
    if (
      !best ||
      titleNorm.length > best.titleNorm.length ||
      (titleNorm.length === best.titleNorm.length && entity.prefer)
    ) {
      best = { entity, titleNorm };
    }
  }
  return best?.entity || null;
}

function extractQuoted(text) {
  const m = text.match(/[«"']([^»"']+)[»"']/);
  return m ? m[1].trim() : null;
}

function detectType(text) {
  const n = normalizeCaptureText(text);
  const reasons = [];

  if (
    /(?:εχω|have).{0,20}(?:ιδεα|idea)/.test(n) ||
    /(?:γραψε|προσθεσε|βαλε|add|save).{0,12}(?:ιδεα|idea)/.test(n) ||
    /(?:ιδεα|idea)\s*[:：]/.test(n)
  ) {
    reasons.push('ρητή ιδέα');
    return { type: 'idea', confidence: 0.92, reasons };
  }

  if (
    /(?:στοχος|goal)\s*[:：]/.test(n) ||
    /(?:βαλε|προσθεσε|γραψε|φτιαξε|create|add).{0,16}(?:στοχο|goal)/.test(n)
  ) {
    reasons.push('ρητός στόχος');
    return { type: 'goal', confidence: 0.9, reasons };
  }

  if (
    /(?:todo|task)\b/.test(n) ||
    /(?:πρεπει να|να κανω|να κάνω)/.test(n) ||
    /(?:εργασια|task)\s*[:：]/.test(n)
  ) {
    reasons.push('ρητό task');
    return { type: 'task', confidence: 0.88, reasons };
  }

  if (
    /(?:σημειωση|note|θυμησου)\s*[:：]?/.test(n) ||
    /(?:γραψε|κρατα).{0,12}σημειωσ/.test(n)
  ) {
    reasons.push('ρητή σημείωση');
    return { type: 'note', confidence: 0.9, reasons };
  }

  if (/(?:ιδεα|idea|μηπως|what if)/.test(n)) {
    reasons.push('μοιάζει με ιδέα');
    return { type: 'idea', confidence: 0.72, reasons };
  }

  const lines = text.trim().split(/\n/).filter(Boolean);
  if (lines.length > 1 || text.trim().length > 140) {
    reasons.push('μακρύ κείμενο');
    return { type: 'note', confidence: 0.62, reasons };
  }

  reasons.push('προεπιλογή σημείωσης');
  return { type: 'note', confidence: 0.42, reasons };
}

function stripIntentAndNames(raw, names = []) {
  let text = (extractQuoted(raw) || raw).trim();

  for (const name of names.filter(Boolean)) {
    const escaped = escapeRegExp(name.trim());
    text = text.replace(
      new RegExp(
        `(?:για\\s+(?:το\\s+|τον\\s+|την\\s+)?|στον?\\s+|στην?\\s+|for\\s+(?:the\\s+)?)${escaped}`,
        'gi'
      ),
      ' '
    );
    text = text.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ');
  }

  text = text
    .replace(/^(?:έχω|εχω|have)\s+(?:μια\s+|την?\s+)?/i, '')
    .replace(/^(?:την?\s+)?(?:ιδέα|ιδεα|idea)\s*[:：]?\s*/i, '')
    .replace(/^(?:σημείωση|σημειωση|note|θυμήσου|θυμησου)\s*[:：]?\s*/i, '')
    .replace(/^(?:todo|task|στόχος|στοχος|goal)\s*[:：]?\s*/i, '')
    .replace(/^(?:γράψε|φτιάξε|πρόσθεσε|βάλε|κάνε|γραψε|φτιαξε|προσθεσε|βαλε|κανε|create|add|make|save)\s+(?:μου\s+)?/i, '')
    .replace(/^(?:μια\s+|έναν?\s+|εναν?\s+)/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:,\-—–]+/, '')
    .trim();

  for (let i = 0; i < 3; i++) {
    text = text
      .replace(/^(?:για|στον?|στην?|στο|του|της|το|τον|την|και|and|for)\s+/i, '')
      .replace(/\s+(?:στον?|στην?|στο|του|της|για|and|for)\s*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return text;
}

function buildDestinations({
  projectList = [],
  currentProjectId,
  currentProjectTitle,
  lifelineProjectId,
} = {}) {
  const list = [];
  const seen = new Set();

  const push = (id, title, extra = {}) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    list.push({
      id,
      title: title || 'Project',
      prefer: id === currentProjectId,
      ...extra,
    });
  };

  for (const project of projectList) {
    push(project.id, project.title, { isLifeline: project.isLifeline === true });
  }
  if (currentProjectId) {
    push(currentProjectId, currentProjectTitle || 'Project');
  }
  if (lifelineProjectId) {
    push(lifelineProjectId, 'Lifeline', { isLifeline: true });
  }

  return list;
}

function stagesForProject(projectId, { currentProjectId, stages, catalog }) {
  if (projectId && catalog?.length) {
    const hit = catalog.find((item) => item.id === projectId);
    if (hit?.stages) return hit.stages;
  }
  if (projectId === currentProjectId) return stages || [];
  return [];
}

export function classifyCapture(text, ctx = {}) {
  const input = String(text || '').trim();
  if (!input) {
    return {
      type: 'note',
      projectId: ctx.currentProjectId || null,
      projectTitle: ctx.currentProjectTitle || '',
      stageId: null,
      stageTitle: null,
      title: '',
      body: '',
      confidence: 0,
      needsTriage: false,
      reasons: [],
    };
  }

  const destinations = buildDestinations(ctx);
  const projectMatch = findBestNamedMatch(input, destinations);
  const projectId = projectMatch?.id || ctx.currentProjectId || destinations[0]?.id || null;
  const projectTitle =
    projectMatch?.title ||
    destinations.find((d) => d.id === projectId)?.title ||
    ctx.currentProjectTitle ||
    '';
  const matchedProject = Boolean(projectMatch);

  const projectStages = stagesForProject(projectId, ctx);
  const stageMatch = findBestNamedMatch(input, projectStages);
  const stageId = stageMatch?.id || null;
  const stageTitle = stageMatch?.title || null;

  const detected = detectType(input);
  let { type, confidence, reasons } = detected;

  if (matchedProject) {
    confidence = Math.min(1, confidence + 0.12);
    reasons = [...reasons, `project «${projectTitle}»`];
  }
  if (stageTitle) {
    confidence = Math.min(1, confidence + 0.08);
    reasons = [...reasons, `milestone «${stageTitle}»`];
  }

  const cleaned = stripIntentAndNames(input, [projectTitle, stageTitle]);
  const body = cleaned || input;
  const title = body.split('\n')[0].slice(0, 80) || (type === 'idea' ? 'Νέα ιδέα' : 'Quick note');
  const needsTriage = confidence < 0.5 && !matchedProject;

  if (needsTriage) {
    reasons = [...reasons, 'inbox'];
  }

  return {
    type,
    projectId,
    projectTitle,
    stageId,
    stageTitle,
    title,
    body,
    confidence,
    needsTriage,
    reasons,
    matchedProject,
  };
}

export function describeCapture(result) {
  if (!result) return '';
  const typeLabel = CAPTURE_TYPE_LABELS[result.type] || 'Σημείωση';
  const project = result.needsTriage
    ? `Inbox / ${result.projectTitle || 'τρέχον'}`
    : result.projectTitle || 'τρέχον project';

  if (result.type === 'idea' && !result.stageId) {
    return `${typeLabel} → ${project} / Backlog`;
  }
  if (result.stageTitle) {
    return `${typeLabel} → ${project} / ${result.stageTitle}`;
  }
  return `${typeLabel} → ${project}`;
}

export function applyCaptureToState(state, capture) {
  if (!state) {
    throw new Error('No project state to capture into');
  }

  const itemId = capture.itemId || generateId();
  const now = new Date().toISOString();
  const title = (capture.title || '').trim() || 'Quick note';
  const body = (capture.body || title).trim();
  const type = CAPTURE_TYPES.includes(capture.type) ? capture.type : 'note';

  if (type === 'idea') {
    const idea = createEmptyIdea({
      id: itemId.startsWith('idea-') ? itemId : `idea-${itemId}`,
      title,
      description: body !== title ? body : '',
    });
    if (capture.stageId && (state.stages || []).some((s) => s.id === capture.stageId)) {
      return {
        state: {
          ...state,
          stages: processStages(
            (state.stages || []).map((stage) =>
              stage.id === capture.stageId
                ? { ...stage, ideas: [...(stage.ideas || []), idea] }
                : stage
            )
          ),
        },
        itemId: idea.id,
        columns: ['stages'],
        type,
      };
    }
    return {
      state: {
        ...state,
        backlog: [...(state.backlog || []), idea],
      },
      itemId: idea.id,
      columns: ['backlog'],
      type,
    };
  }

  if (type === 'task') {
    const task = createEmptyCanvasTask({
      id: itemId.startsWith('task-') ? itemId : `task-${itemId}`,
      title,
      description: body !== title ? body : '',
    });
    return {
      state: {
        ...state,
        canvasTasks: [...(state.canvasTasks || []), task],
      },
      itemId: task.id,
      columns: ['canvas_tasks'],
      type,
    };
  }

  if (type === 'goal') {
    const goals = [...(state.goals || [])].sort((a, b) => a.order - b.order);
    const maxOrder = goals.length ? Math.max(...goals.map((g) => g.order)) : 0;
    const goal = {
      ...createEmptyGoal(maxOrder + 1, goals.length === 0),
      id: itemId.startsWith('goal-') ? itemId : `goal-${itemId}`,
      title,
      description: body !== title ? body : '',
    };
    return {
      state: {
        ...state,
        goals: reindexGoals([...goals, goal]),
      },
      itemId: goal.id,
      columns: ['goals'],
      type,
    };
  }

  const note = {
    id: itemId.startsWith('note-') ? itemId : `note-${itemId}`,
    title,
    body,
    relatedStageId: capture.stageId || null,
    category: capture.needsTriage ? 'Inbox' : '',
    createdAt: now,
    updatedAt: now,
    archived: false,
    archivedAt: null,
    done: false,
    needsTriage: Boolean(capture.needsTriage),
  };

  return {
    state: {
      ...state,
      notes: [note, ...(state.notes || [])],
    },
    itemId: note.id,
    columns: ['notes'],
    type: 'note',
  };
}

export function removeCaptureFromState(state, { type, itemId, stageId } = {}) {
  if (!state || !itemId) return { state, columns: [] };

  if (type === 'idea') {
    if (stageId) {
      return {
        state: {
          ...state,
          stages: processStages(
            (state.stages || []).map((stage) =>
              stage.id === stageId
                ? { ...stage, ideas: (stage.ideas || []).filter((idea) => idea.id !== itemId) }
                : stage
            )
          ),
        },
        columns: ['stages'],
      };
    }
    return {
      state: {
        ...state,
        backlog: (state.backlog || []).filter((idea) => idea.id !== itemId),
      },
      columns: ['backlog'],
    };
  }

  if (type === 'task') {
    return {
      state: {
        ...state,
        canvasTasks: (state.canvasTasks || []).filter((task) => task.id !== itemId),
      },
      columns: ['canvas_tasks'],
    };
  }

  if (type === 'goal') {
    return {
      state: {
        ...state,
        goals: reindexGoals((state.goals || []).filter((goal) => goal.id !== itemId)),
      },
      columns: ['goals'],
    };
  }

  return {
    state: {
      ...state,
      notes: (state.notes || []).filter((note) => note.id !== itemId),
    },
    columns: ['notes'],
  };
}

export function captureSuccessMessage(result, { remote = false } = {}) {
  const label = describeCapture(result);
  if (remote) return `Αποθηκεύτηκε: ${label}`;
  return `Αποθηκεύτηκε: ${label}`;
}
