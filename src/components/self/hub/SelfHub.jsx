import { SelfHumanFigure } from '../SelfHumanFigure';
import { SelfFloatingMetric } from './SelfFloatingMetric';
import { SelfCapacityBanner } from './SelfCapacityBanner';

/** @param {{ floatingMetrics: import('../../../utils/selfHubSchema').SelfHubFloatingMetrics, capacity: import('../../../utils/selfHubSchema').SelfHubCapacity }} props */
export function SelfHub({ floatingMetrics, capacity }) {
  return (
    <section className="self-hub" aria-label="Health hub">
      <div className="self-body-cluster">
        <div className="self-hub__ambient" aria-hidden />
        <div className="self-hub__stage">
          <SelfFloatingMetric metric={floatingMetrics.sleep} position="tl" variant="orb" />
          <SelfFloatingMetric metric={floatingMetrics.heartRate} position="tr" desktopDetailed="hr" />
          <SelfFloatingMetric metric={floatingMetrics.hrv} position="ml" />
          <SelfFloatingMetric metric={floatingMetrics.stress} position="mr" />
          <SelfFloatingMetric metric={floatingMetrics.weight} position="bl" desktopDetailed="calories" />
          <SelfFloatingMetric metric={floatingMetrics.movement} position="br" variant="orb" orbKind="movement" />

          <div className="self-hub__figure">
            <SelfHumanFigure />
          </div>

          <div className="self-hub__capacity-wrap">
            <SelfCapacityBanner capacity={capacity} />
          </div>
        </div>
      </div>
    </section>
  );
}
