import { SelfHumanFigure } from '../SelfHumanFigure';
import { SelfFloatingMetric } from './SelfFloatingMetric';
import { SelfMoodCard } from './SelfMoodCard';
import { SelfCapacityBanner } from './SelfCapacityBanner';
import { platform } from '../../../platform';

// On a phone the figure is the hero of the screen, so it reads more solid than on desktop.
const MOBILE_BODY_OPACITY = platform.isMobile ? 0.5 : undefined;

/** @param {{ floatingMetrics: import('../../../utils/selfHubSchema').SelfHubFloatingMetrics, capacity: import('../../../utils/selfHubSchema').SelfHubCapacity }} props */
export function SelfHub({ floatingMetrics, capacity }) {
  return (
    <section className="self-hub" aria-label="Health hub">
      <div className="self-body-cluster">
        <div className="self-hub__ambient" aria-hidden />
        <div className="self-hub__stage">
          <SelfFloatingMetric metric={floatingMetrics.sleep} position="tl" variant="orb" />
          <SelfMoodCard />
          <SelfFloatingMetric metric={floatingMetrics.heartRate} position="tr" desktopDetailed="hr" />
          <SelfFloatingMetric metric={floatingMetrics.hrv} position="ml" />
          <SelfFloatingMetric metric={floatingMetrics.stress} position="mr" />
          <SelfFloatingMetric metric={floatingMetrics.weight} position="bl" desktopDetailed="calories" />
          <SelfFloatingMetric metric={floatingMetrics.movement} position="br" variant="orb" orbKind="movement" />

          <div className="self-hub__figure">
            <SelfHumanFigure bodyOpacity={MOBILE_BODY_OPACITY} />
          </div>

          <div className="self-hub__capacity-wrap">
            <SelfCapacityBanner capacity={capacity} />
          </div>
        </div>
      </div>
    </section>
  );
}
