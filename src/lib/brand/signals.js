import { addDays, toDateString } from '../../utils/lifeline';
import { getDayEntry, collectCompletedItemsForDate } from '../../utils/lifelineDays';
import { getSelfHubDayEntry } from '../../utils/selfHubDays';
import { localTodayIsoDate } from '../../utils/selfDateUtils';
import {
  isCoreBrandProject,
  isExcludedProject,
  isLessonOnlyProject,
} from './schema';

const LOOKBACK_DAYS = 7;

function lastNDates(endDate, count) {
  const end = toDateString(endDate) || localTodayIsoDate();
  const dates = [];
  for (let i = 0; i < count; i += 1) {
    const key = addDays(end, -i);
    if (key) dates.push(key);
  }
  return dates;
}

function compact(text, max = 220) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function hashId(parts) {
  return parts.filter(Boolean).join(':');
}

function classifyText(text, projectTitle = '') {
  const blob = `${projectTitle} ${text}`.toLowerCase();
  if (/αποτυχ|failure|έσπασ|έκανα λάθος|κόλλησα|δυσκολ/i.test(blob)) return 'failure';
  if (/απόφαση|decision|άλλαξα|pivot|σταματ|δεν θα/i.test(blob)) return 'decision';
  if (/κατάλαβα|realized|το πρόβλημα δεν|έμαθα ότι|insight/i.test(blob)) return 'lesson';
  if (/διαλογισ|meditation|αυτογνωσ|lifeeffect|συνείδησ/i.test(blob)) return 'thought';
  if (/\bai\b|τεχνητή|δημιουργία|επιχειρημα/i.test(blob)) return 'thought';
  if (isCoreBrandProject(projectTitle) || /symphon|erp|δεδομέν/i.test(blob)) return 'project_update';
  return 'thought';
}

function pillarFor(kind, text, projectTitle = '') {
  const blob = `${projectTitle} ${text}`.toLowerCase();
  if (/διαλογισ|meditation|αυτογνωσ|lifeeffect|συνείδησ/i.test(blob)) return 'self';
  if (/\bai\b|τεχνητή νοημοσύνη/i.test(blob)) return 'ai';
  if (kind === 'decision' || kind === 'failure') return 'decisions';
  if (isCoreBrandProject(projectTitle) || /building|in public|lifev1|symphon/i.test(blob)) return 'building';
  return 'entrepreneurship';
}

function suggestedFormat(kind) {
  if (kind === 'failure' || kind === 'decision') return 'LinkedIn post';
  if (kind === 'lesson') return 'LinkedIn post / Talking-head Reel';
  if (kind === 'project_update') return 'LinkedIn post / Carousel';
  return 'LinkedIn post / X';
}

function whyFor(kind) {
  if (kind === 'failure') return 'Η δυσκολία είναι το σημείο που ο αναγνώστης βλέπει τον εαυτό του — όχι τη νίκη.';
  if (kind === 'decision') return 'Μια αλλαγή κατεύθυνσης δείχνει πώς σκέφτεσαι, όχι τι πουλάς.';
  if (kind === 'lesson') return 'Κάτι που κατάλαβες δουλεύοντας αξίζει περισσότερο από οποιαδήποτε λίστα συμβουλών.';
  if (kind === 'project_update') return 'Η εξέλιξη ενός πραγματικού προϊόντος είναι απόδειξη, όχι branding.';
  return 'Μια σκέψη από τη ζωή σου είναι ήδη πιο συγκεκριμένη από generic AI ιδέες.';
}

function allowProject(title) {
  if (!title) return true;
  if (isExcludedProject(title)) return false;
  return true;
}

function asLessonOnly(title, kind) {
  if (!isLessonOnlyProject(title)) return kind;
  return kind === 'project_update' ? 'lesson' : kind;
}

export function detectBrandSignals({
  lifelineDays = {},
  selfHubDays = {},
  projectActivity = [],
  items = [],
  dismissedSignalIds = [],
  lookbackDays = LOOKBACK_DAYS,
} = {}) {
  const today = localTodayIsoDate();
  const dates = lastNDates(today, lookbackDays);
  const dismissed = new Set(dismissedSignalIds || []);
  const usedSources = new Set(
    (items || []).map((item) => item.sourceId).filter(Boolean),
  );
  const signals = [];

  const push = (signal) => {
    if (!signal?.id || dismissed.has(signal.id) || usedSources.has(signal.id)) return;
    if (!signal.what || signal.what.length < 12) return;
    signals.push(signal);
  };

  for (const date of dates) {
    const day = getDayEntry(lifelineDays, date);
    const hub = getSelfHubDayEntry(selfHubDays, date);
    const notes = compact(day.notes || hub.journal?.notes, 280);
    if (notes) {
      const kind = classifyText(notes);
      push({
        id: hashId(['lifeline', date, 'notes']),
        date,
        kind,
        pillarId: pillarFor(kind, notes),
        what: notes,
        why: whyFor(kind),
        angle: suggestedFormat(kind),
        sourceLabel: `Lifeline · ${date}`,
        sourceKind: 'lifeline',
        title: compact(notes, 72),
      });
    }

    const todos = (day.todos?.length ? day.todos : hub.journal?.todos || [])
      .filter((todo) => String(todo.text || '').trim().length > 8)
      .slice(0, 4);
    for (const todo of todos) {
      const text = compact(todo.text, 200);
      const kind = classifyText(text);
      push({
        id: hashId(['lifeline', date, 'todo', todo.id]),
        date,
        kind,
        pillarId: pillarFor(kind, text),
        what: text,
        why: whyFor(kind),
        angle: suggestedFormat(kind),
        sourceLabel: `Lifeline · ${date}`,
        sourceKind: 'lifeline',
        title: compact(text, 72),
      });
    }

    const timeline = Array.isArray(hub.timeline)
      ? hub.timeline
      : Array.isArray(hub.timeline?.events)
        ? hub.timeline.events
        : [];
    for (const event of timeline) {
      const type = String(event.type || '');
      if (!['note', 'idea', 'session', 'tag'].includes(type)) continue;
      const text = compact(event.label || event.text, 200);
      const kind = type === 'session' ? 'thought' : classifyText(text);
      push({
        id: hashId(['self', date, event.id || type, text.slice(0, 24)]),
        date,
        kind: type === 'session' ? 'thought' : kind,
        pillarId: type === 'session' ? 'self' : pillarFor(kind, text),
        what: text,
        why: type === 'session'
          ? 'Ένα πείραμα αυτογνωσίας ή διαλογισμού αξίζει μόνο αν πεις τι άλλαξε μέσα σου.'
          : whyFor(kind),
        angle: type === 'session' ? 'Talking-head Reel / LinkedIn post' : suggestedFormat(kind),
        sourceLabel: `Self · ${date}`,
        sourceKind: 'self',
        title: compact(text, 72),
      });
    }

    const completed = collectCompletedItemsForDate(projectActivity, date);
    for (const item of completed) {
      if (!allowProject(item.projectTitle)) continue;
      const text = compact(item.title, 220);
      let kind = asLessonOnly(item.projectTitle, classifyText(text, item.projectTitle));
      if (isLessonOnlyProject(item.projectTitle)) {
        kind = 'lesson';
      }
      push({
        id: hashId(['project', item.id]),
        date,
        kind,
        pillarId: pillarFor(kind, text, item.projectTitle),
        what: `${item.projectTitle}: ${text}`,
        why: isLessonOnlyProject(item.projectTitle)
          ? 'Το Market Portal μπαίνει μόνο ως εμπειρία ή μάθημα — όχι ως προϊόν του personal brand.'
          : whyFor(kind),
        angle: suggestedFormat(kind),
        sourceLabel: item.projectTitle,
        sourceKind: 'project',
        title: compact(`${item.projectTitle}: ${text}`, 80),
      });
    }
  }

  for (const project of projectActivity || []) {
    if (!allowProject(project.title)) continue;
    const open = [];
    for (const stage of project.stages || []) {
      for (const checkpoint of stage.checkpoints || []) {
        if (checkpoint.done || checkpoint.archived) continue;
        const title = compact(checkpoint.title || checkpoint.metricName, 160);
        if (!title) continue;
        open.push({ stageTitle: stage.title, title, id: checkpoint.id });
      }
    }
    if (!open.length) continue;
    const top = open[0];
    const kind = asLessonOnly(project.title, isCoreBrandProject(project.title) ? 'project_update' : 'thought');
    push({
      id: hashId(['project-open', project.id, top.id]),
      date: today,
      kind,
      pillarId: pillarFor(kind, top.title, project.title),
      what: `Στο ${project.title} δουλεύεις ακόμα: ${top.title}`,
      why: isCoreBrandProject(project.title)
        ? 'Η εξέλιξη ή το πρόβλημα στο προϊόν είναι σήμα περιεχομένου — όχι status update.'
        : whyFor(kind),
      angle: suggestedFormat(kind),
      sourceLabel: project.title,
      sourceKind: 'project',
      title: compact(`${project.title}: ${top.title}`, 80),
    });
  }

  const scored = signals
    .map((signal, index) => ({
      ...signal,
      score:
        (signal.kind === 'lesson' ? 8 : 0) +
        (signal.kind === 'failure' || signal.kind === 'decision' ? 7 : 0) +
        (isCoreBrandProject(signal.sourceLabel) ? 6 : 0) +
        (signal.sourceKind === 'lifeline' ? 3 : 0) +
        Math.max(0, 4 - index * 0.05),
    }))
    .sort((a, b) => b.score - a.score);

  const unique = [];
  const seenWhat = new Set();
  for (const signal of scored) {
    const key = signal.what.toLowerCase().slice(0, 80);
    if (seenWhat.has(key)) continue;
    seenWhat.add(key);
    unique.push(signal);
    if (unique.length >= 8) break;
  }
  return unique;
}

export function buildWeeklyDirection(signals = [], items = []) {
  const recent = (signals || []).slice(0, 8);
  const drafting = (items || []).filter((item) => item.stage === 'drafting' || item.stage === 'selected');
  const directions = [];

  for (const signal of recent) {
    directions.push({
      id: `dir-${signal.id}`,
      title: signal.title,
      why: signal.why,
      sourceLabel: signal.sourceLabel,
    });
    if (directions.length >= 5) break;
  }

  if (!directions.length) {
    for (const item of drafting.slice(0, 3)) {
      directions.push({
        id: `dir-item-${item.id}`,
        title: item.title || compact(item.body, 72),
        why: 'Έχεις ήδη κάτι δικό σου στο pipeline. Ολοκλήρωσέ το πριν μαζέψεις άλλες ιδέες.',
        sourceLabel: item.sourceLabel || 'Draft',
      });
    }
  }

  return {
    headline: directions.length
      ? 'Η ιστορία αυτής της εβδομάδας βγαίνει από όσα έγιναν — όχι από λίστες ιδεών.'
      : 'Δεν υπάρχουν αρκετά πραγματικά γεγονότα ακόμα. Γράψε στο Quick Capture ό,τι συνέβη σήμερα.',
    directions: directions.slice(0, 5),
  };
}

export function buildBrandBalance(items = []) {
  const publishedOrReady = (items || []).filter((item) =>
    ['drafting', 'ready', 'published'].includes(item.stage),
  );
  const counts = {};
  for (const pillar of ['entrepreneurship', 'building', 'decisions', 'self', 'ai']) {
    counts[pillar] = 0;
  }
  for (const item of publishedOrReady) {
    const key = item.pillarId && counts[item.pillarId] != null ? item.pillarId : 'entrepreneurship';
    counts[key] += 1;
  }
  const total = publishedOrReady.length;
  const target = Math.max(total, 4);
  return {
    total,
    bars: [
      { id: 'entrepreneurship', label: 'Entrepreneurship', value: Math.round(((counts.entrepreneurship || 0) / target) * 100) },
      { id: 'building', label: 'Building in public', value: Math.round(((counts.building || 0) / target) * 100) },
      { id: 'decisions', label: 'Decisions & failures', value: Math.round(((counts.decisions || 0) / target) * 100) },
      { id: 'self', label: 'Self-awareness', value: Math.round(((counts.self || 0) / target) * 100) },
      { id: 'ai', label: 'AI & human', value: Math.round(((counts.ai || 0) / target) * 100) },
    ].map((bar) => ({ ...bar, value: Math.min(100, bar.value || (total ? 8 : 0)) })),
  };
}

export function weekStats(items = []) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const inWeek = (iso) => {
    const t = new Date(iso || 0).getTime();
    return Number.isFinite(t) && t >= weekAgo;
  };
  const ideas = items.filter((item) => item.stage === 'idea' && inWeek(item.createdAt)).length;
  const drafts = items.filter((item) => ['selected', 'drafting'].includes(item.stage) && inWeek(item.updatedAt)).length;
  const published = items.filter((item) => item.stage === 'published' && inWeek(item.publishedAt || item.updatedAt)).length;
  const consistency = Math.min(100, ideas * 12 + drafts * 22 + published * 28);
  return { ideas, drafts, published, consistency };
}
