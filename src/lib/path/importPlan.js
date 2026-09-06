import { loadBrainConfig, assertLocalEndpointAllowed, resolveBrainModel } from '../../brain/config';
import { transportRun } from '../../brain/transport';
import { withTimeout } from '../../utils/withTimeout';
import {
  BLOCK_TYPES,
  GOAL_ROLES,
  assignMissingGoalColors,
  createEmptyGoal,
  nextGoalColor,
  createEmptyMetric,
  createEmptyTemplate,
  createEmptyPlan,
  missingGoalFields,
  nowIso,
} from './schema';
import { assertPlanPdf, loadPdfDocument } from './planFile';

const IMPORT_DRAFT_KEY = 'lifev1-path-import-draft';

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
          baseline: { type: ['string', 'null'] },
          target: { type: ['string', 'number', 'null'] },
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

LANGUAGE
Keep every user-facing string in the SOURCE language. If the plan is Greek, write title, why, notes, projectOrLifeArea, weeklyAllocation, minimumAction, baseline, target, metric names, and block titles in Greek. Never translate into English.

FILLING FIELDS
Be thorough. Pull values that are stated or clearly implied in the same goal section.
- title: the goal in the source language. Keep the original wording. If it has a project prefix ("Symphon: ..."), keep it.
- projectOrLifeArea: the project, company, product, or life area named next to the goal (Symphon, Health, Sales, Personal). If the title starts with "Name:", that name is the area.
- role: Primary / Growth / Maintenance. Map Greek: κύριος/βασικός/primary → Primary, ανάπτυξη/growth → Growth, συντήρηση/maintenance → Maintenance. The main 90-day business outcome is usually Primary.
- baseline: where you are NOW, in plain words, same language. Not the destination. Examples: "80 κιλά, μέση 92 cm", "2 πληρωμένα καταστήματα", "χωρίς σταθερή ρουτίνα προπόνησης". Never copy the target into baseline.
- target: the destination in plain words, same language. Keep numbers, units, and extra detail in the same field. Examples: "72 kg με 12% λίπος", "10 πληρωμένα καταστήματα", "≥80% συνέπεια". Never reduce this to a bare number.
- unit: optional. Leave null when the unit is already inside target.
- deadline: the goal date, cycle end, "έως", "μέχρι", "by", or the plan end date if the goal belongs to that cycle. YYYY-MM-DD.
- why: one or two sentences from the source, same language. Use the stated reason, outcome, or constraint — do not invent a new why.
- weeklyAllocation: hours, blocks, or cadence from the plan ("6 ώρες / εβδομάδα", "3 blocks"). Same language as the source.
- minimumAction: the smallest weekly action named for that goal, same language. If only a first next step exists, use that.
- notes: constraints, exclusions, or extra context that did not fit elsewhere.
- outcomeMetrics / actionMetrics: every measurable result or controllable action tied to the goal.
- recurringWeeklyBlocks: repeating weekday commitments (calls, deep work, workout). weekday Monday=1 … Sunday=7.

Do not invent numbers that never appear. Do not drop a field just because it is written as a sentence instead of a table.
Do not turn the plan into a task list. Extract goals, metrics, and weekly time commitments.
role must be Primary, Growth, Maintenance, or null.
blockType must be one of: ${BLOCK_TYPES.join(', ')} — or null.
Dates must be YYYY-MM-DD or null.`;

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
  assertPlanPdf(file);
  const data = await file.arrayBuffer();
  const pdf = await loadPdfDocument(data);
  try {
    const pages = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      const text = (content.items || []).reduce((out, item) => {
        const piece = item?.str || '';
        if (!piece && !item?.hasEOL) return out;
        return `${out}${piece}${item?.hasEOL ? '\n' : ' '}`;
      }, '').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
      if (text) pages.push(text);
    }
    const extracted = pages.join('\n\n').trim();
    if (!extracted) {
      throw new Error('No readable text was found in this PDF.');
    }
    return extracted.slice(0, 20000);
  } finally {
    pdf.destroy?.();
  }
}

const GREEK_MONTHS = {
  ιανουαριος: 1, ιανουαρίου: 1, ιαν: 1, january: 1, jan: 1,
  φεβρουαριος: 2, φεβρουαρίου: 2, φεβ: 2, february: 2, feb: 2,
  μαρτιος: 3, μαρτίου: 3, μαρ: 3, march: 3, mar: 3,
  απριλιος: 4, απριλίου: 4, απρ: 4, april: 4, apr: 4,
  μαιος: 5, μαΐου: 5, μαίου: 5, may: 5,
  ιουνιος: 6, ιουνίου: 6, ιουν: 6, june: 6, jun: 6,
  ιουλιος: 7, ιουλίου: 7, ιουλ: 7, july: 7, jul: 7,
  αυγουστος: 8, αυγούστου: 8, αυγ: 8, august: 8, aug: 8,
  σεπτεμβριος: 9, σεπτεμβρίου: 9, σεπ: 9, september: 9, sep: 9, sept: 9,
  οκτωβριος: 10, οκτωβρίου: 10, οκτ: 10, october: 10, oct: 10,
  νοεμβριος: 11, νοεμβρίου: 11, νοε: 11, november: 11, nov: 11,
  δεκεμβριος: 12, δεκεμβρίου: 12, δεκ: 12, december: 12, dec: 12,
};

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseLooseNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let text = String(value).trim().replace(/[€$£%\s]/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) text = text.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, '');
  else text = text.replace(',', '.');
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function parseFlexibleDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const named = text.match(/(\d{1,2})\s+([A-Za-zΑ-Ωα-ωΆ-ώ]+)\s+(\d{4})/i);
  if (named) {
    const month = GREEK_MONTHS[fold(named[2])];
    if (month) return `${named[3]}-${String(month).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
  }
  return null;
}

function normalizeRole(value) {
  if (!value) return null;
  const text = fold(value);
  if (GOAL_ROLES.includes(value)) return value;
  if (/primary|κυρι|βασικ|κεντρικ|main/.test(text)) return 'Primary';
  if (/growth|αναπτυξ|αυξησ/.test(text)) return 'Growth';
  if (/maintenance|συντηρησ|ρουτιν/.test(text)) return 'Maintenance';
  const match = GOAL_ROLES.find((role) => fold(role) === text);
  return match || null;
}

function normalizeBlockType(value) {
  if (!value) return 'Deep Work';
  const text = fold(value);
  const aliases = {
    'deep work': 'Deep Work',
    'βαθια εργασια': 'Deep Work',
    operations: 'Operations',
    λειτουργιες: 'Operations',
    sales: 'Sales / Demo',
    demo: 'Sales / Demo',
    πωλησεισ: 'Sales / Demo',
    growth: 'Growth',
    αναπτυξη: 'Growth',
    learning: 'Learning',
    μαθηση: 'Learning',
    meditation: 'Meditation',
    διαλογισμοσ: 'Meditation',
    workout: 'Workout',
    προπονηση: 'Workout',
    γυμναστικη: 'Workout',
    recovery: 'Recovery',
    ανανηψη: 'Recovery',
  };
  if (aliases[text]) return aliases[text];
  const match = BLOCK_TYPES.find((type) => fold(type) === text);
  return match || 'Deep Work';
}

function normalizeDirection(value) {
  const text = fold(value);
  if (/decrease|lower|reduce|μειωσ|πεσ/.test(text)) return 'Decrease';
  if (/maintain|keep|διατηρ/.test(text)) return 'Maintain';
  return 'Increase';
}

function normalizeFrequency(value) {
  const text = fold(value);
  if (/day|ημερ|καθημερ/.test(text)) return 'Daily';
  if (/month|μηνα/.test(text)) return 'Monthly';
  return 'Weekly';
}

function matchKnownProject(text, projects = []) {
  const hay = fold(text);
  if (!hay) return null;
  return (projects || []).find((project) => {
    const title = fold(project.title);
    return title && (hay.includes(title) || title.includes(hay));
  }) || null;
}

function areaFromTitle(title) {
  const text = String(title || '');
  const split = text.match(/^([^:]{2,40}):\s+.+/);
  return split ? split[1].trim() : null;
}

function allocationFromTemplates(templates = []) {
  const minutes = templates.reduce((sum, template) => (
    sum + (typeof template.duration === 'number' ? template.duration : 0)
  ), 0);
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} λεπτά / εβδομάδα`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} ώρες / εβδομάδα` : `${hours.toFixed(1)} ώρες / εβδομάδα`;
}

function asGoalTargetText(value, unit) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const number = Number.isInteger(value) ? String(value) : String(value);
    const extra = unit ? String(unit).trim() : '';
    return extra ? `${number} ${extra}` : number;
  }
  const text = String(value).trim();
  return text || null;
}

function asDraftGoal(raw, index, { plan, projects } = {}) {
  const area = raw?.projectOrLifeArea || raw?.lifeArea || raw?.projectTitle || areaFromTitle(raw?.title);
  const matched = matchKnownProject(area, projects) || matchKnownProject(raw?.title, projects);
  const outcomeRaw = Array.isArray(raw?.outcomeMetrics) ? raw.outcomeMetrics : [];
  const firstOutcome = outcomeRaw.find((metric) => metric?.name) || null;
  const goal = createEmptyGoal({
    title: raw?.title || `Goal ${index + 1}`,
    projectId: matched?.id || null,
    projectTitle: matched?.title || area || null,
    lifeArea: matched ? null : area || null,
    role: normalizeRole(raw?.role) || 'Primary',
    baseline: raw?.baseline == null || raw?.baseline === ''
      ? null
      : String(raw.baseline).trim(),
    target: asGoalTargetText(raw?.target, raw?.unit)
      || asGoalTargetText(firstOutcome?.target, firstOutcome?.unit || raw?.unit),
    unit: raw?.unit || firstOutcome?.unit || null,
    deadline: parseFlexibleDate(raw?.deadline) || parseFlexibleDate(plan?.endDate),
    why: raw?.why,
    weeklyAllocation: raw?.weeklyAllocation,
    minimumAction: raw?.minimumAction,
    notes: raw?.notes,
    status: 'Active',
  });
  const outcomeMetrics = outcomeRaw
    .filter((metric) => metric?.name)
    .map((metric) => createEmptyMetric({
      goalId: goal.id,
      name: metric.name,
      type: 'Outcome',
      unit: metric.unit || goal.unit,
      baseline: parseLooseNumber(metric.baseline),
      target: parseLooseNumber(metric.target) ?? parseLooseNumber(goal.target),
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
      baseline: parseLooseNumber(metric.baseline),
      target: parseLooseNumber(metric.target),
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
      duration: parseLooseNumber(block.duration),
      blockType: normalizeBlockType(block.blockType),
      minimumAction: block.minimumAction || goal.minimumAction,
    }));
  if (!goal.weeklyAllocation) goal.weeklyAllocation = allocationFromTemplates(templates);
  if (!goal.minimumAction) {
    goal.minimumAction = templates.find((template) => template.minimumAction)?.minimumAction
      || templates[0]?.title
      || null;
  }
  return {
    draftId: goal.id,
    selected: Boolean(String(goal.title || '').trim()),
    goal,
    metrics: [...outcomeMetrics, ...actionMetrics],
    templates,
    missing: missingGoalFields(goal),
  };
}

function hydrateSavedDraft(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.drafts) || !raw.drafts.length) return null;
  const drafts = colorizeDrafts(raw.drafts.map((item) => {
    const goal = createEmptyGoal(item?.goal || {});
    return {
      draftId: item.draftId || goal.id,
      selected: item.selected !== false,
      goal,
      metrics: Array.isArray(item.metrics) ? item.metrics.map((metric) => createEmptyMetric(metric)) : [],
      templates: Array.isArray(item.templates) ? item.templates.map((template) => createEmptyTemplate(template)) : [],
      missing: missingGoalFields(goal),
    };
  }));
  return {
    plan: createEmptyPlan(raw.plan),
    drafts,
    extractedAt: raw.extractedAt || nowIso(),
  };
}

export function loadImportDraft() {
  try {
    const raw = localStorage.getItem(IMPORT_DRAFT_KEY);
    return raw ? hydrateSavedDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveImportDraft(draft) {
  if (!draft?.drafts?.length) return;
  localStorage.setItem(IMPORT_DRAFT_KEY, JSON.stringify(draft));
}

export function clearImportDraft() {
  localStorage.removeItem(IMPORT_DRAFT_KEY);
}

export function hasImportDraft() {
  return Boolean(loadImportDraft());
}

function colorizeDrafts(drafts = []) {
  const colored = assignMissingGoalColors(drafts.map((draft) => draft.goal));
  return drafts.map((draft, index) => ({
    ...draft,
    goal: colored[index],
    missing: missingGoalFields(colored[index]),
  }));
}

export function createBlankDraftGoal(existingGoals = []) {
  const goal = createEmptyGoal({
    title: '',
    role: 'Growth',
    status: 'Active',
    color: nextGoalColor(existingGoals),
  });
  return {
    draftId: goal.id,
    selected: true,
    goal,
    metrics: [],
    templates: [],
    missing: missingGoalFields(goal),
  };
}

export function normalizeImportDraft(raw, extras = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const plan = createEmptyPlan({
    ...source.plan,
    startDate: parseFlexibleDate(source.plan?.startDate) || source.plan?.startDate,
    endDate: parseFlexibleDate(source.plan?.endDate) || source.plan?.endDate,
  });
  const goals = colorizeDrafts((Array.isArray(source.goals) ? source.goals : []).map((item, index) => (
    asDraftGoal(item, index, { plan, projects: extras.projects })
  )));
  return {
    plan,
    drafts: goals.length ? goals : [createBlankDraftGoal()],
    extractedAt: nowIso(),
  };
}

export async function analyzePlanText(text, { signal, projects = [] } = {}) {
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

  const knownProjects = (projects || [])
    .map((project) => project.title)
    .filter(Boolean)
    .slice(0, 20);
  const payload = {
    instructions: IMPORT_INSTRUCTIONS,
    input: [
      'Extract Path draft goals from this plan. Return JSON only.',
      'Keep the source language. Do not translate titles or why into English.',
      knownProjects.length ? `Known app projects to match when named: ${knownProjects.join(', ')}` : '',
      '',
      'PLAN TEXT',
      extracted,
    ].filter(Boolean).join('\n'),
    tools: [],
  };
  const result = await withTimeout(
    transportRun(config, payload, signal),
    90000,
    'Η ανάλυση άργησε πολύ. Δοκίμασε ξανά ή ένα μικρότερο PDF.',
  );

  const parsed = result?.parsed || parseJson(result?.text);
  if (!parsed) {
    throw new Error('The AI did not return a usable plan. Try again or enter goals manually.');
  }
  return normalizeImportDraft(parsed, { projects });
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
