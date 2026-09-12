import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DAY_VIEW_PHASE, DAY_VIEW_BODY_MS, originPercentFromRects, originToCssVars } from '../hooks/useLifelineDayView';
import { fetchOuraMetricsRange } from '../lib/oura';
import { fetchMetricsRange } from '../lib/health/healthMetrics';
import { listCalls } from '../utils/callsDb';
import { readBrandBundleLocal } from '../lib/brand/store';
import {
  formatPeriodRangeLabel,
  getPeriodRange,
  shiftPeriod,
  summarizePeriod,
} from '../utils/periodSummary';
import './DayLab.css';
import './PeriodLab.css';

function Delta({ delta }) {
  if (!delta?.text || delta.text === '0') return null;
  return (
    <span className={`period-lab__delta period-lab__delta--${delta.tone || 'neutral'}`}>
      {delta.text}
    </span>
  );
}

function SummaryCard({ card }) {
  if (!card) return null;
  return (
    <article className={`period-lab__card${card.hasData ? '' : ' period-lab__card--empty'}`}>
      <p className="period-lab__card-eyebrow">{card.eyebrow}</p>
      <div className="period-lab__card-head">
        <h3 className="period-lab__card-title">{card.title}</h3>
        {card.hasData && card.primary != null ? (
          <p className="period-lab__card-primary">
            {card.primary}
            {card.primarySuffix ? <span>{card.primarySuffix}</span> : null}
            <Delta delta={card.delta} />
          </p>
        ) : (
          <p className="period-lab__card-empty">No data</p>
        )}
      </div>
      {card.hasData && card.rows?.length ? (
        <ul className="period-lab__rows">
          {card.rows.map((row) => (
            <li key={row.label}>
              <span>{row.label}</span>
              <strong>
                {row.value}
                <Delta delta={row.delta} />
              </strong>
            </li>
          ))}
        </ul>
      ) : null}
      {card.notes?.length ? (
        <ul className="period-lab__notes">
          {card.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function LifelinePeriodModal({
  open,
  date,
  kind = 'week',
  phase = DAY_VIEW_PHASE.timeline,
  origin = null,
  originRect = null,
  onClose,
  onNavigate,
  backLabel = '← Lifeline',
  ...bodyProps
}) {
  const closeBtnRef = useRef(null);
  const range = useMemo(() => getPeriodRange(kind, date), [kind, date]);
  const returning = phase === DAY_VIEW_PHASE.returningToTimeline;
  const visible = open && Boolean(range?.startDate);
  const [bodyReady, setBodyReady] = useState(false);
  const originCss = origin?.x && origin?.y
    ? origin
    : originPercentFromRects(originRect, null);

  const eyebrow = kind === 'month' ? 'Μήνας' : 'Εβδομάδα';
  const title = range
    ? formatPeriodRangeLabel(range.kind, range.startDate, range.endDate)
    : '';

  const handleShift = useCallback((delta) => {
    if (!range?.startDate) return;
    const next = shiftPeriod(range.kind, range.startDate, delta);
    if (next?.startDate) onNavigate?.(next);
  }, [onNavigate, range]);

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
      if (e.key === 'ArrowLeft') handleShift(-1);
      if (e.key === 'ArrowRight') handleShift(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose, handleShift]);

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
      aria-label={title}
    >
      <div className="lifeline-day-view__veil" aria-hidden="true" />
      <div className="lifeline-day-view__slit" aria-hidden="true" />
      <div className="lifeline-day-view__surface" aria-hidden="true" />
      {bodyReady ? (
        <div className="lifeline-day-view__content period-lab">
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
              <p className="day-lab__eyebrow">{eyebrow}</p>
              <h2 className="day-lab__title">{title}</h2>
              <div className="period-lab__nav">
                <button type="button" className="period-lab__nav-btn" onClick={() => handleShift(-1)}>
                  ← Προηγούμενη
                </button>
                <button type="button" className="period-lab__nav-btn" onClick={() => handleShift(1)}>
                  Επόμενη →
                </button>
              </div>
            </div>

            <div className="day-lab__status" aria-hidden="true" />
          </header>

          <div className="day-lab__body">
            <PeriodLabBody
              open={open}
              date={date}
              kind={kind}
              range={range}
              {...bodyProps}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PeriodLabBody({
  open,
  date,
  kind,
  range,
  lifelineDays,
  selfHubDays = {},
  routineTemplates = [],
  projectActivity = [],
  stages = [],
  obstacles = [],
  pathBundle = null,
}) {
  const [ouraRows, setOuraRows] = useState([]);
  const [weightReadings, setWeightReadings] = useState([]);
  const [waistReadings, setWaistReadings] = useState([]);
  const [calls, setCalls] = useState([]);
  const brandItems = useMemo(() => readBrandBundleLocal()?.items || [], [open, date, kind]);

  useEffect(() => {
    if (!open || !range?.startDate || !range?.endDate) return undefined;
    const previous = shiftPeriod(range.kind, range.startDate, -1);
    const startDay = previous?.startDate || range.startDate;
    const endDay = range.endDate;
    let cancelled = false;

    (async () => {
      const [oura, metrics, callRows] = await Promise.all([
        fetchOuraMetricsRange({ startDay, endDay }).catch(() => []),
        fetchMetricsRange({ startDay, endDay, metricTypes: ['weight', 'waist'] }).catch(() => []),
        listCalls().catch(() => []),
      ]);
      if (cancelled) return;
      setOuraRows(Array.isArray(oura) ? oura : []);
      const rows = Array.isArray(metrics) ? metrics : [];
      setWeightReadings(rows.filter((row) => row.metricType === 'weight'));
      setWaistReadings(rows.filter((row) => row.metricType === 'waist'));
      setCalls(Array.isArray(callRows) ? callRows : []);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, range?.startDate, range?.endDate, range?.kind]);

  const summary = useMemo(
    () =>
      summarizePeriod({
        kind: range?.kind || kind,
        startDate: range?.startDate,
        endDate: range?.endDate,
        lifelineDays,
        selfHubDays,
        routineTemplates,
        pathBundle,
        projectActivity,
        stages,
        obstacles,
        brandItems,
        calls,
        ouraRows,
        weightReadings,
        waistReadings,
      }),
    [
      range,
      kind,
      lifelineDays,
      selfHubDays,
      routineTemplates,
      pathBundle,
      projectActivity,
      stages,
      obstacles,
      brandItems,
      calls,
      ouraRows,
      weightReadings,
      waistReadings,
    ]
  );

  return (
    <div className="period-lab__grid">
      {summary.cards.map((card) => (
        <SummaryCard key={card.id} card={card} />
      ))}
    </div>
  );
}
