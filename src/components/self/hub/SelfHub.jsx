import { useCallback, useLayoutEffect, useState } from 'react';
import { SelfHumanFigure } from '../SelfHumanFigure';
import { SelfBodyMeasureAnchors, SelfBodyScan, SelfOrgans } from '../SelfOrgans';
import { ORGAN_LINKS, hasMetricData, heartBpm } from '../selfOrganSpec';
import { SelfFloatingMetric } from './SelfFloatingMetric';
import { SelfMoodCard } from './SelfMoodCard';
import { SelfCapacityBanner } from './SelfCapacityBanner';
import { SelfBodyMeasures } from './SelfBodyMeasures';
import { SelfMetricDialog } from './SelfMetricDialog';
import { OrganLinkProjector, SelfOrganLinks, createOrganLinkRuntime, useOrganCardProps } from './SelfOrganLinks';
import { platform } from '../../../platform';

// On a phone the figure is the hero of the screen, so it reads more solid than on desktop.
const MOBILE_BODY_OPACITY = platform.isMobile ? 0.5 : undefined;

/** @param {{ floatingMetrics: import('../../../utils/selfHubSchema').SelfHubFloatingMetrics, capacity: import('../../../utils/selfHubSchema').SelfHubCapacity }} props */
export function SelfHub({ floatingMetrics, capacity }) {
  const [organLinks] = useState(createOrganLinkRuntime);
  const cardProps = useOrganCardProps(organLinks);
  // Which metric's day-by-day detail is open (null when none).
  const [detailKey, setDetailKey] = useState(null);
  const closeDetail = useCallback(() => setDetailKey(null), []);

  useLayoutEffect(() => {
    ORGAN_LINKS.forEach((link) => {
      organLinks.has[link.key] = hasMetricData(floatingMetrics[link.key]);
    });
    organLinks.bpm = heartBpm(floatingMetrics.heartRate);
  }, [organLinks, floatingMetrics]);

  const renderInternals = useCallback(({ bounds, reducedMotion }) => (
    <>
      <SelfOrgans bounds={bounds} links={organLinks} reducedMotion={reducedMotion} />
      <SelfBodyMeasureAnchors bounds={bounds} links={organLinks} />
    </>
  ), [organLinks]);

  const renderOverlay = useCallback(({ bounds, reducedMotion, bodyScan }) => (
    <>
      {reducedMotion ? null : <SelfBodyScan bounds={bounds} bodyScan={bodyScan} />}
      <OrganLinkProjector links={organLinks} bounds={bounds} />
    </>
  ), [organLinks]);

  return (
    <section className="self-hub" aria-label="Health hub">
      <div className="self-body-cluster">
        <div className="self-hub__ambient" aria-hidden />
        <div className="self-hub__stage">
          <SelfFloatingMetric metric={floatingMetrics.sleep} position="tl" variant="orb" detailKey="sleep" onOpenDetail={setDetailKey} />
          <SelfMoodCard />
          <SelfFloatingMetric metric={floatingMetrics.heartRate} position="tr" desktopDetailed="hr" rootProps={cardProps('heartRate')} detailKey="heartRate" onOpenDetail={setDetailKey} />
          <SelfFloatingMetric metric={floatingMetrics.hrv} position="ml" rootProps={cardProps('hrv')} detailKey="hrv" onOpenDetail={setDetailKey} />
          <SelfFloatingMetric metric={floatingMetrics.stress} position="mr" rootProps={cardProps('stress')} detailKey="stress" onOpenDetail={setDetailKey} />
          <SelfFloatingMetric metric={floatingMetrics.weight} position="bl" desktopDetailed="calories" rootProps={cardProps('weight')} detailKey="weight" onOpenDetail={setDetailKey} />
          <SelfFloatingMetric metric={floatingMetrics.movement} position="br" variant="orb" orbKind="movement" detailKey="movement" onOpenDetail={setDetailKey} />

          <div className="self-hub__figure">
            <SelfHumanFigure
              bodyOpacity={MOBILE_BODY_OPACITY}
              renderInternals={renderInternals}
              renderOverlay={renderOverlay}
            />
          </div>

          <SelfOrganLinks runtime={organLinks} metrics={floatingMetrics} />
          <SelfBodyMeasures runtime={organLinks} metric={floatingMetrics.weight} onOpenDetail={setDetailKey} />

          <div className="self-hub__capacity-wrap">
            <SelfCapacityBanner capacity={capacity} />
          </div>
        </div>
      </div>
      {detailKey ? <SelfMetricDialog metricKey={detailKey} onClose={closeDetail} /> : null}
    </section>
  );
}
