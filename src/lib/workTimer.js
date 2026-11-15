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

function saveLog(entries) {
  localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-LOG_LIMIT)));
}

/** Saves a session's runs in the day log; one corrected down to no time leaves it. */
function writeLogEntry(entry) {
  if (!entry?.id) return;
  const nextEntry = normalizeLogEntry(entry);
  const others = readLog().filter((item) => item.id !== String(entry.id));
  saveLog(nextEntry ? [...others, nextEntry] : others);
}

/** Takes `ms` off the end of finished runs: the latest time goes first. */
function trimRunsTail(runs, ms) {
  const next = normalizeRuns(runs).filter((run) => run.end && run.end > run.start);
  let left = ms;
  while (left > 0 && next.length) {
    const last = next[next.length - 1];
    const length = last.end - last.start;
    if (length > left) {
      next[next.length - 1] = { ...last, end: last.end - left };
      break;
    }
    next.pop();
    left -= length;
  }
  return next;
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

/**
 * The fields to change so a block shows `minutes` tracked; null when nothing changes.
 * A length the timer wrote (equal to the tracked time) follows the correction.
 */
export function workedMinutesPatch(block, minutes) {
  const before = Number(block?.workedMinutes) || 0;
  const after = Math.max(0, Math.round(Number(minutes) || 0));
  if (!block || after === before) return null;
  const timerLength = before > 0 && after > 0 && Number(block.duration) === before;
  return { workedMinutes: after || null, ...(timerLength ? { duration: after } : null) };
}

/** Adds `deltaMinutes` (negative takes off) to a block's tracked time; returns the minutes that changed. */
function shiftBlockWork(blockId, deltaMinutes) {
  if (!blockId || !deltaMinutes) return 0;
  const bundle = readPathBundleLocal();
  const block = bundle?.blocks?.find((item) => item.id === blockId);
  const before = Number(block?.workedMinutes) || 0;
  const patch = workedMinutesPatch(block, before + deltaMinutes);
  if (!patch) return 0;
  queuePathSave({
    ...bundle,
    blocks: bundle.blocks.map((item) => (
      item.id === blockId ? createEmptyBlock({ ...item, ...patch, updatedAt: nowIso() }) : item
    )),
    updatedAt: nowIso(),
  });
  return (patch.workedMinutes || 0) - before;
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
    lifeAreaId: source.lifeAreaId,
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

/**
 * The session after a correction of `deltaMs`; `recordedDeltaMs` of it was already
 * written to a block. Time taken off leaves the end of the runs, so the day line
 * shows the gap; time added sits before the latest run.
 */
function correctedSession(current, at, deltaMs, recordedDeltaMs = 0) {
  const elapsed = Math.max(0, sessionElapsedMs(current, at) + deltaMs);
  const targetMs = targetMsOf(current);
  const next = {
    ...current,
    accumulatedMs: elapsed,
    recordedMs: Math.max(0, Math.min(elapsed, (Number(current.recordedMs) || 0) + recordedDeltaMs)),
    // Silent: a correction does not ring the bells it passes.
    halfHoursChimed: Math.floor(elapsed / HALF_HOUR_MS),
    targetChimed: Boolean(targetMs) && elapsed >= targetMs,
  };
  if (deltaMs > 0) {
    const runs = normalizeRuns(current.runs);
    const last = runs.length - 1;
    return {
      ...next,
      // The running stretch still counts from `startedAt`; the addition is banked.
      accumulatedMs: elapsed - (current.running && current.startedAt ? Math.max(0, at - current.startedAt) : 0),
      runs: last >= 0
        ? runs.map((run, index) => (index === last ? { ...run, start: run.start - deltaMs } : run))
        : [{ start: (current.running && current.startedAt ? current.startedAt : at) - deltaMs, end: current.running ? null : at }],
      blockStartedAt: current.blockStartedAt ? current.blockStartedAt - deltaMs : current.blockStartedAt,
    };
  }
  const runs = trimRunsTail(closeOpenRun(current, at), -deltaMs);
  return {
    ...next,
    startedAt: current.running ? at : null,
    runs: current.running ? [...runs, { start: at, end: null }] : runs,
  };
}

/**
 * Corrects the time on the block being timed, in minutes. Negative takes the latest
 * time off (a timer left running); positive adds time before the latest run (a timer
 * started late). Time a pause already wrote to the block is corrected there too.
 */
export function adjustWorkTimer(deltaMinutes) {
  const current = session;
  const minutes = Math.round(Number(deltaMinutes) || 0);
  if (!current || !minutes) return;
  const at = Date.now();
  let deltaMs = minutes * 60000;
  let recordedDeltaMs = 0;
  if (minutes > 0) {
    // A paused timer has written its time already, so the addition goes to the block now.
    if (!current.running) recordedDeltaMs = shiftBlockWork(current.blockId, minutes) * 60000;
  } else {
    const elapsed = sessionElapsedMs(current, at);
    const recorded = Math.min(elapsed, Number(current.recordedMs) || 0);
    // First the stretch not written anywhere yet, then what this session wrote to the block.
    const fromLive = Math.min(-deltaMs, elapsed - recorded);
    const restMinutes = Math.round(Math.min(-deltaMs - fromLive, recorded) / 60000);
    const fromBlock = restMinutes ? -shiftBlockWork(current.blockId, -restMinutes) * 60000 : 0;
    deltaMs = -(fromLive + fromBlock);
    recordedDeltaMs = -fromBlock;
  }
  if (!deltaMs) return;
  const next = correctedSession(current, at, deltaMs, recordedDeltaMs);
  commit(next);
  if (!next.running) writeLogEntry(next);
}

/**
 * After `minutes` came off a block's tracked time by hand: the same time leaves the
 * timer still paused on that block, or else the block's latest entries in the day log.
 */
export function trimBlockTimerRecords(blockId, minutes) {
  let left = Math.round(Number(minutes) || 0) * 60000;
  if (!blockId || left <= 0) return;
  if (session?.blockId === blockId) {
    // A running timer has not written this stretch yet; the correction was to earlier time.
    if (session.running) return;
    const take = Math.min(left, Number(session.recordedMs) || 0);
    if (!take) return;
    const next = correctedSession(session, Date.now(), -take, -take);
    commit(next);
    writeLogEntry(next);
    return;
  }
  const log = readLog();
  for (let index = log.length - 1; index >= 0 && left > 0; index -= 1) {
    const entry = log[index];
    if (entry.blockId !== blockId) continue;
    const total = entry.runs.reduce((sum, run) => sum + (run.end - run.start), 0);
    const take = Math.min(left, total);
    log[index] = { ...entry, runs: trimRunsTail(entry.runs, take) };
    left -= take;
  }
  saveLog(log.filter((entry) => entry.runs.length));
}

export function markWorkTimerChimed({ target = false, halfHours = 0 } = {}) {
  if (!session) return;
  const targetChimed = session.targetChimed || target;
  const halfHoursChimed = Math.max(session.halfHoursChimed || 0, halfHours);
  if (targetChimed === session.targetChimed && halfHoursChimed === session.halfHoursChimed) return;
  commit({ ...session, targetChimed, halfHoursChimed });
}

// Partials of a small struck bell: [frequency ratio, share of the peak, share of the ring time].
const BELL_PARTIALS = [
  [1, 1, 1],
  [2, 0.45, 0.6],
  [3, 0.2, 0.4],
  [4.2, 0.12, 0.25],
];

function playBell(strikes) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume?.().catch(() => {});
    let last = null;
    let lastEnd = 0;
    for (const strike of strikes) {
      const start = ctx.currentTime + (strike.at || 0);
      for (const [ratio, level, length] of BELL_PARTIALS) {
        const end = start + strike.ring * length;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = strike.frequency * ratio;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(strike.peak * level, start + 0.006);
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
    }
    if (last) last.onended = () => ctx.close();
  } catch {
    /* a missing audio device should not stop the timer */
  }
}

export function chimeWorkTimer() {
  playBell([
    { frequency: 659, peak: 0.3, ring: 1.6 },
    { frequency: 784, at: 0.35, peak: 0.3, ring: 1.6 },
    { frequency: 988, at: 0.7, peak: 0.32, ring: 3 },
  ]);
}

/** A two-tone bell, loud enough to notice from another app. */
export function chimeHalfHour() {
  playBell([
    { frequency: 988, peak: 0.3, ring: 2.2 },
    { frequency: 784, at: 0.5, peak: 0.3, ring: 2.8 },
  ]);
}
