import { createEmptyBlockAction, nowIso, sortBlockActions } from './schema';

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/i;
const BULLET_RE = /^(?:[-*+•·▪◦‣–—]|\d{1,3}[.)])(?:\s+|$)/;
const CHECK_RE = /^(?:\[([ xX✓])?\]|[☐☑✅✔])\s*/;

export function normalizeCaptureUrl(value) {
  const text = String(value || '').trim().replace(/[),.;:!?]+$/, '');
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

/** One typed or pasted line: list markers dropped, `[x]` kept as done, a link pulled out. */
export function parseCaptureLine(line) {
  let text = String(line || '').trim();
  let completed = false;
  for (let pass = 0; pass < 2; pass += 1) {
    text = text.replace(BULLET_RE, '');
    const check = text.match(CHECK_RE);
    if (check) {
      completed = completed || /[xX✓☑✅✔]/.test(check[0]);
      text = text.slice(check[0].length);
    }
  }
  let url = null;
  const match = text.match(URL_RE);
  if (match) {
    url = normalizeCaptureUrl(match[0]);
    text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
      .replace(/\s{2,}/g, ' ')
      .replace(/[\s:–—-]+$/, '')
      .replace(/^[\s:–—-]+/, '')
      .trim();
  }
  if (!text && !url) return null;
  return { text, url, completed };
}

export function splitCaptureText(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(parseCaptureLine)
    .filter(Boolean);
}

export function captureLineCount(value) {
  return String(value || '').split(/\r?\n/).filter((line) => line.trim()).length;
}

/** A pasted URL on its own, e.g. to tie it to an existing task. */
export function soleUrl(value) {
  const text = String(value || '').trim();
  if (!text || /\s/.test(text)) return null;
  const match = text.match(URL_RE);
  return match && match.index === 0 && match[0].length === text.length ? normalizeCaptureUrl(text) : null;
}

export function appendBlockActions(actions = [], items = []) {
  const list = sortBlockActions(actions);
  const now = nowIso();
  const added = items.map((item, index) => createEmptyBlockAction({
    ...item,
    completedAt: item.completed ? (item.completedAt || now) : null,
    position: list.length + index,
    createdAt: now,
    updatedAt: now,
  }));
  return { actions: [...list, ...added], added };
}

export function taskTextKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const textKey = taskTextKey;

function hasCarryContent(block) {
  return (block.actions || []).some((action) => String(action.text || '').trim())
    || Boolean(String(block.nextStep || '').trim());
}

function sameStream(a, b) {
  if (b.goalId) return a.goalId === b.goalId;
  if (b.projectId) return a.projectId === b.projectId;
  return Boolean(textKey(b.title)) && textKey(a.title) === textKey(b.title);
}

function blockMomentKey(block) {
  return `${block?.date || '9999-99-99'}|${block?.startTime || '99:99'}|${String(Number(block?.order) || 0).padStart(6, '0')}`;
}

/** Open actions of later blocks point back here, keyed by the earlier action's id. */
export function carriedActionTargets(blocks = []) {
  const targets = new Map();
  for (const item of blocks || []) {
    for (const action of item.actions || []) {
      if (action.carriedFrom) targets.set(action.carriedFrom, item);
    }
  }
  return targets;
}

/**
 * The open tasks (and the "Επόμενο" line) the nearest earlier block of the same goal,
 * project or title left behind, minus any already carried forward or already written here.
 */
export function blockCarryOver(blocks = [], block) {
  if (!block || block.status === 'Done') return null;
  const here = blockMomentKey(block);
  const earlier = (blocks || [])
    .filter((item) => (
      item.id !== block.id
      && item.date
      && hasCarryContent(item)
      && sameStream(item, block)
      && blockMomentKey(item) < here
    ))
    .sort((a, b) => blockMomentKey(a).localeCompare(blockMomentKey(b)));
  const source = earlier[earlier.length - 1];
  if (!source || block.carryOverDismissedFrom === source.id) return null;

  const carried = carriedActionTargets(blocks);
  const ownText = new Set((block.actions || []).map((action) => textKey(action.text)));
  const ownTasks = new Set((block.actions || []).map((action) => action.taskId).filter(Boolean));
  const actions = sortBlockActions(source.actions).filter((action) => (
    !action.completed
    && textKey(action.text)
    && !carried.has(action.id)
    && !ownText.has(textKey(action.text))
    && !(action.taskId && ownTasks.has(action.taskId))
  ));
  const next = String(source.nextStep || '').trim();
  const nextId = `${source.id}:next`;
  if (
    next
    && !carried.has(nextId)
    && !ownText.has(textKey(next))
    && !(source.actions || []).some((action) => textKey(action.text) === textKey(next))
  ) {
    actions.push({ id: nextId, text: next, completed: false });
  }
  return actions.length ? { source, actions } : null;
}

export function carryOverItems(leftovers = []) {
  return leftovers.map((action) => ({
    text: action.text,
    url: action.url,
    taskId: action.taskId,
    taskSource: action.taskSource,
    carriedFrom: action.id,
  }));
}

/** What the close step starts from: done tasks, open tasks, and the first open one as next. */
export function blockResultDraft(block) {
  const actions = sortBlockActions(block?.actions).filter((action) => String(action.text || '').trim());
  const done = actions.filter((action) => action.completed);
  const open = actions.filter((action) => !action.completed);
  return {
    resultSummary: done.map((action) => `• ${action.text.trim()}`).join('\n'),
    remaining: open.map((action) => `• ${action.text.trim()}`).join('\n'),
    nextStep: open[0]?.text.trim() || '',
  };
}
