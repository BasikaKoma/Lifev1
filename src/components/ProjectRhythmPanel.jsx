import { useEffect, useMemo, useState } from 'react';
import {
  RHYTHM_WEEKDAYS,
  addRhythmItem,
  dueRhythmItems,
  isRhythmDue,
  normalizeProjectRhythm,
  patchRhythmItem,
  presentRhythmItem,
  removeRhythmItem,
  rhythmDayLabel,
  rhythmDayScore,
  rhythmToday,
  setRhythmDoneTime,
  shiftRhythmDate,
  toggleRhythmDone,
  weekStartIso,
  weeklyItemsForWeek,
  weekdayFromIso,
  weekdayLabel,
} from '../utils/projectRhythm';
import './projectRhythm.css';

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function ProjectRhythmButton({ open, scoreLabel, onClick }) {
  return (
    <button
      type="button"
      className={`projects-canvas__fab-btn project-rhythm-fab${open ? ' projects-canvas__fab-btn--active' : ''}`}
      onClick={onClick}
      aria-expanded={open}
      aria-label={scoreLabel ? `Ρυθμός ${scoreLabel}` : 'Ρυθμός'}
      title="Ρυθμός"
    >
      <RepeatIcon />
      <span className="project-rhythm-fab__label">Ρυθμός</span>
      {scoreLabel ? <span className="project-rhythm-fab__count">{scoreLabel}</span> : null}
    </button>
  );
}

function WeekdayChips({ cadence, weekdays, onChange }) {
  const selected = new Set(weekdays || []);
  const everyDay = cadence === 'daily' && selected.size === 0;

  const toggle = (value) => {
    if (cadence === 'weekly') {
      onChange([value]);
      return;
    }
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange([...next]);
  };

  return (
    <div className="project-rhythm__days" role="group" aria-label="Μέρες">
      {cadence === 'daily' ? (
        <button
          type="button"
          className={`project-rhythm__day${everyDay ? ' project-rhythm__day--on' : ''}`}
          aria-pressed={everyDay}
          onClick={() => onChange([])}
        >
          Κάθε
        </button>
      ) : null}
      {RHYTHM_WEEKDAYS.map((day) => {
        const on = cadence === 'weekly' ? weekdays?.[0] === day.value : selected.has(day.value);
        return (
          <button
            key={day.value}
            type="button"
            className={`project-rhythm__day${on ? ' project-rhythm__day--on' : ''}`}
            aria-pressed={on}
            aria-label={day.label}
            onClick={() => toggle(day.value)}
          >
            {day.short}
          </button>
        );
      })}
    </div>
  );
}

function dueMeta(item) {
  if (item.cadence === 'weekly') return weekdayLabel(item.weekdays?.[0]);
  if (!item.weekdays?.length) return 'Κάθε μέρα';
  return item.weekdays.map((day) => RHYTHM_WEEKDAYS.find((entry) => entry.value === day)?.short).filter(Boolean).join(' ');
}

function ScheduleRow({ item, meta }) {
  return (
    <li className="project-rhythm__item">
      <span className="project-rhythm__mark" aria-hidden />
      <div className="project-rhythm__item-copy">
        <span className="project-rhythm__item-label">{item.label}</span>
        {meta ? <span className="project-rhythm__item-meta">{meta}</span> : null}
      </div>
    </li>
  );
}

function ActionRow({ item, today, onToggle, onTime }) {
  if (item.cadence === 'weekly' || isRhythmDue(item, today)) {
    return <TodayRow item={item} onToggle={onToggle} onTime={onTime} />;
  }
  const meta = [
    item.cadence === 'daily' && item.weekdays?.length ? dueMeta(item) : '',
    item.defaultTime,
  ].filter(Boolean).join(' · ');
  return <ScheduleRow item={item} meta={meta} />;
}

function TodayRow({ item, onToggle, onTime }) {
  const meta = [dueMeta(item), !item.done ? item.defaultTime : ''].filter(Boolean).join(' · ');
  return (
    <li className={`project-rhythm__item${item.done ? ' project-rhythm__item--done' : ''}`}>
      <button
        type="button"
        className={`project-rhythm__check${item.done ? ' project-rhythm__check--done' : ''}`}
        aria-pressed={item.done}
        aria-label={`${item.done ? 'Αναίρεση' : 'Ολοκλήρωση'} · ${item.label}`}
        onClick={() => onToggle(item)}
      >
        {item.done ? '✓' : ''}
      </button>
      <div className="project-rhythm__item-copy">
        <span className="project-rhythm__item-label">{item.label}</span>
        {meta ? <span className="project-rhythm__item-meta">{meta}</span> : null}
      </div>
      {item.done ? (
        <input
          type="time"
          className="project-rhythm__done-time"
          value={item.time || ''}
          aria-label={`Ώρα ολοκλήρωσης · ${item.label}`}
          onChange={(event) => onTime?.(item, event.target.value)}
        />
      ) : null}
    </li>
  );
}

function DayNav({ date, onChange }) {
  const today = rhythmToday();
  const label = rhythmDayLabel(date);
  const onToday = date === today;
  return (
    <div className="project-rhythm__daynav">
      <button type="button" aria-label="Προηγούμενη μέρα" onClick={() => onChange(shiftRhythmDate(date, -1))}>
        ‹
      </button>
      {onToday ? (
        <span className="project-rhythm__daynav-label">{label}</span>
      ) : (
        <button type="button" className="project-rhythm__daynav-label" title="Πίσω στο σήμερα" onClick={() => onChange(today)}>
          {label}
        </button>
      )}
      <button
        type="button"
        aria-label="Επόμενη μέρα"
        disabled={onToday}
        onClick={() => onChange(shiftRhythmDate(date, 1))}
      >
        ›
      </button>
    </div>
  );
}

function EditorRow({ item, onPatch, onRemove }) {
  const [label, setLabel] = useState(item.label);

  useEffect(() => {
    setLabel(item.label);
  }, [item.id, item.label]);

  const commitLabel = () => {
    const text = label.trim();
    if (!text) {
      setLabel(item.label);
      return;
    }
    if (text !== item.label) onPatch({ label: text });
  };

  return (
    <li className="project-rhythm__editor">
      <div className="project-rhythm__editor-top">
        <input
          className="project-rhythm__name"
          value={label}
          aria-label={`Όνομα · ${item.label}`}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={commitLabel}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <input
          type="time"
          className="project-rhythm__time"
          value={item.defaultTime || ''}
          aria-label={`Ώρα · ${item.label}`}
          onChange={(event) => onPatch({ defaultTime: event.target.value })}
        />
        <button
          type="button"
          className="project-rhythm__remove"
          aria-label={`Αφαίρεση ${item.label}`}
          onClick={() => onRemove(item.id)}
        >
          ×
        </button>
      </div>
      <WeekdayChips
        cadence={item.cadence}
        weekdays={item.weekdays}
        onChange={(weekdays) => onPatch({ weekdays })}
      />
    </li>
  );
}

function Stack({ title, items, children }) {
  return (
    <section>
      <h3 className="project-rhythm__stack-title">
        {title}
        <span>{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="project-rhythm__empty">Καμία ακόμα.</p>
      ) : (
        <ul className="project-rhythm__list">{children}</ul>
      )}
    </section>
  );
}

export function ProjectRhythmPanel({ rhythm, onChange, onClose }) {
  const data = useMemo(() => normalizeProjectRhythm(rhythm), [rhythm]);
  const today = rhythmToday();
  const [viewDate, setViewDate] = useState(today);
  const [tab, setTab] = useState('today');
  const [settings, setSettings] = useState(false);
  const scoreDate = tab === 'today' && !settings ? viewDate : today;
  const due = useMemo(() => dueRhythmItems(data, viewDate), [data, viewDate]);
  const score = useMemo(() => rhythmDayScore(data, scoreDate), [data, scoreDate]);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftCadence, setDraftCadence] = useState('daily');
  const [draftDays, setDraftDays] = useState([]);
  const [draftTime, setDraftTime] = useState('');

  const dailyDue = due.filter((item) => item.cadence === 'daily');
  const weeklyDue = useMemo(() => weeklyItemsForWeek(data, viewDate), [data, viewDate]);
  const dailyItems = data.items
    .filter((item) => item.cadence === 'daily')
    .map((item) => presentRhythmItem(data, item, today));
  const weeklyItems = data.items.filter((item) => item.cadence === 'weekly');
  const weeklyByDay = RHYTHM_WEEKDAYS.map((day) => ({
    ...day,
    items: weeklyItems
      .filter((item) => item.weekdays?.[0] === day.value)
      .map((item) => presentRhythmItem(data, item, today)),
  })).filter((day) => day.items.length > 0);
  const todayWeekday = weekdayFromIso(today);

  const update = (next) => onChange?.(next);

  const handleAdd = (event) => {
    event.preventDefault();
    const next = addRhythmItem(data, {
      label: draftLabel,
      cadence: draftCadence,
      weekdays: draftDays,
      defaultTime: draftTime,
    });
    if (next.items.length === data.items.length) return;
    update(next);
    setDraftLabel('');
    setDraftTime('');
    setDraftDays(draftCadence === 'weekly' ? [1] : []);
  };

  return (
    <aside
      className="project-rhythm"
      aria-label={settings ? 'Ρυθμίσεις ρυθμού' : 'Ρυθμός project'}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="project-rhythm__header">
        <div>
          <div className="project-rhythm__title-row">
            <p className="project-rhythm__eyebrow">ΡΥΘΜΟΣ</p>
            <button
              type="button"
              className={`project-rhythm__settings${settings ? ' project-rhythm__settings--on' : ''}`}
              aria-pressed={settings}
              aria-label="Ρυθμίσεις"
              title="Ρυθμίσεις"
              onClick={() => setSettings((open) => !open)}
            >
              <SettingsIcon />
            </button>
          </div>
          <p className="project-rhythm__score">
            {settings ? (
              'Όρισε τις πράξεις αυτού του project'
            ) : score.total > 0 ? (
              <>
                <strong>{score.label}</strong>
                <span>{scoreDate === today ? ' σήμερα' : ` · ${rhythmDayLabel(scoreDate)}`}</span>
              </>
            ) : (
              'Σταθερές πράξεις αυτού του project'
            )}
          </p>
        </div>
        <button type="button" className="project-rhythm__close" onClick={onClose} aria-label="Κλείσιμο">
          ×
        </button>
      </header>

      {!settings ? <div className="project-rhythm__tabs" role="tablist" aria-label="Ρυθμός">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'today'}
          className={`project-rhythm__tab${tab === 'today' ? ' project-rhythm__tab--active' : ''}`}
          onClick={() => setTab('today')}
        >
          Σήμερα
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          className={`project-rhythm__tab${tab === 'all' ? ' project-rhythm__tab--active' : ''}`}
          onClick={() => setTab('all')}
        >
          Όλες
        </button>
      </div> : null}

      <div className="project-rhythm__body">
        {settings ? (
          <>
            <Stack title="Ημερήσιες" items={dailyItems}>
              {dailyItems.map((item) => (
                <EditorRow
                  key={item.id}
                  item={item}
                  onPatch={(patch) => update(patchRhythmItem(data, item.id, patch))}
                  onRemove={(id) => update(removeRhythmItem(data, id))}
                />
              ))}
            </Stack>
            <Stack title="Εβδομαδιαίες" items={weeklyItems}>
              {weeklyItems.map((item) => (
                <EditorRow
                  key={item.id}
                  item={item}
                  onPatch={(patch) => update(patchRhythmItem(data, item.id, patch))}
                  onRemove={(id) => update(removeRhythmItem(data, id))}
                />
              ))}
            </Stack>
          </>
        ) : tab === 'today' ? (
          <>
            <DayNav date={viewDate} onChange={(isoDate) => setViewDate(isoDate > today ? today : isoDate)} />
            {dailyDue.length === 0 && weeklyDue.length === 0 ? (
              <p className="project-rhythm__empty">
                {viewDate === today ? 'Τίποτα για σήμερα.' : `Τίποτα για ${rhythmDayLabel(viewDate)}.`}
              </p>
            ) : (
              <>
                {dailyDue.length > 0 ? (
                  <Stack title="Κάθε μέρα" items={dailyDue}>
                    {dailyDue.map((item) => (
                      <TodayRow
                        key={item.id}
                        item={item}
                        onToggle={(entry) => update(toggleRhythmDone(data, entry.id, viewDate))}
                        onTime={(entry, time) => update(setRhythmDoneTime(data, entry.id, viewDate, time))}
                      />
                    ))}
                  </Stack>
                ) : null}
                {weeklyDue.length > 0 ? (
                  <Stack title={weekStartIso(viewDate) === weekStartIso(today) ? 'Αυτή την εβδομάδα' : 'Εβδομάδα'} items={weeklyDue}>
                    {weeklyDue.map((item) => (
                      <TodayRow
                        key={item.id}
                        item={item}
                        onToggle={(entry) => update(toggleRhythmDone(data, entry.id, viewDate))}
                        onTime={(entry, time) => update(setRhythmDoneTime(data, entry.id, viewDate, time))}
                      />
                    ))}
                  </Stack>
                ) : null}
              </>
            )}
          </>
        ) : (
          <>
            <Stack title="Ημερήσιες" items={dailyItems}>
              {dailyItems.map((item) => (
                <ActionRow
                  key={item.id}
                  item={item}
                  today={today}
                  onToggle={(entry) => update(toggleRhythmDone(data, entry.id, today))}
                  onTime={(entry, time) => update(setRhythmDoneTime(data, entry.id, today, time))}
                />
              ))}
            </Stack>
            {weeklyByDay.length === 0 ? (
              <Stack title="Εβδομαδιαίες" items={[]} />
            ) : weeklyByDay.map((day) => (
              <Stack
                key={day.value}
                title={day.value === todayWeekday ? `${day.label} · σήμερα` : day.label}
                items={day.items}
              >
                {day.items.map((item) => (
                  <ActionRow
                    key={item.id}
                    item={item}
                    today={today}
                    onToggle={(entry) => update(toggleRhythmDone(data, entry.id, today))}
                    onTime={(entry, time) => update(setRhythmDoneTime(data, entry.id, today, time))}
                  />
                ))}
              </Stack>
            ))}
          </>
        )}
      </div>

      {settings ? (
        <form className="project-rhythm__composer" onSubmit={handleAdd}>
          <div className="project-rhythm__seg" role="group" aria-label="Συχνότητα">
            <button
              type="button"
              aria-pressed={draftCadence === 'daily'}
              onClick={() => {
                setDraftCadence('daily');
                setDraftDays([]);
              }}
            >
              Ημέρα
            </button>
            <button
              type="button"
              aria-pressed={draftCadence === 'weekly'}
              onClick={() => {
                setDraftCadence('weekly');
                setDraftDays([1]);
              }}
            >
              Εβδομάδα
            </button>
          </div>
          <div className="project-rhythm__compose-row">
            <input
              className="project-rhythm__name"
              value={draftLabel}
              placeholder="π.χ. Follow-up πελατών"
              aria-label="Νέα πράξη"
              onChange={(event) => setDraftLabel(event.target.value)}
            />
            <input
              type="time"
              className="project-rhythm__time"
              value={draftTime}
              aria-label="Ώρα"
              onChange={(event) => setDraftTime(event.target.value)}
            />
            <button type="submit" className="project-rhythm__add">+</button>
          </div>
          <WeekdayChips cadence={draftCadence} weekdays={draftDays} onChange={setDraftDays} />
        </form>
      ) : null}
    </aside>
  );
}
