import { localTodayIsoDate } from '../utils/selfDateUtils';
import { blockStartMinutes, nextBlockOrder } from './path/logic';
import { blockArea, blockPausedMinutes, createEmptyBlock, isDeepWork, nowIso, toIsoDate } from './path/schema';
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
      // `splitOnResume`: the same fact in a timer saved before stops stayed inside their block.
      windowWritten: raw.windowWritten === true || raw.splitOnResume === true,
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

/** The minute of the clock `ms` falls in, so a difference is the one between two shown times. */
function clockMinute(ms) {
  return Math.floor(ms / 60000);
}

/** Saves what `change(block)` returns on the timer's block in Path; a block that is gone, or no change, saves nothing. */
function patchBlock(blockId, change) {
  if (!blockId) return;
  const bundle = readPathBundleLocal();
  const block = bundle?.blocks?.find((item) => item.id === blockId);
  const patch = block ? change(block) : null;
  if (!patch) return;
  queuePathSave({
    ...bundle,
    blocks: bundle.blocks.map((item) => (
      item.id === blockId ? createEmptyBlock({ ...item, ...patch, updatedAt: nowIso() }) : item
    )),
    updatedAt: nowIso(),
  });
}

/** The block without a stop at its very end: one the timer came back from with no work to count. */
function withoutTrailingPause(block) {
  const pauses = block.pauses || [];
  const last = pauses[pauses.length - 1];
  if (!last || last.at + last.minutes < (Number(block.duration) || 0)) return null;
  return { pauses: pauses.slice(0, -1), duration: last.at };
}

/**
 * Writes the minutes worked since the last write on the timer's block. A pause (`pausing`)
 * also moves the block to where the work really began. From then on (`windowWritten`) the
 * block's length follows the timer: work adds to it here, a stop in `recordBlockPause`.
 */
function recordBlockWork(value, minutes, { pausing = false } = {}) {
  patchBlock(value.blockId, (block) => {
    const worked = (Number(block.workedMinutes) || 0) + minutes;
    if (value.windowWritten) {
      if (!minutes) return withoutTrailingPause(block);
      return { workedMinutes: worked, duration: (Number(block.duration) || 0) + minutes };
    }
    if (!minutes) return null;
    if (!pausing) return { workedMinutes: worked };
    return {
      workedMinutes: worked,
      startTime: clockOf(value.blockStartedAt || value.startedAt),
      duration: minutes,
      pauses: [],
    };
  });
}

/** The stop that ends at `at` goes inside the block: from the end of the work written so far up to now. */
function recordBlockPause(value, at) {
  patchBlock(value.blockId, (block) => {
    const from = Number(block.duration) || 0;
    const minutes = clockMinute(at) - clockMinute(value.blockStartedAt) - from;
    if (from <= 0 || minutes <= 0) return null;
    return { pauses: [...(block.pauses || []), { at: from, minutes }], duration: from + minutes };
  });
}

/** Takes `minutes` off the block's latest stop and off its length: the work after it began that much earlier. */
function shortenLastPause(blockId, minutes) {
  patchBlock(blockId, (block) => {
    const pauses = block.pauses || [];
    const last = pauses[pauses.length - 1];
    if (!last) return null;
    const cut = Math.min(minutes, last.minutes);
    return {
      pauses: cut < last.minutes
        ? [...pauses.slice(0, -1), { at: last.at, minutes: last.minutes - cut }]
        : pauses.slice(0, -1),
      duration: Math.max(0, (Number(block.duration) || 0) - cut) || null,
    };
  });
}

/**
 * When a block the timer already ran on today, and whose time is over, is started again:
 * where it began, in ms. The work goes on in the same block and the time since is a stop
 * inside it. Null for a block whose length is not the timer's (planned, or set by hand).
 */
function timedWindowStart(block, at) {
  const start = blockStartMinutes(block);
  const worked = Number(block?.workedMinutes) || 0;
  const length = Number(block?.duration) || 0;
  if (start == null || !block.startedAt || !worked || length !== worked + blockPausedMinutes(block)) return null;
  const day = new Date(at);
  if (block.date !== toIsoDate(day)) return null;
  day.setHours(Math.floor(start / 60), start % 60, 0, 0);
  return clockMinute(day.getTime()) + length <= clockMinute(at) ? day.getTime() : null;
}

/** A block's stops that still have work after them once it shows `worked` minutes tracked. */
function pausesWithin(pauses, worked) {
  const kept = [];
  let paused = 0;
  for (const pause of pauses || []) {
    if (pause.at - paused >= worked) break;
    kept.push(pause);
    paused += pause.minutes;
  }
  return kept;
}

/**
 * The fields to change so a block shows `minutes` tracked; null when nothing changes.
 * A length the timer wrote (the tracked time and the stops in it) follows the correction,
 * and a stop left with no work after it goes.
 */
export function workedMinutesPatch(block, minutes) {
  const before = Number(block?.workedMinutes) || 0;
  const after = Math.max(0, Math.round(Number(minutes) || 0));
  if (!block || after === before) return null;
  const hasPauses = Boolean(block.pauses?.length);
  if (!after) return { workedMinutes: null, ...(hasPauses ? { pauses: [] } : null) };
  const timerLength = before > 0 && Number(block.duration) === before + blockPausedMinutes(block);
  if (!timerLength) return { workedMinutes: after };
  const pauses = pausesWithin(block.pauses, after);
  return {
    workedMinutes: after,
    duration: after + blockPausedMinutes({ pauses }),
    ...(hasPauses ? { pauses } : null),
  };
}

/** Adds `deltaMinutes` (negative takes off) to a block's tracked time; returns the minutes that changed. */
function shiftBlockWork(blockId, deltaMinutes) {
  if (!deltaMinutes) return 0;
  let changed = 0;
  patchBlock(blockId, (block) => {
    const before = Number(block.workedMinutes) || 0;
    const patch = workedMinutesPatch(block, before + deltaMinutes);
    changed = patch ? (patch.workedMinutes || 0) - before : 0;
    return patch;
  });
  return changed;
}

/** Marks the block started in Path, so every device drops its "starts in N′" reminder. */
function markBlockStarted(blockId, at) {
  patchBlock(blockId, (block) => (block.startedAt ? null : { startedAt: new Date(at).toISOString() }));
}

/** Work resumed on a later day than it stopped continues in a new block there: a block does not run overnight. */
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
    workDepth: source.workDepth,
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
  const stored = readPathBundleLocal().blocks?.find((item) => item.id === block.id) || block;
  const began = timedWindowStart(stored, at);
  const next = {
    id: `timer-${at}`,
    label: block.title || 'Time block',
    // A timer knows one thing about its block: 'Deep Work' (see isDeepWorkTimer), else a name to show.
    blockType: isDeepWork(block) ? 'Deep Work' : (blockArea(block) || 'Shallow Work'),
    blockId: block.id,
    // A block picked up again has its real length so far, not a planned one to count down.
    targetMinutes: !began && Number(block.duration) > 0 ? Number(block.duration) : null,
    startedAt: at,
    accumulatedMs: 0,
    running: true,
    targetChimed: false,
    halfHoursChimed: 0,
    runs: [{ start: at, end: null }],
    // Where the block begins on the clock; the stops in it are counted from here.
    blockStartedAt: began || at,
    recordedMs: 0,
    // True once the block's start and length are the timer's own, not the planned ones.
    windowWritten: Boolean(began),
  };
  commit(next);
  markBlockStarted(block.id, at);
  if (began) recordBlockPause(next, at);
}

/**
 * Pausing writes the block's time so far, ending it at the pause. Resuming goes on in the
 * same block, with the stop inside it; the stop also shows as a gap on the day line.
 */
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
    windowWritten: current.windowWritten || Boolean(minutes),
  };
  commit(next);
  if (elapsed >= MIN_RECORD_MS) writeLogEntry(next);
  recordBlockWork(current, minutes, { pausing: true });
}

export function resumeWorkTimer() {
  if (!session || session.running) return;
  const at = Date.now();
  const runs = normalizeRuns(session.runs);
  const pausedAt = runs[runs.length - 1]?.end || at;
  const overnight = toIsoDate(new Date(pausedAt)) !== toIsoDate(new Date(at));
  const nextBlockId = session.windowWritten && overnight ? openNextBlock(session.blockId, at) : null;
  if (session.windowWritten && !nextBlockId) recordBlockPause(session, at);
  commit({
    ...session,
    blockId: nextBlockId || session.blockId,
    blockStartedAt: nextBlockId ? at : session.blockStartedAt,
    windowWritten: nextBlockId ? false : session.windowWritten,
    running: true,
    startedAt: at,
    runs: [...runs, { start: at, end: null }],
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
  recordBlockWork(current, minutesFromElapsed(elapsed - (current.recordedMs || 0)));
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
      // A start no pause has written yet moves back with the added time; a written one stays,
      // and the next stop is that much shorter.
      blockStartedAt: current.blockStartedAt && !current.windowWritten
        ? current.blockStartedAt - deltaMs
        : current.blockStartedAt,
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
    // Resumed late: the added time comes out of the stop before the latest run.
    if (current.windowWritten) shortenLastPause(current.blockId, minutes);
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
