import { blockStartMinutes, todayPathBlocks, withBlockDuration } from './path/logic';
import { toIsoDate } from './path/schema';
import { readPathBundleLocal } from './path/store';
import {
  getWorkTimerSnapshot,
  pauseWorkTimer,
  resumeWorkTimer,
  startBlockTimer,
} from './workTimer';

/** The open block planned for `now`: one of that day's whose time window holds the minute. */
export function blockPlannedAt(bundle, now = new Date()) {
  const minute = now.getHours() * 60 + now.getMinutes();
  return todayPathBlocks(bundle, toIsoDate(now)).find((block) => {
    if (block.status !== 'Planned' && block.status !== 'Moved') return false;
    const start = blockStartMinutes(block);
    if (start == null) return false;
    return minute >= start && minute < start + Number(withBlockDuration(block).duration);
  }) || null;
}

/**
 * One key for the whole timer (the desktop shortcut): pauses it while it runs and
 * resumes it while paused. With no timer it starts the block planned for right now;
 * false when there is none, so the caller can show the app to pick one.
 */
export function toggleWorkTimer() {
  const session = getWorkTimerSnapshot();
  if (session?.running) {
    pauseWorkTimer();
    return true;
  }
  if (session) {
    resumeWorkTimer();
    return true;
  }
  const block = blockPlannedAt(readPathBundleLocal());
  if (!block) return false;
  startBlockTimer(block);
  return true;
}
