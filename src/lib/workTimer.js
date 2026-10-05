import { createEmptyBlock, nowIso } from './path/schema';
import { queuePathSave, readPathBundleLocal } from './path/store';

const STORAGE_KEY = 'lifev1-work-timer';
const LOG_KEY = 'lifev1-work-timer-log';
const MIN_RECORD_MS = 15000;
const LOG_LIMIT = 200;

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
      runs: normalizeRuns(raw.runs),
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
if (session && !session.targetChimed && targetMsOf(session) && sessionElapsedMs(session) >= targetMsOf(session)) {
  session = { ...session, targetChimed: true };
  writeStored(session);
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

function recordBlockWork(blockId, minutes) {
  if (!blockId || !minutes) return;
  const bundle = readPathBundleLocal();
  if (!bundle?.blocks?.some((block) => block.id === blockId)) return;
  queuePathSave({
    ...bundle,
    blocks: bundle.blocks.map((block) => (
      block.id === blockId
        ? createEmptyBlock({
          ...block,
          workedMinutes: (Number(block.workedMinutes) || 0) + minutes,
          updatedAt: nowIso(),
        })
        : block
    )),
    updatedAt: nowIso(),
  });
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
    runs: [{ start: at, end: null }],
  });
}

export function pauseWorkTimer() {
  if (!session?.running) return;
  const at = Date.now();
  commit({
    ...session,
    running: false,
    accumulatedMs: sessionElapsedMs(session, at),
    startedAt: null,
    runs: closeOpenRun(session, at),
  });
}

export function resumeWorkTimer() {
  if (!session || session.running) return;
  const at = Date.now();
  commit({
    ...session,
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
  recordBlockWork(current.blockId, minutesFromElapsed(elapsed));
}

export function markWorkTimerChimed() {
  if (!session || session.targetChimed) return;
  commit({ ...session, targetChimed: true });
}

export function chimeWorkTimer() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 698;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.72);
    osc.onended = () => ctx.close();
  } catch {
    /* a missing audio device should not stop the timer */
  }
}
