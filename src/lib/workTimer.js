import { localTodayIsoDate } from '../utils/selfDateUtils';
import { nextBlockOrder } from './path/logic';
import { createEmptyBlock, nowIso } from './path/schema';
import { queuePathSave, readPathBundleLocal } from './path/store';

const STORAGE_KEY = 'lifev1-work-timer';
const LOG_KEY = 'lifev1-work-timer-log';
const MIN_RECORD_MS = 15000;
const LOG_LIMIT = 200;
export const HALF_HOUR_MS = 30 * 60000;

let session = null;
const listeners = new Set();

function targetMsOf(value) {
  const minutes = Number(value?.targetMinutes);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60000 : 0;
}

export function sessionElapsedMs(value, now = Date.now()) {
  if (!value) return 0;
  const live = value.running && value.startedAt ? Math.max(0, now - value.startedAt) : 0;
  return (Number(value.accumulatedMs) || 0) + live;
}

export function formatClock(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function readStored() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object' || !raw.id || !raw.blockId) return null;
    const runs = normalizeRuns(raw.runs);
    return {
      id: String(raw.id),
      label: String(raw.label || 'Time block'),
      blockType: String(raw.blockType || 'Deep Work'),
      blockId: String(raw.blockId),
      targetMinutes: Number(raw.targetMinutes) > 0 ? Number(raw.targetMinutes) : null,
      startedAt: Number(raw.startedAt) || null,
      accumulatedMs: Math.max(0, Number(raw.accumulatedMs) || 0),
      running: raw.running === true,
      targetChimed: raw.targetChimed === true,
      halfHoursChimed: Math.max(0, Math.floor(Number(raw.halfHoursChimed) || 0)),
      runs,
      blockStartedAt: Number(raw.blockStartedAt) || runs[0]?.start || null,
      recordedMs: Math.max(0, Number(raw.recordedMs) || 0),
      splitOnResume: raw.splitOnResume === true,
    };
  } catch {
    return null;
  }
}

function writeStored(next) {
  if (!next) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function emit() {
  listeners.forEach((listener) => listener());
}

function commit(next) {
  session = next;
  writeStored(next);
  emit();
}

session = readStored();
if (session) {
  // Marks passed while the app was closed stay silent; only live ones chime.
  const elapsed = sessionElapsedMs(session);
  const halfHours = Math.floor(elapsed / HALF_HOUR_MS);
  const targetPassed = Boolean(targetMsOf(session)) && elapsed >= targetMsOf(session);
  if (halfHours > session.halfHoursChimed || (targetPassed && !session.targetChimed)) {
    session = {
      ...session,
      targetChimed: session.targetChimed || targetPassed,
      halfHoursChimed: Math.max(session.halfHoursChimed, halfHours),
    };
    writeStored(session);
  }
}

export function subscribeWorkTimer(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWorkTimerSnapshot() {
  return session;
}

export function isDeepWorkTimer(value) {
  return value?.blockType === 'Deep Work';
}

function normalizeRuns(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((run) => ({
      start: Number(run?.start) || 0,
      end: run?.end == null ? null : (Number(run.end) || null),
    }))
    .filter((run) => run.start > 0);
}

function closeOpenRun(value, at) {
  const runs = normalizeRuns(value?.runs);
  const openIndex = runs.findIndex((run) => run.end == null);
  if (openIndex >= 0) {
    runs[openIndex] = { ...runs[openIndex], end: at };
    return runs;
  }
  if (value?.startedAt) return [...runs, { start: value.startedAt, end: at }];
  return runs;
}

function readLog() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeLogEntry).filter(Boolean).slice(-LOG_LIMIT);
  } catch {
    return [];
  }
}

function normalizeLogEntry(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  const runs = normalizeRuns(raw.runs).filter((run) => run.end && run.end > run.start);
  if (!runs.length) return null;
  return {
    id: String(raw.id),
    label: String(raw.label || 'Time block'),
    blockType: String(raw.blockType || 'Deep Work'),
    blockId: raw.blockId ? String(raw.blockId) : null,
    runs,
  };
}

function writeLogEntry(entry) {
  const nextEntry = normalizeLogEntry(entry);
  if (!nextEntry) return;
  const next = [...readLog().filter((item) => item.id !== nextEntry.id), nextEntry].slice(-LOG_LIMIT);
  localStorage.setItem(LOG_KEY, JSON.stringify(next));
}

function liveRuns(value, now) {
  const stored = normalizeRuns(value?.runs);
  const runs = stored.length
    ? stored
    : (value?.startedAt ? [{ start: value.startedAt, end: value.running ? null : value.startedAt }] : []);
  return runs
    .map((run) => ({
      start: run.start,
      end: run.end == null ? (value?.running ? now : null) : run.end,
    }))
    .filter((run) => run.start && run.end && run.end > run.start);
}

export function workTimerEntries(now = Date.now()) {
  const saved = readLog();
  if (!session) return saved;
  const runs = liveRuns(session, now);
  if (!runs.length) return saved;
  return [
    ...saved.filter((item) => item.id !== session.id),
    {
      id: session.id,
      label: session.label,
      blockType: session.blockType,
      blockId: session.blockId,
      runs,
    },
  ];
}

function minutesFromElapsed(ms) {
  if (ms < MIN_RECORD_MS) return 0;
  return Math.max(1, Math.round(ms / 60000));
}

function clockOf(ms) {
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function recordBlockWork(blockId, minutes, window = null) {
  if (!blockId || !minutes) return;
  const bundle = readPathBundleLocal();
  if (!bundle?.blocks?.some((block) => block.id === blockId)) return;
  queuePathSave({
    ...bundle,
    blocks: bundle.blocks.map((block) => (
      block.id === blockId
        ? createEmptyBlock({
          ...block,
          ...window,
          workedMinutes: (Number(block.workedMinutes) || 0) + minutes,
          updatedAt: nowIso(),
        })
        : block
    )),
    updatedAt: nowIso(),
  });
}

/** Marks the block started in Path, so every device drops its "starts in N′" reminder. */
function markBlockStarted(blockId, at) {
  const bundle = readPathBundleLocal();
  const block = bundle?.blocks?.find((item) => item.id === blockId);
  if (!block || block.startedAt) return;
  queuePathSave({
    ...bundle,
    blocks: bundle.blocks.map((item) => (
      item.id === blockId
        ? createEmptyBlock({ ...item, startedAt: new Date(at).toISOString(), updatedAt: nowIso() })
        : item
    )),
    updatedAt: nowIso(),
  });
}

/** Work resumed after a pause continues in a new block from now, so Path shows the gap. */
function openNextBlock(blockId, at) {
  const bundle = readPathBundleLocal();
  const source = bundle?.blocks?.find((block) => block.id === blockId);
  if (!source) return null;
  const date = localTodayIsoDate();
  const next = createEmptyBlock({
    goalId: source.goalId,
    projectId: source.projectId,
    projectTitle: source.projectTitle,
    title: source.title,
    blockType: source.blockType,
    taskId: source.taskId,
    taskTitle: source.taskTitle,
    taskSource: source.taskSource,
    date,
    order: nextBlockOrder(bundle.blocks, date),
    startTime: clockOf(at),
    startedAt: new Date(at).toISOString(),
  });
  queuePathSave({ ...bundle, blocks: [...bundle.blocks, next], updatedAt: nowIso() });
  return next.id;
}

export function startBlockTimer(block) {
  if (!block?.id) return;
  if (session?.blockId === block.id) return;
  if (session) stopWorkTimer();
  const at = Date.now();
  commit({
    id: `timer-${at}`,
    label: block.title || 'Time block',
    blockType: block.blockType || 'Deep Work',
    blockId: block.id,
    targetMinutes: Number(block.duration) > 0 ? Number(block.duration) : null,
    startedAt: at,
    accumulatedMs: 0,
    running: true,
    targetChimed: false,
    halfHoursChimed: 0,
    runs: [{ start: at, end: null }],
    blockStartedAt: at,
    recordedMs: 0,
    splitOnResume: false,
  });
  markBlockStarted(block.id, at);
}

/** Pausing writes the block's time so far, ending it at the pause; the gap shows on the day line and in Path. */
export function pauseWorkTimer() {
  if (!session?.running) return;
  const current = session;
  const at = Date.now();
  const elapsed = sessionElapsedMs(current, at);
  const minutes = minutesFromElapsed(elapsed - (current.recordedMs || 0));
  const next = {
    ...current,
    running: false,
    accumulatedMs: elapsed,
    startedAt: null,
    runs: closeOpenRun(current, at),
    recordedMs: minutes ? elapsed : current.recordedMs,
    splitOnResume: current.splitOnResume || Boolean(minutes),
  };
  commit(next);
  if (elapsed >= MIN_RECORD_MS) writeLogEntry(next);
  if (minutes) {
    recordBlockWork(current.blockId, minutes, {
      startTime: clockOf(current.blockStartedAt || current.startedAt),
      duration: minutes,
    });
  }
}

export function resumeWorkTimer() {
  if (!session || session.running) return;
  const at = Date.now();
  const nextBlockId = session.splitOnResume ? openNextBlock(session.blockId, at) : null;
  commit({
    ...session,
    blockId: nextBlockId || session.blockId,
    blockStartedAt: nextBlockId ? at : session.blockStartedAt,
    splitOnResume: false,
    running: true,
    startedAt: at,
    runs: [...normalizeRuns(session.runs), { start: at, end: null }],
  });
}

export function stopWorkTimer() {
  const current = session;
  if (!current) return;
  const at = Date.now();
  const elapsed = sessionElapsedMs(current, at);
  if (elapsed >= MIN_RECORD_MS) {
    writeLogEntry({
      ...current,
      runs: closeOpenRun(current, at),
    });
  }
  commit(null);
  if (!current.blockId) return;
  recordBlockWork(current.blockId, minutesFromElapsed(elapsed - (current.recordedMs || 0)));
}

export function markWorkTimerChimed({ target = false, halfHours = 0 } = {}) {
  if (!session) return;
  const targetChimed = session.targetChimed || target;
  const halfHoursChimed = Math.max(session.halfHoursChimed || 0, halfHours);
  if (targetChimed === session.targetChimed && halfHoursChimed === session.halfHoursChimed) return;
  commit({ ...session, targetChimed, halfHoursChimed });
}

function playNotes(notes) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume?.().catch(() => {});
    let last = null;
    let lastEnd = 0;
    for (const note of notes) {
      const start = ctx.currentTime + (note.at || 0);
      const end = start + note.duration;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(note.peak, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
      if (end >= lastEnd) {
        last = osc;
        lastEnd = end;
      }
    }
    if (last) last.onended = () => ctx.close();
  } catch {
    /* a missing audio device should not stop the timer */
  }
}

export function chimeWorkTimer() {
  playNotes([{ frequency: 698, duration: 0.7, peak: 0.045 }]);
}

export function chimeHalfHour() {
  playNotes([
    { frequency: 880, duration: 0.22, peak: 0.03 },
    { frequency: 1175, at: 0.14, duration: 0.34, peak: 0.03 },
  ]);
}
