import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDayTodo,
  formatFullDayLabel,
  getDayEntry,
  getRoutineDayScore,
  getRoutineWeekScore,
  groupRoutinesByStack,
  kindLabel,
  formatNoteClock,
  mergeDayRoutines,
  normalizeRoutineTemplates,
  stampNewJournalBlocks,
  toggleRoutineDone,
} from '../utils/lifelineDays';
import { getSelfHubDayEntry } from '../utils/selfHubDays';
import { resolveProjectDayForView } from '../utils/selfHubSync';
import { localTodayIsoDate } from '../utils/selfDateUtils';
import {
  createDayProgressModel,
  normalizeTimelineSnapshot,
  resolveDayTimeline,
  timelineSnapshotSignature,
} from '../utils/selfHubTimelineEvents';
import { SelfDayProgress } from './self/hub/SelfDayProgress';
import { getDayLabView } from '../utils/lifelineSelfMetrics';
import { healthMetricsToLifelinePatch } from '../lib/health/healthToLifeline';
import { getSelfMetricVariant } from '../utils/selfMetricVariant';
import { fetchOuraMetricsForDay } from '../lib/oura';
import { fetchMetricsForDay, appendWaistReading } from '../lib/health/healthMetrics';
import {
  buildWeightCardFromReadings,
  getWeightReadingsForDay,
} from '../lib/health/weightReadings';
import {
  buildWaistCardFromReadings,
  getWaistReadingsForDay,
} from '../lib/health/waistReadings';
import { DAY_VIEW_PHASE, DAY_VIEW_BODY_MS, originPercentFromRects, originToCssVars } from '../hooks/useLifelineDayView';
import { SelfMetricCard } from './self/SelfMetricCard';
import { SelfChart } from './self/SelfCharts';
import { SelfIcon } from './self/SelfIcons';
import { WaistLogForm } from './self/WaistLogForm';
import { ThoughtItem } from './ThoughtItem';
import { appendThought, visibleThoughts } from '../utils/dayThoughts';
import './SelfView.css';
import './selfHub.css';
import './DayLab.css';

function hasDayLabChart(card) {
  return card?.chart?.type === 'weightLine';
}

function dayLabMetricCardClass(kind, card) {
  return [
    'day-lab__weight-card',
    kind === 'waist' ? 'day-lab__weight-card--waist' : '',
    hasDayLabChart(card) ? 'day-lab__weight-card--chart' : '',
  ].filter(Boolean).join(' ');
}

/**
 * Premium Day Lab — Self-style emerald panels inside Projects panel.
 * Day view: real metrics when synced, otherwise No data. Notes / todos always editable.
 */
export function LifelineDayModal({
  open,
  date,
  phase = DAY_VIEW_PHASE.timeline,
  origin = null,
  originRect = null,
  onClose,
  backLabel = '← Lifeline',
  ...bodyProps
}) {
  const closeBtnRef = useRef(null);
  const returning = phase === DAY_VIEW_PHASE.returningToTimeline;
  const visible =
    open
    && date
    && phase !== DAY_VIEW_PHASE.timeline
    && phase !== DAY_VIEW_PHASE.daySelected;
  const [bodyReady, setBodyReady] = useState(false);
  const originCss = origin?.x && origin?.y
    ? origin
    : originPercentFromRects(originRect, null);

  useEffect(() => {
    if (!visible) {
      setBodyReady(false);
      return undefined;
    }
    if (returning) return undefined;
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const t = window.setTimeout(() => setBodyReady(true), reduced ? 0 : DAY_VIEW_BODY_MS);
    return () => window.clearTimeout(t);
  }, [visible, returning]);

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  useEffect(() => {
    if (!bodyReady) return undefined;
    const id = window.requestAnimationFrame(() => {
      closeBtnRef.current?.focus?.({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [bodyReady]);

  if (!visible) return null;

  return (
    <div
      className={[
        'lifeline-day-view',
        returning ? 'lifeline-day-view--returning' : 'lifeline-day-view--expanded',
      ].join(' ')}
      style={originToCssVars(originCss)}
      role="region"
      aria-label={`Ημέρα ${formatFullDayLabel(date)}`}
    >
      <div className="lifeline-day-view__veil" aria-hidden="true" />
      <div className="lifeline-day-view__slit" aria-hidden="true" />
      <div className="lifeline-day-view__surface" aria-hidden="true" />
      {bodyReady ? (
        <div className="lifeline-day-view__content">
          <header className="day-lab__header">
            <button
              ref={closeBtnRef}
              type="button"
              className="day-lab__back"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose?.();
              }}
            >
              {backLabel}
            </button>
          </header>
          <div className="day-lab__body">
            <DayLabBody
              open={open}
              date={date}
              {...bodyProps}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DayLabBody({
  open,
  date,
  lifelineDays,
  selfHubDays = {},
  routineTemplates = [],
  projectActivity = [],
  stages = [],
  pathBundle = null,
  onUpdateDay,
  onOpenPathRoutines,
  onPromoteThought,
  onKeepThought,
  onDismissThought,
  onAddThought,
}) {
  const entry = useMemo(() => {
    const lifelineEntry = getDayEntry(lifelineDays, date);
    if (!date || date !== localTodayIsoDate()) return lifelineEntry;

    const hubEntry = getSelfHubDayEntry(selfHubDays, date);
    return {
      ...lifelineEntry,
      notes: hubEntry.journal?.notes || lifelineEntry.notes,
      todos: hubEntry.journal?.todos?.length ? hubEntry.journal.todos : lifelineEntry.todos,
      routines:
        hubEntry.journal?.routines && Object.keys(hubEntry.journal.routines).length
          ? hubEntry.journal.routines
          : lifelineEntry.routines,
      metrics: hubEntry.health || lifelineEntry.metrics,
      timelineSnapshot: hubEntry.timeline || lifelineEntry.timelineSnapshot,
    };
  }, [lifelineDays, selfHubDays, date]);
  const [notes, setNotes] = useState(entry.notes);
  const [newThought, setNewThought] = useState('');
  const [savingThought, setSavingThought] = useState(false);
  const [newTodo, setNewTodo] = useState('');
  const [ouraRowForDay, setOuraRowForDay] = useState(null);
  const [healthMetricsForDay, setHealthMetricsForDay] = useState([]);

  const templates = useMemo(
    () => normalizeRoutineTemplates(routineTemplates),
    [routineTemplates]
  );

  const dayRoutines = useMemo(
    () => mergeDayRoutines(templates, entry.routines),
    [templates, entry.routines]
  );
  const routineStacks = useMemo(
    () => groupRoutinesByStack(dayRoutines),
    [dayRoutines]
  );
  const routineScore = useMemo(
    () => getRoutineDayScore(templates, entry.routines),
    [templates, entry.routines]
  );
  const routineWeek = useMemo(
    () => getRoutineWeekScore(lifelineDays, templates, date, (day) => getDayEntry(lifelineDays, day)),
    [lifelineDays, templates, date]
  );

  const projectDay = useMemo(
    () =>
      date
        ? resolveProjectDayForView({ selfHubDays, lifelineDays, date, projectActivity, stages, pathBundle })
        : { completed: [], notes: [], scheduled: [] },
    [selfHubDays, lifelineDays, projectActivity, stages, pathBundle, date],
  );
  const completed = projectDay.completed;

  const timeline = useMemo(
    () =>
      resolveDayTimeline({
        date,
        ouraRow: ouraRowForDay,
        routines: dayRoutines,
        projectDay,
        archived: entry.timelineSnapshot,
      }),
    [date, ouraRowForDay, dayRoutines, projectDay, entry.timelineSnapshot],
  );
  const dayProgress = useMemo(
    () => createDayProgressModel({ date, segments: timeline.segments }),
    [date, timeline.segments],
  );

  const visible = Boolean(open && date);

  useEffect(() => {
    if (!visible || !date) {
      setOuraRowForDay(null);
      setHealthMetricsForDay([]);
      return undefined;
    }

    let cancelled = false;
    const load = () => {
      Promise.all([
        fetchOuraMetricsForDay(date).catch(() => null),
        fetchMetricsForDay(date).catch(() => []),
      ]).then(([ouraRow, healthMetrics]) => {
        if (cancelled) return;
        setOuraRowForDay(ouraRow);
        setHealthMetricsForDay(healthMetrics ?? []);
      });
    };

    load();
    window.addEventListener('lifev1:health-metrics-changed', load);

    return () => {
      cancelled = true;
      window.removeEventListener('lifev1:health-metrics-changed', load);
    };
  }, [visible, date]);

  const dayLab = useMemo(() => {
    const fromHealth = !entry.metrics && healthMetricsForDay.length
      ? healthMetricsToLifelinePatch(date, healthMetricsForDay)
      : null;
    const view = getDayLabView({
      entryMetrics: entry.metrics || fromHealth,
      date,
      ouraRow: ouraRowForDay,
    });

    const readings = getWeightReadingsForDay(healthMetricsForDay, date);
    const waistReadings = getWaistReadingsForDay(healthMetricsForDay, date);
    const waistCard = buildWaistCardFromReadings(waistReadings, {
      delta: view.waist?.delta ?? null,
    });

    if (!readings.length) {
      return { ...view, waist: waistCard ?? view.waist ?? null };
    }

    const weightCard = buildWeightCardFromReadings(readings, {
      delta: view.weight?.delta ?? null,
    });
    if (!weightCard) return { ...view, waist: waistCard ?? view.waist ?? null };

    return {
      ...view,
      preview: false,
      weight: weightCard,
      waist: waistCard ?? view.waist ?? null,
    };
  }, [entry.metrics, date, ouraRowForDay, healthMetricsForDay]);

  useEffect(() => {
    if (!visible) return;
    setNotes(entry.notes);
    setNewTodo('');
  }, [visible, date, entry.notes]);

  const persistNotes = useCallback(
    (value) => {
      if (!date) return;
      onUpdateDay?.(date, { notes: stampNewJournalBlocks(entry.notes, value) });
    },
    [date, entry.notes, onUpdateDay]
  );

  useEffect(() => {
    if (!visible || !date || timeline.source !== 'live') return;
    const next = normalizeTimelineSnapshot({
      events: timeline.events,
      segments: timeline.segments,
      capturedAt: new Date().toISOString(),
    });
    if (!next) return;
    if (timelineSnapshotSignature(entry.timelineSnapshot) === timelineSnapshotSignature(next)) {
      return;
    }
    onUpdateDay?.(date, { timelineSnapshot: next });
  }, [visible, date, timeline, entry.timelineSnapshot, onUpdateDay]);

  const handleNotesBlur = () => {
    if (notes !== entry.notes) persistNotes(notes);
  };

  const handleAddTodo = (e) => {
    e.preventDefault();
    const text = newTodo.trim();
    if (!text || !date) return;
    const todos = [...entry.todos, createDayTodo(text)];
    onUpdateDay?.(date, { todos });
    setNewTodo('');
  };

  const toggleTodo = (todoId) => {
    if (!date) return;
    const todos = entry.todos.map((todo) =>
      todo.id === todoId ? { ...todo, done: !todo.done } : todo
    );
    onUpdateDay?.(date, { todos });
  };

  const removeTodo = (todoId) => {
    if (!date) return;
    onUpdateDay?.(date, { todos: entry.todos.filter((todo) => todo.id !== todoId) });
  };

  const patchRoutineLog = useCallback(
    (template, patch) => {
      if (!date) return;
      if (patch.done !== undefined && patch.time === undefined) {
        onUpdateDay?.(date, {
          routines: toggleRoutineDone(entry.routines, template, patch.done),
        });
        return;
      }
      const current = entry.routines[template.id] || { done: false, time: '' };
      onUpdateDay?.(date, {
        routines: {
          ...entry.routines,
          [template.id]: {
            done: patch.done ?? current.done,
            time: patch.time ?? current.time,
          },
        },
      });
    },
    [date, entry.routines, onUpdateDay]
  );

  const handleSaveWaist = useCallback(async (cm) => {
    if (!date) return null;
    const saved = await appendWaistReading({ waistCm: cm, day: date });
    const rows = await fetchMetricsForDay(date).catch(() => []);
    setHealthMetricsForDay(rows ?? []);
    return saved;
  }, [date]);

  if (!visible) return null;

  const pendingTodos = entry.todos.filter((todo) => !todo.done);
  const doneTodos = entry.todos.filter((todo) => todo.done);

  return (
    <>
        <div className="day-lab__hero">
          <p className="day-lab__eyebrow">Ημέρα</p>
          <h2 id="lifeline-day-modal-title" className="day-lab__title">
            {formatFullDayLabel(date)}
          </h2>
          {dayLab.dayScore ? (
            <div
              className="day-lab__hero-score"
              style={{ '--score': String(Math.max(0, Math.min(100, Number(dayLab.dayScore.value) || 0))) }}
            >
              <div className="day-lab__hero-score-ring" aria-hidden="true">
                <div className="day-lab__hero-score-core">
                  <span className="day-lab__hero-score-value">{dayLab.dayScore.display}</span>
                </div>
              </div>
              <p className="day-lab__hero-score-label">Day score</p>
            </div>
          ) : (
            <div className="day-lab__hero-score day-lab__hero-score--empty">
              <p className="day-lab__hero-score-label">Day score</p>
            </div>
          )}
        </div>
        <div className="day-lab__dashboard">
          <aside className="day-lab__column day-lab__column--left">
            <p className="day-lab__preview-tag">
              {dayLab.source === 'oura' ? 'Oura · Self' : dayLab.systemStatus?.sublabel || 'No data'}
            </p>
            {dayLab.leftMetrics.map((metric) => (
              <SelfMetricCard
                key={metric.id}
                metric={metric}
                variant={getSelfMetricVariant(metric)}
              />
            ))}
          </aside>

          <main className="day-lab__column day-lab__column--center">
            <section className="day-lab__panel day-lab__panel--routines">
              <h3 className="day-lab__panel-title">
                Ρουτίνες
                {routineScore.label ? ` · ${routineScore.label}` : ''}
                {routineWeek.label ? ` · ${routineWeek.label}` : ''}
              </h3>
              <p className="day-lab__panel-hint">
                Check για σήμερα. Οι ρουτίνες ορίζονται στο Path.
              </p>

              {routineStacks.length === 0 ? (
                <p className="day-lab__empty">
                  Δεν υπάρχουν ρουτίνες. Πρόσθεσέ τις στο Path → Routines.
                  {onOpenPathRoutines ? (
                    <>
                      {' '}
                      <button type="button" className="day-lab__link" onClick={onOpenPathRoutines}>
                        Άνοιξε Path
                      </button>
                    </>
                  ) : null}
                </p>
              ) : (
                routineStacks.map((stack) => (
                  <div key={stack.id} className="day-lab__routine-stack">
                    <p className="day-lab__routine-stack-label">{stack.label}</p>
                    <ul className="day-lab__routine-list">
                      {stack.items.map((routine) => (
                        <li
                          key={routine.id}
                          className={`day-lab__routine-item${routine.done ? ' day-lab__routine-item--done' : ''}`}
                        >
                          <label className="day-lab__routine-check">
                            <input
                              type="checkbox"
                              checked={routine.done}
                              onChange={() => patchRoutineLog(routine, { done: !routine.done })}
                            />
                            <span className="day-lab__routine-label">{routine.label}</span>
                          </label>
                          {routine.done && routine.time ? (
                            <span className="day-lab__routine-time-stamp">{routine.time}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </section>

            <section className="day-lab__panel">
              <h3 className="day-lab__panel-title">Σκέψεις</h3>
              <form
                className="day-lab__thought-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const text = newThought.trim();
                  if (!text || !date || savingThought) return;
                  setSavingThought(true);
                  try {
                    if (onAddThought && date === localTodayIsoDate()) {
                      await onAddThought(text);
                    } else {
                      onUpdateDay?.(date, {
                        thoughts: appendThought(entry.thoughts, text),
                      });
                    }
                    setNewThought('');
                  } finally {
                    setSavingThought(false);
                  }
                }}
              >
                <input
                  className="input"
                  value={newThought}
                  onChange={(event) => setNewThought(event.target.value)}
                  placeholder="Γρήγορη σκέψη…"
                  aria-label="Νέα σκέψη"
                />
                <button type="submit" className="btn btn--primary btn--sm" disabled={!newThought.trim() || savingThought}>
                  +
                </button>
              </form>
              {visibleThoughts(entry.thoughts, { includeDismissed: true }).length === 0 ? (
                <p className="day-lab__empty">Καμία σκέψη αυτή την ημέρα.</p>
              ) : (
                <ul className="thought-list day-lab__thoughts">
                  {[...visibleThoughts(entry.thoughts, { includeDismissed: true })].reverse().map((thought) => (
                    <ThoughtItem
                      key={thought.id}
                      thought={thought}
                      compact
                      onPromote={onPromoteThought ? (id, kind) => onPromoteThought(date, id, kind) : undefined}
                      onKeep={onKeepThought ? (id) => onKeepThought(date, id) : undefined}
                      onDismiss={onDismissThought ? (id) => onDismissThought(date, id) : undefined}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="day-lab__panel">
              <h3 className="day-lab__panel-title">Σημειώσεις ημέρας</h3>
              <textarea
                className="input textarea day-lab__notes"
                placeholder="Τι έγινε σήμερα; σκέψεις, στιγμές, μαθήματα…"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
              />
              {projectDay.notes.length > 0 ? (
                <ul className="day-lab__list day-lab__captured-notes">
                  {projectDay.notes.map((item) => (
                    <li key={item.id} className="day-lab__completed-item">
                      <span className="day-lab__kind day-lab__kind--note">
                        {kindLabel(item.kind) || 'Σημείωση'}
                      </span>
                      <div>
                        <span className="day-lab__completed-title">{item.title}</span>
                        <span className="day-lab__completed-meta">
                          {[item.timeLabel, item.projectTitle, item.stageTitle].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="day-lab__panel">
              <h3 className="day-lab__panel-title">Ολοκληρώθηκαν</h3>
              {completed.length === 0 ? (
                <p className="day-lab__empty">
                  Δεν βρέθηκαν ολοκληρωμένα αντικείμενα αυτή την ημέρα.
                </p>
              ) : (
                <ul className="day-lab__list">
                  {completed.map((item) => (
                    <li key={item.id} className="day-lab__completed-item">
                      <span className={`day-lab__kind day-lab__kind--${item.kind}`}>
                        {kindLabel(item.kind)}
                      </span>
                      <div>
                        <span className="day-lab__completed-title">{item.title}</span>
                        <span className="day-lab__completed-meta">
                          {[
                            item.timeLabel || (item.completedAt ? formatNoteClock(item.completedAt) : ''),
                            item.status,
                            item.projectTitle,
                            item.stageTitle,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="day-lab__panel">
              <h3 className="day-lab__panel-title">Να κάνω</h3>
              <form className="day-lab__todo-form" onSubmit={handleAddTodo}>
                <input
                  type="text"
                  className="input"
                  placeholder="Πρόσθεσε κάτι για αυτή την ημέρα…"
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                />
                <button type="submit" className="btn btn--primary btn--sm">
                  Προσθήκη
                </button>
              </form>

              {entry.todos.length === 0 ? (
                <p className="day-lab__empty">Δεν έχεις ακόμα tasks για αυτή την ημέρα.</p>
              ) : (
                <ul className="day-lab__list">
                  {[...pendingTodos, ...doneTodos].map((todo) => (
                    <li
                      key={todo.id}
                      className={`day-lab__todo-item${todo.done ? ' day-lab__todo-item--done' : ''}`}
                    >
                      <label className="day-lab__todo-label">
                        <input
                          type="checkbox"
                          checked={todo.done}
                          onChange={() => toggleTodo(todo.id)}
                        />
                        <span>{todo.text}</span>
                      </label>
                      <button
                        type="button"
                        className="day-lab__todo-remove"
                        onClick={() => removeTodo(todo.id)}
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </main>

          <aside className="day-lab__column day-lab__column--right">
            <p className="day-lab__preview-tag">
              {dayLab.source === 'oura' ? 'Oura · Self' : dayLab.systemStatus?.sublabel || 'No data'}
            </p>
            {dayLab.rightMetrics.map((metric) => (
              <SelfMetricCard
                key={metric.id}
                metric={metric}
                variant={getSelfMetricVariant(metric)}
              />
            ))}
            {dayLab.weight?.kg != null && (
              <article className={dayLabMetricCardClass('weight', dayLab.weight)}>
                <header className="day-lab__weight-header">
                  <span className="day-lab__weight-icon" aria-hidden="true">
                    <SelfIcon name="weight" />
                  </span>
                  <span className="day-lab__weight-label">{dayLab.weight.label}</span>
                  {dayLab.weight.delta != null ? (
                    <span
                      className={`day-lab__weight-delta${
                        dayLab.weight.delta > 0.1
                          ? ' day-lab__weight-delta--up'
                          : dayLab.weight.delta < -0.1
                            ? ' day-lab__weight-delta--down'
                            : ''
                      }`}
                    >
                      {dayLab.weight.delta > 0 ? '+' : ''}
                      {dayLab.weight.delta.toFixed(1)} {dayLab.weight.unit}
                    </span>
                  ) : !hasDayLabChart(dayLab.weight) && dayLab.weight.status ? (
                    <span className="day-lab__weight-status">{dayLab.weight.status}</span>
                  ) : null}
                </header>
                <p className="day-lab__weight-value">
                  {typeof dayLab.weight.kg === 'number'
                    ? dayLab.weight.kg.toFixed(1)
                    : dayLab.weight.kg}
                  <span className="day-lab__weight-unit">{dayLab.weight.unit}</span>
                </p>
                {hasDayLabChart(dayLab.weight) ? (
                  <SelfChart chart={dayLab.weight.chart} />
                ) : null}
              </article>
            )}
            {dayLab.waist?.cm != null ? (
              <article className={dayLabMetricCardClass('waist', dayLab.waist)}>
                <header className="day-lab__weight-header">
                  <span className="day-lab__weight-icon" aria-hidden="true">
                    <SelfIcon name="waist" />
                  </span>
                  <span className="day-lab__weight-label">{dayLab.waist.label || 'Μέση'}</span>
                  {dayLab.waist.delta != null ? (
                    <span
                      className={`day-lab__weight-delta${
                        dayLab.waist.delta > 0.3
                          ? ' day-lab__weight-delta--up'
                          : dayLab.waist.delta < -0.3
                            ? ' day-lab__weight-delta--down'
                            : ''
                      }`}
                    >
                      {dayLab.waist.delta > 0 ? '+' : ''}
                      {dayLab.waist.delta.toFixed(1)} {dayLab.waist.unit}
                    </span>
                  ) : !hasDayLabChart(dayLab.waist) && dayLab.waist.status ? (
                    <span className="day-lab__weight-status">{dayLab.waist.status}</span>
                  ) : null}
                </header>
                <p className="day-lab__weight-value">
                  {typeof dayLab.waist.cm === 'number'
                    ? dayLab.waist.cm.toFixed(1)
                    : dayLab.waist.cm}
                  <span className="day-lab__weight-unit">cm</span>
                </p>
                {hasDayLabChart(dayLab.waist) ? (
                  <SelfChart chart={dayLab.waist.chart} />
                ) : null}
              </article>
            ) : (
              <article className="day-lab__weight-card day-lab__weight-card--waist day-lab__weight-card--log">
                <header className="day-lab__weight-header">
                  <span className="day-lab__weight-icon" aria-hidden="true">
                    <SelfIcon name="waist" />
                  </span>
                  <span className="day-lab__weight-label">Μέση</span>
                </header>
                <p className="day-lab__weight-status">Καταχώρισε μέση σε εκατοστά</p>
                <WaistLogForm compact onSave={handleSaveWaist} />
              </article>
            )}
          </aside>
        </div>

        <div className="day-lab__timeline">
          <SelfDayProgress
            dayProgress={dayProgress}
            events={timeline.events}
            embedded
            live={date === localTodayIsoDate()}
          />
        </div>
    </>
  );
}
