import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WaistLogForm } from '../WaistLogForm';
import {
  appendCircumferenceReading,
  fetchMetricsRange,
  isoDateDaysAgo,
  todayIsoDate,
} from '../../../lib/health/healthMetrics';
import { subscribeToHealthMetrics } from '../../../lib/health/healthSync';
import { fetchOuraMetricsRange } from '../../../lib/oura';
import {
  METRIC_HISTORY_DAYS,
  METRIC_HISTORY_KEYS,
  METRIC_HISTORY_SPECS,
  formatMetricDelta,
  formatMetricValue,
  metricDeltaTone,
  metricHistorySpec,
  summarizeMetricHistory,
} from '../../../lib/health/metricHistory';
import './SelfMetricDialog.css';

function dayDate(day) {
  return new Date(`${day}T12:00:00`);
}

function dayOffset(fromDay, toDay) {
  return Math.round((dayDate(toDay).getTime() - dayDate(fromDay).getTime()) / 86400000);
}

function formatShortDay(day) {
  return dayDate(day).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
}

function formatDay(day, today) {
  if (day === today) return 'Σήμερα';
  if (dayOffset(day, today) === 1) return 'Χθες';
  return dayDate(day).toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function clockTime(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

async function fetchMetricSource(spec) {
  const startDay = isoDateDaysAgo(METRIC_HISTORY_DAYS);
  const endDay = todayIsoDate();
  if (spec.source === 'oura') {
    const ouraRows = await fetchOuraMetricsRange({
      startDay,
      endDay,
      columns: ['day', 'synced_at', ...spec.ouraColumns].join(','),
    });
    return { ouraRows };
  }
  const healthMetrics = await fetchMetricsRange({ startDay, endDay, metricTypes: spec.healthTypes });
  return { healthMetrics };
}

/** Daily entries for `spec`, reloaded when health data changes (a save, the app regaining focus). */
function useMetricDays(spec) {
  const [state, setState] = useState({ key: null, loading: true, error: '', days: [] });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const source = await fetchMetricSource(spec);
        if (alive) setState({ key: spec.key, loading: false, error: '', days: spec.days(source) });
      } catch {
        if (alive) {
          setState((prev) => ({
            key: spec.key,
            loading: false,
            error: 'Δεν φορτώθηκε το ιστορικό. Δοκίμασε ξανά.',
            days: prev.key === spec.key ? prev.days : [],
          }));
        }
      }
    };
    load();
    const unsubscribe = subscribeToHealthMetrics(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [spec]);

  // Never show the previous metric's days while the new one loads.
  return state.key === spec.key ? state : { loading: true, error: '', days: [] };
}

function Icon({ name }) {
  const shapes = {
    x: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m9 6 6 6-6 6" />,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shapes[name]}
    </svg>
  );
}

function Value({ spec, value, unit = spec.unit, className = '' }) {
  const text = formatMetricValue(spec, value);
  return (
    <span className={className}>
      {text}
      {unit && text !== '—' ? <span className="smd-unit">{unit}</span> : null}
    </span>
  );
}

/** Daily values placed by date, so gaps between days with data show as gaps. */
function MetricTrend({ spec, history, today }) {
  const uid = useId().replace(/:/g, '');
  const points = [...history].reverse();
  if (points.length < 2) {
    return <p className="smd-trend-empty">Το γράφημα εμφανίζεται από τη δεύτερη ημέρα με δεδομένα.</p>;
  }

  const width = 320;
  const height = 132;
  const padX = 10;
  const padT = 16;
  const padB = 22;
  const firstDay = points[0].day;
  const span = Math.max(dayOffset(firstDay, points[points.length - 1].day), 1);
  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.01, 0.6) * 0.3;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const plotH = height - padT - padB;

  const coords = points.map((point) => ({
    ...point,
    x: padX + (dayOffset(firstDay, point.day) / span) * (width - padX * 2),
    y: padT + plotH - ((point.value - min) / (max - min)) * plotH,
  }));
  const line = coords.map((coord, index) => `${index ? 'L' : 'M'} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const area = `${line} L ${last.x.toFixed(1)} ${padT + plotH} L ${coords[0].x.toFixed(1)} ${padT + plotH} Z`;
  const unit = spec.unit ? ` ${spec.unit}` : '';
  // With months of daily data the dots crowd the line; keep only the latest one then.
  const dotted = coords.length <= 45 ? coords : [last];

  return (
    <svg
      className="smd-trend"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Πορεία ${spec.label}: από ${formatMetricValue(spec, rawMin)} έως ${formatMetricValue(spec, rawMax)}${unit}`}
    >
      <defs>
        <linearGradient id={`smd-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="smd-trend__fill-top" />
          <stop offset="100%" className="smd-trend__fill-bottom" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={padX} x2={width - padX} y1={padT + plotH * t} y2={padT + plotH * t} className="smd-trend__grid" />
      ))}
      <path d={area} fill={`url(#smd-fill-${uid})`} />
      <path d={line} className="smd-trend__line" />
      {dotted.map((coord) => (
        <circle
          key={coord.day}
          cx={coord.x}
          cy={coord.y}
          r={coord === last ? 4 : 2.6}
          className={`smd-trend__dot${coord.day === today ? ' smd-trend__dot--today' : ''}${coord === last ? ' smd-trend__dot--last' : ''}`}
        >
          <title>{`${formatShortDay(coord.day)} · ${formatMetricValue(spec, coord.value)}${unit}`}</title>
        </circle>
      ))}
      <text x={padX} y={height - 6} className="smd-trend__axis">{formatShortDay(firstDay)}</text>
      <text x={width - padX} y={height - 6} textAnchor="end" className="smd-trend__axis">
        {formatShortDay(points[points.length - 1].day)}
      </text>
    </svg>
  );
}

function StatTile({ spec, label, delta, hint, valueText }) {
  const unit = spec.deltaUnit ?? spec.unit;
  const text = valueText ?? formatMetricDelta(spec, delta);
  return (
    <div className="smd-stat">
      <dt>{label}</dt>
      <dd className={valueText ? undefined : `smd-tone--${metricDeltaTone(spec, delta)}`}>
        {text}
        {unit && text !== '—' ? <span className="smd-unit">{valueText ? spec.unit : unit}</span> : null}
      </dd>
      {hint ? <dd className="smd-hint">{hint}</dd> : null}
    </div>
  );
}

function Extras({ extras }) {
  return (
    <dl className="smd-extras">
      {extras.map((item) => (
        <div key={item.label} className="smd-extra">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function HistoryRow({ spec, entry, today, open, onToggle }) {
  const time = spec.source === 'health' ? clockTime(entry.recordedAt) : null;
  const meta = [time, entry.secondary].filter(Boolean).join(' · ');
  const expandable = entry.extras?.length > 0;
  const content = (
    <>
      <span className="smd-row__day">
        {formatDay(entry.day, today)}
        {meta ? <small>{meta}</small> : null}
      </span>
      <Value spec={spec} value={entry.value} className="smd-row__value" />
      <span
        className={`smd-row__delta smd-tone--${metricDeltaTone(spec, entry.delta)}`}
        title={entry.gapDays ? `σε ${entry.gapDays} ${entry.gapDays === 1 ? 'ημέρα' : 'ημέρες'}` : undefined}
      >
        {entry.delta == null ? 'πρώτη' : formatMetricDelta(spec, entry.delta)}
      </span>
      {expandable ? <span className={`smd-row__chevron${open ? ' is-open' : ''}`}><Icon name="chevron" /></span> : <span />}
    </>
  );

  return (
    <li className={`smd-row${entry.day === today ? ' smd-row--today' : ''}${open ? ' smd-row--open' : ''}`}>
      {expandable ? (
        <button type="button" className="smd-row__main" aria-expanded={open} onClick={onToggle}>
          {content}
        </button>
      ) : (
        <div className="smd-row__main">{content}</div>
      )}
      {open && expandable ? <Extras extras={entry.extras} /> : null}
    </li>
  );
}

function MetricDetail({ spec, today, titleId }) {
  const { loading, error, days } = useMetricDays(spec);
  const [openDay, setOpenDay] = useState(null);
  const summary = summarizeMetricHistory(spec, days, today);
  const { current, latest, previous, change7, change30 } = summary;
  const valueClass = `smd-value${formatMetricValue(spec, latest?.value ?? 0).length > 7 ? ' smd-value--long' : ''}`;

  return (
    <>
      <div className="smd-hero">
        <p className="smd-kicker">{`Σήμερα · ${dayDate(today).toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' })}`}</p>
        <h2 id={titleId} className="smd-title">{spec.label}</h2>
        {current ? (
          <>
            <p className={valueClass}>
              <Value spec={spec} value={current.value} />
            </p>
            {clockTime(current.recordedAt) ? (
              <p className="smd-sub">{spec.timeLabel} {clockTime(current.recordedAt)}</p>
            ) : null}
          </>
        ) : (
          <div className="smd-today-empty">
            <p className="smd-sub">
              {loading ? 'Φόρτωση…' : spec.canLog ? 'Δεν υπάρχει μέτρηση σήμερα' : 'Δεν υπάρχουν δεδομένα για σήμερα ακόμα'}
            </p>
            {!loading && spec.canLog ? (
              <WaistLogForm
                kind={spec.key}
                compact
                submitLabel="Καταγραφή"
                onSave={(cm) => appendCircumferenceReading({ kind: spec.key, cm })}
              />
            ) : null}
            {latest ? (
              <p className="smd-sub smd-sub--muted">
                Τελευταία: {formatMetricValue(spec, latest.value)}{spec.unit ? ` ${spec.unit}` : ''} · {formatDay(latest.day, today)}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {error ? <p className="smd-error" role="alert">{error}</p> : null}

      {latest?.extras?.length ? (
        <section className="smd-section">
          <h3 className="smd-section__title">
            Αναλυτικά <span>{formatDay(latest.day, today)}</span>
          </h3>
          <Extras extras={latest.extras} />
        </section>
      ) : null}

      {latest ? (
        <>
          <dl className="smd-stats">
            <StatTile
              spec={spec}
              label="Από την προηγούμενη"
              delta={latest.delta}
              hint={previous ? `vs ${formatShortDay(previous.day)}` : 'Πρώτη ημέρα με δεδομένα'}
            />
            <StatTile
              spec={spec}
              label="7 ημέρες"
              delta={change7?.delta ?? null}
              hint={change7 ? `από ${formatShortDay(change7.fromDay)}` : 'Χωρίς δεδομένα τότε'}
            />
            <StatTile
              spec={spec}
              label="30 ημέρες"
              delta={change30?.delta ?? null}
              hint={change30 ? `από ${formatShortDay(change30.fromDay)}` : 'Χωρίς δεδομένα τότε'}
            />
            <StatTile
              spec={spec}
              label={`Εύρος ${METRIC_HISTORY_DAYS} ημ.`}
              valueText={summary.min === summary.max
                ? formatMetricValue(spec, summary.min)
                : `${formatMetricValue(spec, summary.min)}–${formatMetricValue(spec, summary.max)}`}
              hint={`μ.ό. ${formatMetricValue(spec, summary.average)} · ${summary.count} ${summary.count === 1 ? 'ημέρα' : 'ημέρες'}`}
            />
          </dl>

          <section className="smd-section" aria-label="Πορεία">
            <MetricTrend spec={spec} history={summary.history} today={today} />
          </section>

          <section className="smd-section">
            <h3 className="smd-section__title">
              Ιστορικό <span>{`τελευταίες ${METRIC_HISTORY_DAYS} ημέρες`}</span>
            </h3>
            <ol className="smd-history">
              {summary.history.map((entry) => (
                <HistoryRow
                  key={entry.day}
                  spec={spec}
                  entry={entry}
                  today={today}
                  open={openDay === entry.day}
                  onToggle={() => setOpenDay((day) => (day === entry.day ? null : entry.day))}
                />
              ))}
            </ol>
          </section>
        </>
      ) : !loading && !error ? (
        <p className="smd-sub smd-sub--muted smd-none">
          Δεν υπάρχουν δεδομένα τις τελευταίες {METRIC_HISTORY_DAYS} ημέρες.
          {spec.source === 'oura' ? ' Έλεγξε τη σύνδεση και τον συγχρονισμό του Oura.' : ''}
        </p>
      ) : null}
    </>
  );
}

function MetricSwitcher({ activeKey, onSelect }) {
  const listRef = useRef(null);

  // A passive effect, so it runs after the dialog's layout effect has opened it and the
  // chips have a layout to measure.
  useEffect(() => {
    // Bring the active chip into view without scrolling the dialog itself.
    const list = listRef.current;
    const chip = list?.querySelector('[aria-pressed="true"]');
    if (!list || !chip) return;
    const chipBox = chip.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    list.scrollLeft += chipBox.left - listBox.left - (list.clientWidth - chipBox.width) / 2;
  }, [activeKey]);

  return (
    <div ref={listRef} className="smd-switch" role="group" aria-label="Μετρήσεις">
      {METRIC_HISTORY_KEYS.map((key) => {
        const spec = METRIC_HISTORY_SPECS[key];
        return (
          <button
            key={key}
            type="button"
            className="smd-chip"
            aria-pressed={key === activeKey}
            onClick={() => onSelect(key)}
          >
            {spec.chipLabel ?? spec.label}
          </button>
        );
      })}
    </div>
  );
}

function MetricDialog({ initialKey, onClose }) {
  const [activeKey, setActiveKey] = useState(initialKey);
  const spec = metricHistorySpec(activeKey);
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const today = todayIsoDate();
  const close = useCallback(() => closeRef.current?.(), []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.scrollTo?.({ top: 0 });
  }, [activeKey]);

  return (
    <dialog
      ref={dialogRef}
      className="self-measure-dialog"
      data-metric={activeKey}
      // Greek, so the uppercase kickers drop their accents.
      lang="el"
      tabIndex={-1}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div className="smd-body">
        <header className="smd-header">
          <span className="smd-source"><span className="smd-source-dot" />{spec.sourceLabel}</span>
          <button className="smd-close" type="button" onClick={close} aria-label="Κλείσιμο">
            <Icon name="x" />
          </button>
        </header>
        <MetricSwitcher activeKey={activeKey} onSelect={setActiveKey} />
        <MetricDetail key={activeKey} spec={spec} today={today} titleId={titleId} />
      </div>
    </dialog>
  );
}

/**
 * Detail for one Self metric: today's value, how it moved, the day's breakdown and the
 * previous days (each expandable). Chips switch to any other metric without closing.
 */
export function SelfMetricDialog({ metricKey, onClose }) {
  if (!metricHistorySpec(metricKey) || typeof document === 'undefined') return null;
  return createPortal(<MetricDialog initialKey={metricKey} onClose={onClose} />, document.body);
}
