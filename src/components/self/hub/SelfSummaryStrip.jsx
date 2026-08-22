import { SelfIcon } from '../SelfIcons';
import { NO_DATA } from '../../../utils/selfHubSchema';

const STRIP_ICONS = {
  Sleep: 'moon',
  HRV: 'pulse',
  'Resting HR': 'heart',
  Temp: 'thermometer',
};

/** @param {{ metrics: import('../../../utils/selfHubSchema').SelfHubMetric[], onOpenDayDetails?: () => void }} props */
export function SelfSummaryStrip({ metrics, onOpenDayDetails }) {
  return (
    <section className="self-summary-strip" aria-label="Summary metrics">
      {metrics.map((metric) => {
        const hasValue = metric.value != null && metric.value !== '—';
        const icon = STRIP_ICONS[metric.label] || 'aura';
        return (
          <button
            key={metric.label}
            type="button"
            className="self-summary-strip__item"
            onClick={onOpenDayDetails}
            aria-label={`${metric.label} — λεπτομέρειες ημέρας`}
          >
            <span className="self-summary-strip__icon" aria-hidden>
              <SelfIcon name={icon} />
            </span>
            <span className="self-summary-strip__label">{metric.label}</span>
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
            <span className="self-summary-strip__status">{metric.status}</span>
          </button>
        );
      })}
    </section>
  );
}
