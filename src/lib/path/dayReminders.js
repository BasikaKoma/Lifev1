import { localTodayIsoDate } from '../../utils/selfDateUtils';
import { createEmptyBlock, isReminder, toIsoDate } from './schema';
import { blockStatusAt, compareBlocks } from './logic';

export const REMINDER_MAX_LENGTH = 200;

const LEADING_CLOCK = /^(?:στις\s+)?(\d{1,2}):(\d{2})(?:\s*[-–—·]\s*|\s+)(\S.*)$/i;
const TRAILING_CLOCK = /^(.*?\S)\s+(?:στις\s+)?(\d{1,2}):(\d{2})$/i;

function clock(hours, minutes) {
  const h = Number(hours);
  const m = Number(minutes);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Still waiting: not done and not skipped. */
export function isOpenReminder(block) {
  return block?.status !== 'Done' && block?.status !== 'Skipped';
}

/**
 * The day a reminder shows on. While open it never stays behind: once its day has
 * passed it shows on today. Closed, it shows on the day it was closed when that is
 * later than its own. Its `date` is not changed by any of this.
 */
export function reminderDay(block, today = localTodayIsoDate()) {
  const date = block?.date || null;
  if (!date) return null;
  if (isOpenReminder(block)) return date < today ? today : date;
  const closedAt = new Date(blockStatusAt(block) || '');
  const closedDay = Number.isNaN(closedAt.getTime()) ? null : toIsoDate(closedAt);
  return closedDay && closedDay > date ? closedDay : date;
}

/** True while an open reminder shows on a later day than its own. */
export function isCarriedReminder(block, today = localTodayIsoDate()) {
  return isOpenReminder(block) && Boolean(block?.date) && block.date < today;
}

/** A day's reminders: open ones first (those left longest on top), then the closed ones. */
export function remindersForDate(blocks = [], date, today = localTodayIsoDate()) {
  return (blocks || [])
    .filter((block) => isReminder(block) && reminderDay(block, today) === date)
    .sort((a, b) => (
      Number(!isOpenReminder(a)) - Number(!isOpenReminder(b))
      || String(a.date).localeCompare(String(b.date))
      || compareBlocks(a, b)
    ));
}

/**
 * What was typed, split into the text and an optional clock at either end:
 * "10:30 Κάρμεν: λίστα" and "Κάρμεν: λίστα στις 10:30" both ring at 10:30.
 */
export function parseReminderText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, REMINDER_MAX_LENGTH);
  const leading = text.match(LEADING_CLOCK);
  if (leading && clock(leading[1], leading[2])) {
    return { title: leading[3].trim(), startTime: clock(leading[1], leading[2]) };
  }
  const trailing = text.match(TRAILING_CLOCK);
  if (trailing && clock(trailing[2], trailing[3])) {
    return { title: trailing[1].trim(), startTime: clock(trailing[2], trailing[3]) };
  }
  return { title: text, startTime: null };
}

/** The text a reminder is edited as; parseReminderText reads it back. */
export function reminderEditText(block) {
  const title = String(block?.title || '').trim();
  return block?.startTime ? `${block.startTime} ${title}` : title;
}

/**
 * A new reminder for a day from typed text; null when nothing was typed.
 * `atTime` is the hour it was started from on the grid; a clock in the text wins over it.
 */
export function createReminder(date, value, atTime = null) {
  const { title, startTime } = parseReminderText(value);
  if (!title || !date) return null;
  return createEmptyBlock({
    kind: 'reminder',
    title,
    date,
    startTime: startTime || atTime,
    // Not a kind of work: an app that predates reminders shows it as a plain personal block.
    blockType: 'Personal',
    status: 'Planned',
  });
}

/** The same reminder with new text; null when the text was emptied. */
export function renameReminder(block, value) {
  const { title, startTime } = parseReminderText(value);
  if (!title) return null;
  return { ...block, title, startTime };
}
