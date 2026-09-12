import { memo, useState } from 'react';
import {
  formatDayLabel,
  formatMonthLabel,
  formatYearLabel,
  timelineYToDate,
  LIFELINE_ZOOM,
  LIFELINE_ZOOM_LEVEL,
} from '../utils/lifeline';
import { formatPeriodAriaLabel } from '../utils/periodSummary';
import { isLifelineTickLabelHidden } from '../utils/stageLayout';

const PLAN_LABEL_MIN_SPACING = 7;
const MIN_BRACE_PX = 28;

function formatTickLabel(tick) {
  if (tick.labelKind === 'year') return formatYearLabel(tick.date);
  if (tick.isMonthStart || tick.labelKind === 'month') return formatMonthLabel(tick.date);
  return formatDayLabel(tick.date);
}

function PeriodBraceShape() {
  return (
    <svg
      className="lifeline-period-brace__shape"
      viewBox="0 0 24 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M4 3 C16 3 18 6 18 14 L18 42 C18 47 14 50 6 50 C14 50 18 53 18 58 L18 86 C18 94 16 97 4 97"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const LifelineDayTicks = memo(function LifelineDayTicks({
  ticks,
  dayBands = [],
  periodBrackets = [],
  lineTop,
  onDayClick,
  onPeriodClick,
  planLabels = null,
  daySpacing = 0,
  zoomLevel = LIFELINE_ZOOM_LEVEL.week,
  lifelineConfig = null,
  lineMetrics = null,
  layout = null,
  hiddenTickRanges = [],
  selectedDate = null,
  selectedPeriod = null,
}) {
  const [hoveredPeriod, setHoveredPeriod] = useState(null);
  if (!ticks?.length && !daySpacing && !dayBands?.length && !periodBrackets?.length) return null;

  const detailZoom = daySpacing >= LIFELINE_ZOOM.everyDaySpacing;
  const visibleBrackets = (periodBrackets || []).filter(
    (bracket) => (Number(bracket.dayCount) || 0) * (Number(daySpacing) || 0) >= MIN_BRACE_PX
  );

  const handleGridClick = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.lifeline-day-tick')) return;
    if (e.target.closest('.lifeline-period-brace')) return;
    if (!lifelineConfig || !lineMetrics || !layout) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = e.clientY - rect.top + lineTop;
    const date = timelineYToDate(relY, lifelineConfig, lineMetrics, layout);
    if (date) onDayClick?.(date, e.currentTarget);
  };

  return (
    <div
      className="lifeline-day-ticks"
      data-detail={detailZoom ? '1' : '0'}
      data-zoom-level={zoomLevel}
      data-day-selected={selectedDate ? '1' : '0'}
      data-has-braces={visibleBrackets.length ? '1' : '0'}
    >
      {daySpacing > 0 && (
        <button
          type="button"
          className="lifeline-day-grid"
          aria-label="Άνοιγμα ημέρας στο Lifeline"
          onClick={handleGridClick}
        />
      )}

      {dayBands.map((band) => (
          <span
            key={`band-${band.date}`}
            className="lifeline-day-band"
            style={{
              '--ll-day-index': String(band.dayIndex ?? 0),
              '--ll-band-intensity': band.intensity,
            }}
            aria-hidden="true"
          />
      ))}

      {hoveredPeriod ? (
        <span
          className="lifeline-period-hover-band"
          style={{
            '--ll-brace-start-index': String(hoveredPeriod.startIndex ?? 0),
            '--ll-brace-days': String(hoveredPeriod.dayCount ?? 7),
          }}
          aria-hidden="true"
        />
      ) : null}

      {visibleBrackets.map((bracket) => {
        const selected = selectedPeriod?.kind === bracket.kind
          && selectedPeriod?.startDate === bracket.startDate;
        const label = formatPeriodAriaLabel(bracket.kind, bracket.startDate, bracket.endDate);
        return (
          <button
            key={`${bracket.kind}-${bracket.startDate}`}
            type="button"
            className={[
              'lifeline-period-brace',
              `lifeline-period-brace--${bracket.kind}`,
              selected ? 'lifeline-period-brace--selected' : '',
            ].filter(Boolean).join(' ')}
            style={{
              '--ll-brace-start-index': String(bracket.startIndex ?? 0),
              '--ll-brace-days': String(bracket.dayCount ?? 7),
            }}
            title={label}
            aria-label={label}
            aria-pressed={selected ? 'true' : undefined}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerEnter={() => setHoveredPeriod(bracket)}
            onPointerLeave={() => setHoveredPeriod((current) => (
              current?.startDate === bracket.startDate ? null : current
            ))}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onPeriodClick?.(bracket, e.currentTarget);
            }}
          >
            <PeriodBraceShape />
          </button>
        );
      })}

      {ticks.map((tick) => {
        const hasContent = tick.hasContent ?? false;
        const planLabel = planLabels?.get?.(tick.date);
        const showPlanLabel = Boolean(planLabel && daySpacing >= PLAN_LABEL_MIN_SPACING);
        const hideDayLabel = isLifelineTickLabelHidden(tick.top, hiddenTickRanges);
        const isSelected = selectedDate === tick.date;

        return (
          <button
            key={tick.date}
            type="button"
            data-date={tick.date}
            className={[
              'lifeline-day-tick',
              tick.isToday ? 'lifeline-day-tick--today' : '',
              tick.isWeekStart ? 'lifeline-day-tick--week' : '',
              tick.isMonthStart ? 'lifeline-day-tick--month' : '',
              tick.isYearStart ? 'lifeline-day-tick--year' : '',
              hasContent ? 'lifeline-day-tick--has-content' : '',
              showPlanLabel ? 'lifeline-day-tick--plan-label' : '',
              isSelected ? 'lifeline-day-tick--selected' : '',
              tick.intensity > 0 ? 'lifeline-day-tick--intensity' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ '--ll-day-index': String(tick.dayIndex ?? 0) }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDayClick?.(tick.date, e.currentTarget);
            }}
            title={`Άνοιγμα ημέρας — ${formatDayLabel(tick.date)}`}
            aria-label={`Άνοιγμα ημέρας ${formatDayLabel(tick.date)}`}
            aria-current={isSelected ? 'date' : undefined}
          >
            <span className="lifeline-day-tick__line" />
            <span className="lifeline-day-tick__open">Άνοιγμα</span>
            {showPlanLabel ? (
              <span className="lifeline-day-tick__plan-label">{planLabel}</span>
            ) : (
              tick.showLabel && !hideDayLabel && (
                <span className="lifeline-day-tick__label">
                  {formatTickLabel(tick)}
                </span>
              )
            )}
          </button>
        );
      })}
    </div>
  );
});
