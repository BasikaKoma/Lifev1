import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDayTodo,
  createRoutineTemplate,
  formatFullDayLabel,
  getDayEntry,
  getRoutineDayScore,
  getRoutineWeekScore,
  groupRoutinesByStack,
  kindLabel,
  formatNoteClock,
  mergeDayRoutines,
  normalizeRoutineTemplates,
  ROUTINE_STACK_ORDER,
  ROUTINE_STACKS,
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
import { fetchMetricsForDay } from '../lib/health/healthMetrics';
import {
  buildWeightCardFromReadings,
  getWeightReadingsForDay,
} from '../lib/health/weightReadings';
import { DAY_VIEW_PHASE } from '../hooks/useLifelineDayView';
import { SelfMetricCard } from './self/SelfMetricCard';
import { SelfChart } from './self/SelfCharts';
import { SelfIcon } from './self/SelfIcons';
import './SelfView.css';
import './selfHub.css';
import './DayLab.css';

/**
 * Premium Day Lab — Self-style emerald panels inside Projects panel.
 * Day view: real metrics when synced, otherwise No data. Notes / todos always editable.
 */
export function LifelineDayModal({
  open,
  date,
  phase = DAY_VIEW_PHASE.timeline,
  lifelineDays,
  selfHubDays = {},
  routineTemplates = [],
  projectActivity = [],
  stages = [],
  pathBundle = null,
  onUpdateDay,
  onUpdateRoutineTemplates,
  onClose,
  backLabel = '← Lifeline',
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
  const [newTodo, setNewTodo] = useState('');
  const [newRoutineLabel, setNewRoutineLabel] = useState('');
  const [newRoutineTime, setNewRoutineTime] = useState('');
  const [newRoutineStack, setNewRoutineStack] = useState('morning');
  const closeBtnRef = useRef(null);
  const [arrived, setArrived] = useState(false);
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
    () => groupRoutinesByStack(dayRoutines, { includeEmpty: true }),
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

  const visible =
    open
    && date
    && phase !== DAY_VIEW_PHASE.timeline
    && phase !== DAY_VIEW_PHASE.daySelected;

  useEffect(() => {
    if (!visible || !date) {
      setOuraRowForDay(null);
      setHealthMetricsForDay([]);
      return undefined;
    }

    let cancelled = false;
    Promise.all([
      fetchOuraMetricsForDay(date).catch(() => null),
      fetchMetricsForDay(date).catch(() => []),
    ]).then(([ouraRow, healthMetrics]) => {
      if (cancelled) return;
      setOuraRowForDay(ouraRow);
      setHealthMetricsForDay(healthMetrics ?? []);
    });

    return () => {
      cancelled = true;
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
    if (!readings.length) return view;

    const weightCard = buildWeightCardFromReadings(readings, {
      delta: view.weight?.delta ?? null,
    });
    if (!weightCard) return view;

    return {
      ...view,
      preview: false,
      weight: weightCard,
    };
  }, [entry.metrics, date, ouraRowForDay, healthMetricsForDay]);

  useEffect(() => {
    if (!visible) {
      setArrived(false);
      return undefined;
    }
    if (phase === DAY_VIEW_PHASE.returningToTimeline) {
      setArrived(false);
      return undefined;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setArrived(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [visible, phase]);

  useEffect(() => {
    if (!visible) return;
    setNotes(entry.notes);
    setNewTodo('');
    setNewRoutineLabel('');
    setNewRoutineTime('');
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

  const handleAddRoutineTemplate = (e) => {
    e.preventDefault();
    const label = newRoutineLabel.trim();
    if (!label) return;
    const next = [
      ...templates,
      createRoutineTemplate(label, { defaultTime: newRoutineTime, stack: newRoutineStack }),
    ];
    onUpdateRoutineTemplates?.(next);
    setNewRoutineLabel('');
    setNewRoutineTime('');
  };

  const handleRemoveRoutineTemplate = (templateId) => {
    onUpdateRoutineTemplates?.(templates.filter((t) => t.id !== templateId));
    if (!date) return;
    const { [templateId]: _, ...rest } = entry.routines;
    onUpdateDay?.(date, { routines: rest });
  };

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  useEffect(() => {
    if (phase !== DAY_VIEW_PHASE.dayExpanded) return;
    const id = window.requestAnimationFrame(() => {
      closeBtnRef.current?.focus?.({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [phase]);

  const isOpenSurface = arrived && phase !== DAY_VIEW_PHASE.returningToTimeline;
  const returning = phase === DAY_VIEW_PHASE.returningToTimeline;
  const expanded = phase === DAY_VIEW_PHASE.dayExpanded;

  if (!visible) return null;

  const pendingTodos = entry.todos.filter((todo) => !todo.done);
  const doneTodos = entry.todos.filter((todo) => todo.done);

  return (
    <div
      className={[
        'lifeline-day-view',
        isOpenSurface ? 'lifeline-day-view--open' : '',
        expanded ? 'lifeline-day-view--expanded' : '',
        returning ? 'lifeline-day-view--returning' : '',
      ].filter(Boolean).join(' ')}
      role="region"
      aria-label={`Ημέρα ${formatFullDayLabel(date)}`}
    >
      <div className="lifeline-day-view__surface">
        <header className="day-lab__header">
          <button
            ref={closeBtnRef}
            type="button"
            className="day-lab__back"
            onClick={onClose}
          >
            {backLabel}
          </button>

          <div className="day-lab__title-block">
            <p className="day-lab__eyebrow">Ημέρα</p>
            <h2 id="lifeline-day-modal-title" className="day-lab__title">
              {formatFullDayLabel(date)}
            </h2>
          </div>

          <div className="day-lab__status" title={dayLab.source === 'oura' ? 'Oura metrics' : 'Day metrics'}>
            <span className="day-lab__status-dot" aria-hidden="true" />
            <div className="day-lab__status-text">
              <span className="day-lab__status-label">{dayLab.systemStatus.label}</span>
              <span className="day-lab__status-sub">{dayLab.systemStatus.sublabel}</span>
            </div>
          </div>
        </header>

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
                Ορίζεις τις πράξεις μία φορά. Κάθε μέρα κάνεις μόνο check — η ώρα γράφεται μόνη της.
              </p>

              {routineStacks.map((stack) => (
                <div key={stack.id} className="day-lab__routine-stack">
                  <p className="day-lab__routine-stack-label">{stack.label}</p>
                  {stack.items.length === 0 ? (
                    <p className="day-lab__empty">Τίποτα ακόμα σε αυτό το μπλοκ.</p>
                  ) : (
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
                          <input
                            type="time"
                            className="day-lab__routine-time input"
                            value={routine.time}
                            onChange={(e) => patchRoutineLog(routine, { time: e.target.value })}
                            aria-label={`Ώρα για ${routine.label}`}
                          />
                          <button
                            type="button"
                            className="day-lab__routine-remove"
                            onClick={() => handleRemoveRoutineTemplate(routine.id)}
                            aria-label={`Αφαίρεση ρουτίνας ${routine.label}`}
                            title="Αφαίρεση από όλες τις ημέρες"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              <form className="day-lab__routine-form" onSubmit={handleAddRoutineTemplate}>
                <select
                  className="input day-lab__routine-form-stack"
                  value={newRoutineStack}
                  onChange={(e) => setNewRoutineStack(e.target.value)}
                  aria-label="Στοίβα ρουτίνας"
                >
                  {ROUTINE_STACK_ORDER.map((id) => (
                    <option key={id} value={id}>{ROUTINE_STACKS[id].label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  className="input"
                  placeholder="π.χ. Ξύπνημα, Φως, Χωρίς οθόνη…"
                  value={newRoutineLabel}
                  onChange={(e) => setNewRoutineLabel(e.target.value)}
                />
                <input
                  type="time"
                  className="input day-lab__routine-form-time"
                  value={newRoutineTime}
                  onChange={(e) => setNewRoutineTime(e.target.value)}
                  aria-label="Προεπιλεγμένη ώρα (προαιρετικά)"
                />
                <button type="submit" className="btn btn--primary btn--sm">
                  + Ρουτίνα
                </button>
              </form>
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
            {dayLab.weight && (
              <article className="day-lab__weight-card">
                <header className="day-lab__weight-header">
                  <span className="day-lab__weight-icon" aria-hidden="true">
                    <SelfIcon name="weight" />
                  </span>
                  <span className="day-lab__weight-label">{dayLab.weight.label}</span>
                  {dayLab.weight.delta != null && (
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
                  )}
                </header>
                {dayLab.weight.kg != null ? (
                  <p className="day-lab__weight-value">
                    {typeof dayLab.weight.kg === 'number'
                      ? dayLab.weight.kg.toFixed(1)
                      : dayLab.weight.kg}
                    <span className="day-lab__weight-unit">{dayLab.weight.unit}</span>
                  </p>
                ) : null}
                {dayLab.weight.chart?.type === 'weightLine' ? (
                  <SelfChart chart={dayLab.weight.chart} />
                ) : (
                  <p className="day-lab__weight-status">{dayLab.weight.status || 'No data'}</p>
                )}
              </article>
            )}
            {dayLab.dayScore && (
              <div className="day-lab__score-card">
                <p className="day-lab__score-label">{dayLab.dayScore.label}</p>
                <p className="day-lab__score-value">{dayLab.dayScore.display}</p>
                <p className="day-lab__score-status">{dayLab.dayScore.status}</p>
              </div>
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
      </div>
    </div>
  );
}
