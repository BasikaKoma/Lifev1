import { useCallback, useEffect, useRef } from 'react';
import { localTodayIsoDate } from '../utils/selfDateUtils';
import { buildSelfHubLivePatch } from '../utils/selfHubSync';

const CAPTURE_DEBOUNCE_MS = 1200;

/**
 * Continuously captures live Self Hub state into selfHubDays and archives to lifelineDays.
 */
export function useSelfHubLiveCapture({
  enabled = true,
  activeView,
  selfData,
  hubView,
  projectActivity,
  healthMetrics = [],
  ouraRow = null,
  pathBundle = null,
  onCapture,
}) {
  const timerRef = useRef(null);
  const lastSignatureRef = useRef('');

  const captureNow = useCallback(() => {
    if (!enabled || !onCapture) return;
    const date = localTodayIsoDate();
    const patch = buildSelfHubLivePatch({
      date,
      selfData,
      hubView,
      projectActivity,
      healthMetrics,
      ouraRow,
      pathBundle,
    });
    const signature = JSON.stringify(patch);
    if (signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;
    onCapture(date, patch);
  }, [enabled, onCapture, selfData, hubView, projectActivity, healthMetrics, ouraRow, pathBundle]);

  useEffect(() => {
    if (!enabled || activeView !== 'self') return undefined;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      captureNow();
    }, CAPTURE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, activeView, captureNow]);

  useEffect(() => {
    if (!enabled || activeView !== 'self') return undefined;
    captureNow();
    return undefined;
  }, [enabled, activeView, captureNow]);

  return { captureNow };
}
