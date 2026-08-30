import { loadBrainConfig, assertLocalEndpointAllowed, resolveBrainModel } from '../../brain/config';
import { transportRun } from '../../brain/transport';
import {
  BLOCK_TYPES,
  GOAL_ROLES,
  createEmptyGoal,
  createEmptyMetric,
  createEmptyTemplate,
  createEmptyPlan,
  missingGoalFields,
  nowIso,
} from './schema';

export const PATH_IMPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['plan', 'goals'],
  properties: {
    plan: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'startDate', 'endDate'],
      properties: {
        title: { type: ['string', 'null'] },
        startDate: { type: ['string', 'null'] },
        endDate: { type: ['string', 'null'] },
      },
    },
    goals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'projectOrLifeArea',
          'role',
          'baseline',
          'target',
          'unit',
          'deadline',
          'why',
          'outcomeMetrics',
          'actionMetrics',
          'weeklyAllocation',
          'recurringWeeklyBlocks',
          'minimumAction',
          'notes',
        ],
        properties: {
          title: { type: ['string', 'null'] },
          projectOrLifeArea: { type: ['string', 'null'] },
          role: { type: ['string', 'null'] },
          baseline: { type: ['number', 'null'] },
          target: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'] },
          deadline: { type: ['string', 'null'] },
          why: { type: ['string', 'null'] },
          weeklyAllocation: { type: ['string', 'null'] },
          minimumAction: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] },
          outcomeMetrics: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'unit', 'baseline', 'target', 'direction', 'frequency'],
              properties: {
                name: { type: ['string', 'null'] },
                unit: { type: ['string', 'null'] },
                baseline: { type: ['number', 'null'] },
                target: { type: ['number', 'null'] },
                direction: { type: ['string', 'null'] },
                frequency: { type: ['string', 'null'] },
              },
            },
          },
          actionMetrics: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'unit', 'baseline', 'target', 'direction', 'frequency'],
              properties: {
                name: { type: ['string', 'null'] },
                unit: { type: ['string', 'null'] },
                baseline: { type: ['number', 'null'] },
                target: { type: ['number', 'null'] },
                direction: { type: ['string', 'null'] },
                frequency: { type: ['string', 'null'] },
              },
            },
          },
          recurringWeeklyBlocks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'weekday', 'startTime', 'duration', 'blockType', 'minimumAction'],
              properties: {
                title: { type: ['string', 'null'] },
                weekday: { type: ['integer', 'null'] },
                startTime: { type: ['string', 'null'] },
                duration: { type: ['number', 'null'] },
                blockType: { type: ['string', 'null'] },
                minimumAction: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  },
};

const IMPORT_INSTRUCTIONS = `You extract a personal or professional 90-day plan into structured Path goals.
Return JSON only. Match the given schema exactly.
Never invent facts that are not clearly stated in the source.
If a field is missing or ambiguous, return null.
Do not turn the plan into tasks. Extract goals, metrics, and recurring weekly time commitments.
role must be one of: Primary, Growth, Maintenance — or null if unclear.
blockType must be one of: ${BLOCK_TYPES.join(', ')} — or null.
weekday is ISO Monday=1 through Sunday=7, or null.
Dates must be YYYY-MM-DD or null.
Numbers must be numbers or null. Do not guess targets or baselines.
weeklyAllocation is a short string such as "6h" or "3 blocks", or null.
Keep why short (one or two sentences) and only if the source states a reason.`;

function parseJson(text) {
  if (text && typeof text === 'object') return text;
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function extractPdfText(file) {
  if (!file) throw new Error('Choose a PDF file.');
  if (file.type && file.type !== 'application/pdf' && !file.name?.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files are supported.');
  }
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  GlobalWorkerOptions.workerSrc = worker.default;
  const data = await file.arrayBuffer();
  const pdf = await getDocument({ data }).promise;
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    const text = (content.items || [])
      .map((item) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) pages.push(text);
  }
  const extracted = pages.join('\n\n').trim();
  if (!extracted) {
    throw new Error('No readable text was found in this PDF.');
  }
  return extracted.slice(0, 24000);
}

function normalizeRole(value) {
  if (!value) return null;
  const match = GOAL_ROLES.find((role) => role.toLowerCase() === String(value).toLowerCase());
  return match || null;
}

function normalizeBlockType(value) {
  if (!value) return 'Deep Work';
  const match = BLOCK_TYPES.find((type) => type.toLowerCase() === String(value).toLowerCase());
  return match || 'Deep Work';
}

function normalizeDirection(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('decrease') || text.includes('lower') || text.includes('reduce')) return 'Decrease';
  if (text.includes('maintain') || text.includes('keep')) return 'Maintain';
  return 'Increase';
}

function normalizeFrequency(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('day')) return 'Daily';
  if (text.includes('month')) return 'Monthly';
  return 'Weekly';
}

function asDraftGoal(raw, index) {
  const area = raw?.projectOrLifeArea || raw?.lifeArea || raw?.projectTitle || null;
  const goal = createEmptyGoal({
    title: raw?.title || `Goal ${index + 1}`,
    lifeArea: area,
    projectTitle: area,
    role: normalizeRole(raw?.role) || null,
    baseline: raw?.baseline,
    target: raw?.target,
    unit: raw?.unit,
    deadline: raw?.deadline,
    why: raw?.why,
    weeklyAllocation: raw?.weeklyAllocation,
    minimumAction: raw?.minimumAction,
    notes: raw?.notes,
    status: 'Active',
  });
  const outcomeMetrics = (Array.isArray(raw?.outcomeMetrics) ? raw.outcomeMetrics : [])
    .filter((metric) => metric?.name)
    .map((metric) => createEmptyMetric({
      goalId: goal.id,
      name: metric.name,
      type: 'Outcome',
      unit: metric.unit || goal.unit,
      baseline: metric.baseline ?? goal.baseline,
      target: metric.target ?? goal.target,
      direction: normalizeDirection(metric.direction),
      frequency: normalizeFrequency(metric.frequency),
    }));
  const actionMetrics = (Array.isArray(raw?.actionMetrics) ? raw.actionMetrics : [])
    .filter((metric) => metric?.name)
    .map((metric) => createEmptyMetric({
      goalId: goal.id,
      name: metric.name,
      type: 'Action',
      unit: metric.unit,
      baseline: metric.baseline,
      target: metric.target,
      direction: normalizeDirection(metric.direction),
      frequency: normalizeFrequency(metric.frequency),
    }));
  const templates = (Array.isArray(raw?.recurringWeeklyBlocks) ? raw.recurringWeeklyBlocks : [])
    .filter((block) => block?.title || block?.weekday)
    .map((block) => createEmptyTemplate({
      goalId: goal.id,
      title: block.title || goal.title,
      weekday: Number.isInteger(block.weekday) ? block.weekday : 1,
      startTime: block.startTime,
      duration: block.duration,
      blockType: normalizeBlockType(block.blockType),
      minimumAction: block.minimumAction || goal.minimumAction,
    }));
  return {
    draftId: goal.id,
    selected: Boolean(String(goal.title || '').trim()),
    goal,
    metrics: [...outcomeMetrics, ...actionMetrics],
    templates,
    missing: missingGoalFields(goal),
  };
}

export function createBlankDraftGoal() {
  const goal = createEmptyGoal({ title: '', role: 'Growth', status: 'Active' });
  return {
    draftId: goal.id,
    selected: true,
    goal,
    metrics: [],
    templates: [],
    missing: missingGoalFields(goal),
  };
}

export function normalizeImportDraft(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const goals = (Array.isArray(source.goals) ? source.goals : []).map(asDraftGoal);
  return {
    plan: createEmptyPlan(source.plan),
    drafts: goals.length ? goals : [createBlankDraftGoal()],
    extractedAt: nowIso(),
  };
}

export async function analyzePlanText(text, { signal } = {}) {
  const extracted = String(text || '').trim();
  if (!extracted) throw new Error('The PDF had no text to analyze.');

  const loaded = loadBrainConfig();
  const model = resolveBrainModel(loaded);
  const config = { ...loaded, model };
  if (!model) {
    throw new Error(config.providerId === 'openai'
      ? 'Set a Brain model in Settings before importing a plan.'
      : 'Set the local Brain model before importing a plan.');
  }
  assertLocalEndpointAllowed(config);

  const payload = {
    instructions: IMPORT_INSTRUCTIONS,
    input: `Extract Path draft goals from this plan. Return JSON only.\n\nPLAN TEXT\n${extracted}`,
    tools: [],
    outputSchema: PATH_IMPORT_SCHEMA,
  };
  let result;
  try {
    result = await transportRun(config, payload, signal);
  } catch {
    result = await transportRun(config, { ...payload, outputSchema: undefined }, signal);
  }

  const parsed = result?.parsed || parseJson(result?.text);
  if (!parsed) {
    throw new Error('The AI did not return a usable plan. Try again or enter goals manually.');
  }
  return normalizeImportDraft(parsed);
}

export function mergeDrafts(drafts, ids) {
  const selected = drafts.filter((draft) => ids.includes(draft.draftId));
  if (selected.length < 2) return drafts;
  const [first, ...rest] = selected;
  const mergedGoal = { ...first.goal };
  for (const extra of rest) {
    for (const key of Object.keys(mergedGoal)) {
      if (mergedGoal[key] == null || mergedGoal[key] === '') {
        mergedGoal[key] = extra.goal[key];
      }
    }
  }
  const merged = {
    ...first,
    goal: { ...mergedGoal, updatedAt: nowIso() },
    metrics: [...first.metrics, ...rest.flatMap((draft) => draft.metrics.map((metric) => ({ ...metric, goalId: first.goal.id })))],
    templates: [...first.templates, ...rest.flatMap((draft) => draft.templates.map((template) => ({ ...template, goalId: first.goal.id })))],
    missing: missingGoalFields(mergedGoal),
    selected: true,
  };
  const drop = new Set(rest.map((draft) => draft.draftId));
  return drafts.map((draft) => (draft.draftId === first.draftId ? merged : draft)).filter((draft) => !drop.has(draft.draftId));
}

export function refreshDraft(draft, patch) {
  const goal = { ...draft.goal, ...patch, updatedAt: nowIso() };
  return {
    ...draft,
    goal,
    missing: missingGoalFields(goal),
  };
}
