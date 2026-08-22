import {
  formatDayLabel,
  formatMonthLabel,
  formatYearLabel,
  timelineYToDate,
  LIFELINE_ZOOM,
  LIFELINE_ZOOM_LEVEL,
} from '../utils/lifeline';
import { isLifelineTickLabelHidden } from '../utils/stageLayout';
import { getDayEntry, getRoutineDayScore, normalizeRoutineTemplates } from '../utils/lifelineDays';

const PLAN_LABEL_MIN_SPACING = 7;

function formatTickLabel(tick) {
  if (tick.labelKind === 'year') return formatYearLabel(tick.date);
  if (tick.isMonthStart || tick.labelKind === 'month') return formatMonthLabel(tick.date);
  return formatDayLabel(tick.date);
}

export function LifelineDayTicks({
  ticks,
  dayBands = [],
  lineTop,
  lifelineDays = {},
  onDayClick,
  planLabels = null,
  daySpacing = 0,
  zoomLevel = LIFELINE_ZOOM_LEVEL.week,
  lifelineConfig = null,
  lineMetrics = null,
  layout = null,
  hiddenTickRanges = [],
  selectedDate = null,
  routineTemplates = [],
}) {
  if (!ticks?.length && !daySpacing && !dayBands?.length) return null;

  const detailZoom = daySpacing >= LIFELINE_ZOOM.everyDaySpacing;
  const templates = normalizeRoutineTemplates(routineTemplates);

  const handleGridClick = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.lifeline-day-tick')) return;
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
      onPointerDown={(e) => {
        if (e.target.classList.contains('lifeline-day-grid')) e.stopPropagation();
      }}
    >
      {daySpacing > 0 && (
        <button
          type="button"
          className="lifeline-day-grid"
          aria-label="Άνοιγμα ημέρας στο Lifeline"
          onClick={handleGridClick}
        />
      )}

      {dayBands.map((band) => {
        const relTop = band.top - lineTop;
        return (
          <span
            key={`band-${band.date}`}
            className="lifeline-day-band"
            style={{
              top: relTop,
              height: Math.max(2, band.height),
              '--ll-band-intensity': band.intensity,
            }}
            aria-hidden="true"
          />
        );
      })}

      {ticks.map((tick) => {
        const relTop = tick.top - lineTop;
        const hasContent = tick.hasContent ?? false;
        const planLabel = planLabels?.get?.(tick.date);
        const showPlanLabel = Boolean(planLabel && daySpacing >= PLAN_LABEL_MIN_SPACING);
        const hideDayLabel = isLifelineTickLabelHidden(tick.top, hiddenTickRanges);
        const isSelected = selectedDate === tick.date;
        const routineScore = templates.length
          ? getRoutineDayScore(templates, getDayEntry(lifelineDays, tick.date).routines)
          : { total: 0, label: '' };
        const showRoutineScore = routineScore.total > 0 && (detailZoom || tick.isToday || hasContent);

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
            style={{ top: relTop }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDayClick?.(tick.date, e.currentTarget);
            }}
            title={`Άνοιγμα ημέρας — ${formatDayLabel(tick.date)}${showRoutineScore ? ` · ${routineScore.label}` : ''}`}
            aria-label={`Ημέρα ${formatDayLabel(tick.date)}${showRoutineScore ? `, ρουτίνες ${routineScore.label}` : ''}`}
            aria-current={isSelected ? 'date' : undefined}
          >
            <span className="lifeline-day-tick__line" />
            {showPlanLabel ? (
              <span className="lifeline-day-tick__plan-label">{planLabel}</span>
            ) : (
              tick.showLabel && !hideDayLabel && (
                <span className="lifeline-day-tick__label">
                  {formatTickLabel(tick)}
                </span>
              )
            )}
            {showRoutineScore ? (
              <span className="lifeline-day-tick__score">{routineScore.label}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
