/**
 * Turns Path blocks, routines and project rhythm into the reminders the server sends.
 * Pure: the same inputs on any device give the same keys, so devices can prune each other's rows.
 */
import { formatBlockWindow, pendingTemplateDays } from '../path/logic';
import { normalizeRoutineLog, normalizeRoutineTemplates } from '../../utils/lifelineRoutines';
import { isRhythmDue, normalizeProjectRhythm, presentRhythmItem } from '../../utils/projectRhythm';

export const SCHEDULE_HORIZON_MS = 36 * 60 * 60 * 1000;
/** Anything closer than this would race the per-minute dispatch, so it is left out. */
const MIN_LEAD_MS = 30 * 1000;
const OPEN_BLOCK_STATUSES = new Set(['Planned', 'Moved']);

function pad(value) {
  return String(value).padStart(2, '0');
}

export function localIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shiftIsoDate(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return localIsoDate(new Date(y, m - 1, d + days));
}

/** Local wall-clock time on a date → Date, or null when the time is missing/invalid. */
export function atLocalTime(isoDate, hhmm) {
  const date = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const time = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!date || !time) return null;
  const at = new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]), Number(time[1]), Number(time[2]), 0, 0);
  return Number.isNaN(at.getTime()) ? null : at;
}

function reminder(kind, baseKey, fireAt, title, body, url) {
  return { key: `${baseKey}@${fireAt.toISOString()}`, kind, fireAt, title, body, url };
}

function windowDates(now) {
  const today = localIsoDate(now);
  return [today, shiftIsoDate(today, 1)];
}

/** Dated blocks plus weekly template days that Path has not turned into blocks yet. */
function openBlocksForDate(pathBundle, isoDate) {
  const blocks = (pathBundle?.blocks || []).filter(
    (block) => block?.date === isoDate && OPEN_BLOCK_STATUSES.has(block.status || 'Planned')
  );
  const fromTemplates = pendingTemplateDays(pathBundle, [isoDate])
    .map(({ template }) => ({ ...template, id: null, templateId: template.id, date: isoDate, status: 'Planned' }));
  return [...blocks, ...fromTemplates].sort((a, b) =>
    String(a.startTime || '99:99').localeCompare(String(b.startTime || '99:99'))
  );
}

function blockKey(block) {
  return block.templateId ? `block:tpl:${block.templateId}:${block.date}` : `block:${block.id}`;
}

function blockTitle(block) {
  return String(block.title || block.blockType || 'Time block').trim();
}

function blockReminders(pathBundle, dates, settings) {
  const lead = Number(settings.blockLeadMinutes) || 0;
  const out = [];
  for (const isoDate of dates) {
    for (const block of openBlocksForDate(pathBundle, isoDate)) {
      const startsAt = atLocalTime(isoDate, block.startTime);
      if (!startsAt) continue;
      const fireAt = new Date(startsAt.getTime() - lead * 60000);
      const when = lead ? `Ξεκινά σε ${lead}′` : 'Ξεκινά τώρα';
      const span = formatBlockWindow(block.startTime, block.duration);
      const body = [when, span, block.blockType].filter(Boolean).join(' · ');
      out.push(reminder('block', blockKey(block), fireAt, blockTitle(block), body, '/path/week'));
    }
  }
  return out;
}

function dayPlanReminders(pathBundle, dates, settings) {
  const out = [];
  for (const isoDate of dates) {
    const fireAt = atLocalTime(isoDate, settings.dayPlanTime);
    if (!fireAt) continue;
    const blocks = openBlocksForDate(pathBundle, isoDate);
    if (!blocks.length) continue;
    const first = blocks.find((block) => block.startTime) || blocks[0];
    const count = blocks.length === 1 ? '1 block' : `${blocks.length} blocks`;
    const firstLine = first.startTime ? `πρώτο στις ${first.startTime}: ${blockTitle(first)}` : blockTitle(first);
    out.push(
      reminder('dayplan', `dayplan:${isoDate}`, fireAt, 'Η μέρα σου', `${count} σήμερα · ${firstLine}`, '/self')
    );
  }
  return out;
}

function routineReminders(routineTemplates, lifelineDays, dates) {
  const templates = normalizeRoutineTemplates(routineTemplates);
  const out = [];
  for (const isoDate of dates) {
    const log = normalizeRoutineLog(lifelineDays?.[isoDate]?.routines);
    for (const template of templates) {
      if (log[template.id]?.done) continue;
      const fireAt = atLocalTime(isoDate, template.defaultTime);
      if (!fireAt) continue;
      out.push(
        reminder('routine', `routine:${template.id}:${isoDate}`, fireAt, template.label, `Ρουτίνα · ${template.defaultTime}`, '/path/routines')
      );
    }
  }
  return out;
}

function rhythmReminders(rhythmProjects, dates) {
  const out = [];
  for (const project of rhythmProjects || []) {
    const rhythm = normalizeProjectRhythm(project?.recurring);
    for (const isoDate of dates) {
      for (const item of rhythm.items) {
        if (!item.defaultTime || !isRhythmDue(item, isoDate)) continue;
        if (presentRhythmItem(rhythm, item, isoDate).done) continue;
        const fireAt = atLocalTime(isoDate, item.defaultTime);
        if (!fireAt) continue;
        const body = [project.title, item.defaultTime].filter(Boolean).join(' · ');
        out.push(reminder('rhythm', `rhythm:${project.id}:${item.id}:${isoDate}`, fireAt, item.label, body, '/projects'));
      }
    }
  }
  return out;
}

function withinWindow(reminders, now) {
  const from = now.getTime() + MIN_LEAD_MS;
  const to = now.getTime() + SCHEDULE_HORIZON_MS;
  const seen = new Set();
  return reminders.filter((item) => {
    const at = item.fireAt.getTime();
    if (at < from || at > to || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

export function buildReminders({ pathBundle, routineTemplates, lifelineDays, rhythmProjects, settings, now = new Date() }) {
  if (!settings?.enabled) return [];
  const dates = windowDates(now);
  const all = [
    ...(settings.blocks ? blockReminders(pathBundle, dates, settings) : []),
    ...(settings.dayPlan ? dayPlanReminders(pathBundle, dates, settings) : []),
    ...(settings.routines ? routineReminders(routineTemplates, lifelineDays, dates) : []),
    ...(settings.rhythm ? rhythmReminders(rhythmProjects, dates) : []),
  ];
  return withinWindow(all, now).sort((a, b) => a.fireAt - b.fireAt);
}

/** "Time's up" for a running work timer with a target. */
export function buildTimerReminders(session, settings, now = new Date()) {
  if (!settings?.enabled || !settings.timer) return [];
  if (!session?.running || !session.startedAt || session.targetChimed) return [];
  const targetMs = Number(session.targetMinutes) * 60000;
  if (!(targetMs > 0)) return [];
  const remaining = targetMs - (Number(session.accumulatedMs) || 0);
  const fireAt = new Date(session.startedAt + remaining);
  const body = `${session.targetMinutes}′ ολοκληρώθηκαν · ${session.blockType || 'Time block'}`;
  return withinWindow(
    [reminder('timer', `timer:${session.id}`, fireAt, `Τέλος χρόνου: ${session.label}`, body, '/path/week')],
    now
  );
}
