import { SelfIcon } from '../SelfIcons';
import { NO_DATA } from '../../../utils/selfHubSchema';

const STRIP_ICONS = {
  Sleep: 'moon',
  'Focus Window': 'aura',
  Stress: 'stress',
  HRV: 'pulse',
  'Resting HR': 'heart',
  Temp: 'thermometer',
};

/** @param {{ metrics: import('../../../utils/selfHubSchema').SelfHubMetric[], onOpenDayDetails?: () => void }} props */
export function SelfSummaryStrip({ metrics, onOpenDayDetails }) {
  return (
    <section className="self-summary-strip" aria-label="Summary metrics">
      {metrics.map((metric) => {
        const pairs = Array.isArray(metric.pairs) ? metric.pairs.filter((pair) => pair?.value) : [];
        const hasValue = metric.value != null && metric.value !== '—';
        const icon = STRIP_ICONS[metric.label] || 'aura';
        const pairLabel = pairs.map((pair) => `${pair.value} ${pair.tag}`).join(', ');
        return (
          <button
            key={metric.label}
            type="button"
            className="self-summary-strip__item"
            onClick={onOpenDayDetails}
            aria-label={
              pairs.length
                ? `${metric.label} ${pairLabel} — λεπτομέρειες ημέρας`
                : `${metric.label} — λεπτομέρειες ημέρας`
            }
          >
            <span className="self-summary-strip__icon" aria-hidden>
              <SelfIcon name={icon} />
            </span>
            <span className="self-summary-strip__label">{metric.label}</span>
            {pairs.length > 0 ? (
              <span className="self-summary-strip__pairs">
                {pairs.map((pair) => (
                  <span key={pair.tag} className="self-summary-strip__pair">
                    <span className="self-summary-strip__value">{pair.value}</span>
                    <span className="self-summary-strip__pair-tag">{pair.tag}</span>
                  </span>
                ))}
              </span>
            ) : (
              <span className="self-summary-strip__value">
                {hasValue ? (
                  <>
                    {metric.value}
                    {metric.unit ? metric.unit : ''}
                  </>
                ) : (
                  NO_DATA
                )}
              </span>
            )}
            {metric.status ? (
              <span className="self-summary-strip__status">{metric.status}</span>
            ) : null}
          </button>
        );
      })}
    </section>
  );
}
