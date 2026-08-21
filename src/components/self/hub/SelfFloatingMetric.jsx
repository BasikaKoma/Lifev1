import { useEffect, useState } from 'react';
import { SelfIcon } from '../SelfIcons';
import { SelfChart } from '../SelfCharts';
import { NO_DATA } from '../../../utils/selfHubSchema';

const METRIC_ICONS = {
  Recovery: 'heart',
  HR: 'pulse',
  Stress: 'stress',
  Weight: 'weight',
  'Focus Window': 'aura',
  Movement: 'walk',
};

const ORB_RING_RADIUS = 42;
const ORB_RING_C = 2 * Math.PI * ORB_RING_RADIUS;

function useIsDesktopHub() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 768px)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

function getOrbProgress(metric, orbKind) {
  const hasValue = metric.value != null && metric.value !== '—';
  if (!hasValue) return 0.1;

  if (metric.max) {
    return Math.max(0.08, Math.min(1, Number(metric.value) / metric.max));
  }

  if (orbKind === 'movement' && metric.unit === 'min') {
    const target = 74;
    return Math.max(0.08, Math.min(1, (target - Number(metric.value)) / target));
  }

  return 0.35;
}

function getMovementSuffix(metric) {
  if (metric.secondary) {
    return metric.secondary.replace(/^\d+'?\s*/, '').trim() || 'left';
  }
  if (metric.status?.includes('left')) return 'left';
  return metric.status && metric.status !== NO_DATA ? metric.status : null;
}

function getMovementValue(metric) {
  if (metric.value == null || metric.value === '—') return null;
  if (metric.unit === 'min') return `${metric.value}'`;
  return String(metric.value);
}

function formatKcal(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function WeightCalories({ caloriesIn, caloriesOut }) {
  if (caloriesIn == null && caloriesOut == null) return null;

  return (
    <span className="self-float-metric__calories">
      {caloriesOut != null ? (
        <span className="self-float-metric__calories-item self-float-metric__calories-item--out">
          <span className="self-float-metric__calories-value">{formatKcal(caloriesOut)}</span>
          <span className="self-float-metric__calories-tag">out</span>
        </span>
      ) : null}
      {caloriesOut != null && caloriesIn != null ? (
        <span className="self-float-metric__calories-sep" aria-hidden>
          ·
        </span>
      ) : null}
      {caloriesIn != null ? (
        <span className="self-float-metric__calories-item self-float-metric__calories-item--in">
          <span className="self-float-metric__calories-value">{formatKcal(caloriesIn)}</span>
          <span className="self-float-metric__calories-tag">in</span>
        </span>
      ) : null}
    </span>
  );
}

/** @param {{ metric: import('../../../utils/selfHubSchema').SelfHubMetric, position: string }} props */
function DetailedHeartRateCard({ metric, position }) {
  const hasValue = metric.value != null && metric.value !== '—';
  const chart =
    metric.chart?.type === 'heartRateTrend'
      ? metric.chart
      : { type: 'empty' };

  return (
    <div
      className={`self-float-metric self-float-metric--detailed self-float-metric--detailed-hr self-float-metric--${position}`}
    >
      <div className="self-float-metric__detailed-card self-float-metric__detailed-card--hr">
        <header className="self-float-metric__detailed-head">
          <div className="self-float-metric__detailed-title">
            <span className="self-float-metric__icon self-float-metric__icon--hr" aria-hidden>
              <SelfIcon name="pulse" />
            </span>
            <span className="self-float-metric__detailed-label">Παλμοί</span>
          </div>
          {metric.status && metric.status !== NO_DATA ? (
            <span className="self-float-metric__detailed-status self-float-metric__detailed-status--hr">
              {metric.status}
            </span>
          ) : null}
        </header>

        {hasValue ? (
          <div className="self-float-metric__detailed-value-row">
            <span className="self-float-metric__detailed-value">{metric.value}</span>
            <span className="self-float-metric__detailed-unit">bpm</span>
          </div>
        ) : (
          <span className="self-float-metric__status">{metric.status || NO_DATA}</span>
        )}

        <div className="self-float-metric__detailed-chart">
          <SelfChart chart={chart} />
        </div>
      </div>
    </div>
  );
}

/** @param {{ metric: import('../../../utils/selfHubSchema').SelfHubMetric, position: string }} props */
function DetailedCaloriesCard({ metric, position }) {
  const caloriesIn = metric.caloriesIn;
  const caloriesOut = metric.caloriesOut;
  const hasCalories = caloriesIn != null || caloriesOut != null;
  const hasWeight = metric.value != null && metric.value !== '—';
  const net =
    caloriesIn != null && caloriesOut != null ? caloriesIn - caloriesOut : null;
  const netLabel =
    net != null ? `${net >= 0 ? '+' : ''}${formatKcal(net)} net` : metric.status;

  const safeIn = caloriesIn ?? 0;
  const safeOut = caloriesOut ?? 0;
  const goal = Math.max(safeIn, safeOut, 1);

  return (
    <div
      className={`self-float-metric self-float-metric--detailed self-float-metric--detailed-calories self-float-metric--${position}`}
    >
      <div className="self-float-metric__detailed-card self-float-metric__detailed-card--calories">
        <header className="self-float-metric__detailed-head">
          <div className="self-float-metric__detailed-title">
            <span className="self-float-metric__icon" aria-hidden>
              <SelfIcon name="weight" />
            </span>
            <span className="self-float-metric__detailed-label">Calories</span>
          </div>
          {netLabel && netLabel !== NO_DATA ? (
            <span className="self-float-metric__detailed-net">{netLabel}</span>
          ) : null}
        </header>

        {hasCalories ? (
          <>
            <div className="self-float-metric__detailed-calories-summary">
              <span className="self-float-metric__detailed-calories-pair">
                <span className="self-float-metric__detailed-calories-value">
                  {formatKcal(caloriesIn ?? 0)}
                </span>
                <span className="self-float-metric__detailed-calories-tag">IN</span>
              </span>
              <span className="self-float-metric__detailed-calories-divider" aria-hidden />
              <span className="self-float-metric__detailed-calories-pair">
                <span className="self-float-metric__detailed-calories-value">
                  {formatKcal(caloriesOut ?? 0)}
                </span>
                <span className="self-float-metric__detailed-calories-tag">OUT</span>
              </span>
            </div>

            <div className="self-float-metric__detailed-chart">
              <SelfChart
                chart={{ type: 'caloriesBalance', intakeLabel: 'IN', burnedLabel: 'OUT' }}
                intake={safeIn}
                burned={safeOut}
                goal={goal}
                unit="kcal"
              />
            </div>
          </>
        ) : hasWeight ? (
          <div className="self-float-metric__detailed-value-row">
            <span className="self-float-metric__detailed-value">{metric.value}</span>
            <span className="self-float-metric__detailed-unit">kg</span>
          </div>
        ) : (
          <span className="self-float-metric__status">{NO_DATA}</span>
        )}

        {hasWeight && hasCalories ? (
          <div className="self-float-metric__detailed-weight-foot">
            {metric.value}
            <span className="self-float-metric__detailed-unit">kg</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** @param {{ metric: import('../../../utils/selfHubSchema').SelfHubMetric, position: string, variant?: 'pill'|'orb', orbKind?: 'recovery'|'movement', desktopDetailed?: 'hr'|'calories' }} props */
export function SelfFloatingMetric({
  metric,
  position,
  variant = 'pill',
  orbKind,
  desktopDetailed,
}) {
  const isDesktop = useIsDesktopHub();
  const hasValue = metric.value != null && metric.value !== '—';
  const iconName = METRIC_ICONS[metric.label] || 'aura';

  if (isDesktop && desktopDetailed === 'hr') {
    return <DetailedHeartRateCard metric={metric} position={position} />;
  }

  if (isDesktop && desktopDetailed === 'calories') {
    return <DetailedCaloriesCard metric={metric} position={position} />;
  }

  if (variant === 'orb') {
    const progress = getOrbProgress(metric, orbKind);
    const dash = `${(progress * ORB_RING_C).toFixed(2)} ${ORB_RING_C.toFixed(2)}`;
    const isMovement = orbKind === 'movement';

    return (
      <div className={`self-float-metric self-float-metric--orb self-float-metric--${position}`}>
        <div className="self-float-metric__orb">
          <svg className="self-float-metric__orb-ring" viewBox="0 0 100 100" aria-hidden>
            <circle className="self-float-metric__orb-ring-bg" cx="50" cy="50" r={ORB_RING_RADIUS} />
            <circle
              className="self-float-metric__orb-ring-fill"
              cx="50"
              cy="50"
              r={ORB_RING_RADIUS}
              strokeDasharray={dash}
              transform="rotate(-90 50 50)"
            />
          </svg>

          <div className="self-float-metric__orb-body">
            <span className="self-float-metric__orb-icon" aria-hidden>
              <SelfIcon name={iconName} />
            </span>
            <span className="self-float-metric__orb-label">{metric.label}</span>

            {hasValue ? (
              isMovement ? (
                metric.max ? (
                  <>
                    <span className="self-float-metric__orb-value">{metric.value}</span>
                    <span className="self-float-metric__orb-suffix">/{metric.max}</span>
                  </>
                ) : (
                  <>
                    <span className="self-float-metric__orb-value">{getMovementValue(metric)}</span>
                    {getMovementSuffix(metric) ? (
                      <span className="self-float-metric__orb-suffix">{getMovementSuffix(metric)}</span>
                    ) : null}
                  </>
                )
              ) : (
                <>
                  <span className="self-float-metric__orb-value">{metric.value}</span>
                  {metric.max ? (
                    <span className="self-float-metric__orb-suffix">/{metric.max}</span>
                  ) : null}
                </>
              )
            ) : (
              <span className="self-float-metric__orb-empty">{metric.status || NO_DATA}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`self-float-metric self-float-metric--${position}`}>
      <div className={`self-float-metric__pill${metric.label === 'Weight' ? ' self-float-metric__pill--weight' : ''}`}>
        <span className="self-float-metric__icon" aria-hidden>
          <SelfIcon name={iconName} />
        </span>
        <div className="self-float-metric__content">
          <span className="self-float-metric__label">{metric.label}</span>
          {hasValue ? (
            <span className="self-float-metric__value">
              {metric.value}
              {metric.unit ? <span className="self-float-metric__unit">{metric.unit}</span> : null}
            </span>
          ) : (
            <span className="self-float-metric__status">{metric.status || NO_DATA}</span>
          )}
          {metric.label === 'Weight' ? (
            <WeightCalories caloriesIn={metric.caloriesIn} caloriesOut={metric.caloriesOut} />
          ) : metric.secondary ? (
            <span className="self-float-metric__secondary">{metric.secondary}</span>
          ) : hasValue && metric.status && metric.status !== NO_DATA ? (
            <span className="self-float-metric__secondary">{metric.status}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
