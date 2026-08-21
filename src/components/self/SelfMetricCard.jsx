import { SelfIcon } from './SelfIcons';
import { SelfChart } from './SelfCharts';

function formatCalories(value) {
  if (value == null || value === '—') return '—';
  return new Intl.NumberFormat('en-US').format(value);
}

export function SelfMetricCard({ metric, variant = 'score' }) {
  const isNextMove = variant === 'nextMove';
  const isEmotional = variant === 'emotional';
  const isCalories = variant === 'calories';
  const isWeight = metric.id === 'weight' || variant === 'weight';
  const isPulse = metric.id === 'heartRate' || variant === 'pulse';

  return (
    <article className={`self-card self-card--${metric.id}`}>
      <header className={`self-card__header ${isEmotional ? 'self-card__header--emotional' : ''}`}>
        <span className="self-card__icon">
          <SelfIcon name={metric.icon} />
        </span>
        <div className="self-card__titles">
          <span className="self-card__label">{metric.label}</span>
          {isNextMove ? (
            <span className="self-card__focus">{metric.focus}</span>
          ) : isEmotional ? (
            <span className="self-card__status">{metric.status}</span>
          ) : isCalories ? (
            <div className="self-card__calories-summary">
              <span className="self-card__calories-pair">
                <span className="self-card__calories-value">{formatCalories(metric.intake)}</span>
                <span className="self-card__calories-tag">in</span>
              </span>
              <span className="self-card__calories-divider" aria-hidden="true" />
              <span className="self-card__calories-pair">
                <span className="self-card__calories-value">{formatCalories(metric.burned)}</span>
                <span className="self-card__calories-tag">out</span>
              </span>
            </div>
          ) : isWeight ? (
            <span className="self-card__status self-card__status--inline">{metric.status}</span>
          ) : isPulse ? (
            <div className="self-card__score-row">
              <span className="self-card__value">{metric.value}</span>
              <span className="self-card__max">{metric.unit || 'bpm'}</span>
            </div>
          ) : (
            <div className="self-card__score-row">
              <span className="self-card__value">{metric.value}</span>
              {typeof metric.value === 'number' && metric.max != null && (
                <span className="self-card__max">/ {metric.max}</span>
              )}
            </div>
          )}
        </div>
        {!isNextMove && !isEmotional && !isWeight && (
          <span className={`self-card__status ${isCalories ? 'self-card__status--net' : ''}`}>
            {metric.status}
          </span>
        )}
        {isEmotional && (
          <div className="self-card__ring-inline">
            <SelfChart chart={metric.chart} value={metric.value} max={metric.max} />
          </div>
        )}
      </header>

      {isNextMove ? (
        <div className="self-card__body self-card__body--next-move">
          <p className="self-card__message">{metric.message}</p>
          <SelfChart chart={metric.chart} />
        </div>
      ) : !isEmotional ? (
        <div className="self-card__body">
          {isWeight && metric.kg != null ? (
            <p className="self-card__weight-latest">
              {typeof metric.kg === 'number' ? metric.kg.toFixed(1) : metric.kg}
              <span className="self-card__weight-unit"> kg</span>
            </p>
          ) : null}
          {isWeight && metric.chart?.type === 'weightLine' ? (
            <SelfChart chart={metric.chart} />
          ) : !isWeight ? (
            <SelfChart
              chart={metric.chart}
              value={metric.value}
              max={metric.max}
              intake={metric.intake}
              burned={metric.burned}
              goal={metric.goal}
              unit={metric.unit}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
