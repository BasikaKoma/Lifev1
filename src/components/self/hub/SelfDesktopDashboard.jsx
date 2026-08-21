import { SelfHumanFigure } from '../SelfHumanFigure';
import { SelfMetricCard } from '../SelfMetricCard';
import { SelfTimeline } from '../SelfTimeline';
import { getSelfMetricVariant } from '../../../utils/selfMetricVariant';

/** @param {{ desktop: ReturnType<import('../../../utils/selfHubData').buildDesktopView>, displayName?: string|null }} props */
export function SelfDesktopDashboard({ desktop, displayName }) {
  return (
    <>
      <div className="self-view__dashboard">
        <aside className="self-view__column self-view__column--left">
          {desktop.leftMetrics.map((metric) => (
            <SelfMetricCard
              key={metric.id}
              metric={metric}
              variant={getSelfMetricVariant(metric)}
            />
          ))}
        </aside>

        <main className="self-view__center">
          {displayName ? <p className="self-view__username">{displayName}</p> : null}
          <SelfHumanFigure />
        </main>

        <aside className="self-view__column self-view__column--right">
          {desktop.rightMetrics.map((metric) => (
            <SelfMetricCard
              key={metric.id}
              metric={metric}
              variant={getSelfMetricVariant(metric)}
            />
          ))}
        </aside>
      </div>

      <SelfTimeline timeline={desktop.timeline} />
    </>
  );
}
