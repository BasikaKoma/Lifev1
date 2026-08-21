import { NO_DATA, createEmptyCapacity, createEmptyMetric } from './selfHubSchema';
import { emptySelfData } from '../data/emptySelfData';
import { enrichDayLabMetrics } from './lifelineSelfMetrics';
import { formatSelfDataDate, formatSelfUpdatedTime, buildTimelineFromReference, localTodayIsoDate } from './selfDateUtils';
import { computeCapacity, deriveCircadianContext, deriveCurrentState } from './capacityEngine';
import {
  computeFocusWindow,
  formatCapacitySubtext,
  formatFocusWindowLine,
} from './focusWindowEngine';
import { getNextBestMove, getCurrentStage, isCheckpointDone } from './logic';
import { parseOuraPayload } from './heartRateMetric';
import { extractOuraSummary } from './ouraInfo';
import {
  collectCompletedItemsForDate,
  collectNotesCreatedForDate,
  collectScheduledItemsForDate,
} from './lifelineDays';
import { getSelfHubDayEntry } from './selfHubDays';

function formatRelativeAgo(isoString) {
  if (!isoString) return null;
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 0) return null;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatSelfUpdatedTime(isoString);
}

function numericValue(metric) {
  const v = metric?.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function numericCalories(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildTodayThreeFromRoadmap(stages) {
  if (!stages?.length) {
    return { source: 'none', items: [] };
  }

  const items = [];
  const currentStage = getCurrentStage(stages);
  if (currentStage) {
    const checkpoints = (currentStage.checkpoints || []).filter((cp) => !isCheckpointDone(cp));
    for (const cp of checkpoints.slice(0, 3)) {
      items.push({ id: cp.id, text: cp.title, done: false });
    }
  }

  for (const stage of stages) {
    if (items.length >= 3) break;
    for (const cp of stage.checkpoints || []) {
      if (items.length >= 3) break;
      if (!isCheckpointDone(cp) && !items.some((i) => i.id === cp.id)) {
        items.push({ id: cp.id, text: cp.title, done: false });
      }
    }
  }

  return {
    source: items.length ? 'computed' : 'none',
    items,
  };
}

function buildProjectDayActivity(projectActivity, selfHubDays) {
  const today = localTodayIsoDate();
  const stored = getSelfHubDayEntry(selfHubDays, today);
  if (stored.projects) {
    return {
      source: 'selfHub',
      completed: stored.projects.completed || [],
      notes: stored.projects.notes || [],
      scheduled: stored.projects.scheduled || [],
    };
  }
  return {
    source: projectActivity?.length ? 'computed' : 'none',
    completed: collectCompletedItemsForDate(projectActivity, today),
    notes: collectNotesCreatedForDate(projectActivity, today),
    scheduled: collectScheduledItemsForDate(projectActivity, today),
  };
}

function deriveMovementMetric(activityScore, steps, targetSteps = 10000) {
  if (steps != null && targetSteps) {
    const remaining = Math.max(0, targetSteps - steps);
    const remainingMin = Math.round(remaining / 120);
    return createEmptyMetric({
      label: 'Movement',
      value: remainingMin,
      unit: 'min',
      status: remainingMin > 0 ? `${remainingMin}' left` : 'Goal met',
      source: 'oura',
      confidence: 'medium',
      isLive: false,
    });
  }

  if (activityScore != null) {
    return createEmptyMetric({
      label: 'Movement',
      value: activityScore,
      max: 100,
      status: activityScore >= 70 ? 'On track' : 'Building',
      secondary: '/100',
      source: 'oura',
      confidence: 'medium',
      isLive: false,
    });
  }

  return createEmptyMetric({ label: 'Movement' });
}

function buildSummaryStrip({ sleep, restingHr, hrvMs, tempDev, updatedAt }) {
  return [
    createEmptyMetric({
      label: 'Sleep',
      value: sleep,
      max: 100,
      status: sleep != null ? (sleep >= 85 ? 'Great' : sleep >= 70 ? 'Solid' : 'Light') : NO_DATA,
      source: sleep != null ? 'oura' : 'none',
      updatedAt,
      confidence: sleep != null ? 'high' : 'none',
      isLive: false,
    }),
    createEmptyMetric({
      label: 'HRV',
      value: hrvMs,
      unit: hrvMs != null ? 'ms' : undefined,
      status: hrvMs != null ? 'Balanced' : NO_DATA,
      source: hrvMs != null ? 'oura' : 'none',
      updatedAt,
      confidence: hrvMs != null ? 'medium' : 'none',
      isLive: false,
    }),
    createEmptyMetric({
      label: 'Resting HR',
      value: restingHr,
      unit: 'bpm',
      status: restingHr != null ? 'Normal' : NO_DATA,
      source: restingHr != null ? 'oura' : 'none',
      updatedAt,
      confidence: restingHr != null ? 'high' : 'none',
      isLive: false,
    }),
    createEmptyMetric({
      label: 'Temp',
      value: tempDev,
      unit: undefined,
      status: tempDev != null ? (tempDev >= 70 ? 'Stable' : tempDev >= 50 ? 'Normal' : 'Low') : NO_DATA,
      source: tempDev != null ? 'oura' : 'none',
      updatedAt,
      confidence: tempDev != null ? 'medium' : 'none',
      isLive: false,
    }),
  ];
}

function buildFromSelfData(selfData, { displayName, stages, ouraRow, projectActivity, selfHubDays }) {
  const { metrics, systemStatus, source, updatedAt, dataDay } = selfData;
  const referenceTime = updatedAt ?? selfData.timeline?.referenceTime ?? null;
  const payload = ouraRow ? parseOuraPayload(ouraRow.payload) : {};
  const summary = ouraRow ? extractOuraSummary(ouraRow, {}) : null;

  const readiness = numericValue(metrics.readiness);
  const sleepScore = numericValue(metrics.sleep);
  const activityScore = numericValue(metrics.activity);
  const weightKg = metrics.weight?.kg ?? numericValue(metrics.weight);
  const caloriesIn = numericCalories(metrics.calories?.intake);
  const caloriesOut = numericCalories(metrics.calories?.burned);

  const hrValue = numericValue(metrics.heartRate);
  const hrUpdated = metrics.heartRate?.chart?.endLabel ? referenceTime : referenceTime;
  const hrAgo = formatRelativeAgo(referenceTime);

  const stressSummary = payload.stress?.day_summary ?? null;
  let stressStatus = NO_DATA;
  if (stressSummary === 'stressful') stressStatus = 'High';
  else if (stressSummary === 'restored') stressStatus = 'Low';
  else if (stressSummary === 'normal') stressStatus = 'Normal';

  const currentState = deriveCurrentState(stressSummary, readiness);
  const circadian = deriveCircadianContext();
  const focusWindow = computeFocusWindow({ recovery: readiness, sleepScore });
  const capacityResult = computeCapacity({
    recovery: readiness,
    currentState,
    circadianContext: circadian,
  });

  const usingOura = source === 'oura' || source === 'merged';
  const usingScale = source === 'qn_scale' || source === 'merged';

  const hrvMs =
    payload.sleep_sessions?.[0]?.average_hrv ??
    payload.readiness?.contributors?.average_hrv ??
    null;

  const tempDev = payload.readiness?.contributors?.body_temperature ?? null;

  const restingHr = metrics.heartRate?.resting ?? summary?.restingHeartRate ?? null;

  const movement = deriveMovementMetric(activityScore, summary?.steps);

  const nextMove = getNextBestMove(stages || []);
  const todayThree = buildTodayThreeFromRoadmap(stages);

  const hasData =
    source !== 'empty' &&
    source !== 'oura-empty' &&
    (readiness != null ||
      sleepScore != null ||
      hrValue != null ||
      weightKg != null ||
      activityScore != null);

  const deepWorkMessage =
    metrics.nextMove?.message && metrics.nextMove.message !== NO_DATA
      ? metrics.nextMove.message
      : focusWindow.level === 'high'
        ? 'Κάνε το απαιτητικότερο έργο σου μέχρι τις 12:00'
        : 'Sync Oura for personalized mode guidance';

  return {
    hasData,
    header: {
      dateLabel: formatSelfDataDate(referenceTime),
      updatedLabel: referenceTime
        ? `Updated ${formatSelfUpdatedTime(referenceTime)}${dataDay ? ` · data ${dataDay}` : ''}`
        : null,
      dataDay: dataDay ?? null,
      systemStatusLabel: systemStatus?.label ?? NO_DATA,
      systemStatusSublabel:
        usingOura && usingScale
          ? 'Oura · Scale'
          : usingOura
            ? 'Oura Ring'
            : usingScale
              ? 'QN-Scale'
              : systemStatus?.sublabel ?? 'System Status',
      displayName: displayName ?? null,
    },
    floatingMetrics: {
      recovery: createEmptyMetric({
        label: 'Recovery',
        value: readiness,
        max: 100,
        status: metrics.readiness?.status ?? NO_DATA,
        secondary: readiness != null ? '/100' : undefined,
        source: readiness != null ? 'oura' : 'none',
        updatedAt: referenceTime,
        confidence: readiness != null ? 'high' : 'none',
        isLive: false,
      }),
      heartRate: createEmptyMetric({
        label: 'HR',
        value: hrValue,
        unit: 'bpm',
        status: metrics.heartRate?.status ?? (hrValue != null ? 'Latest' : NO_DATA),
        secondary: hrValue != null && hrAgo ? hrAgo : undefined,
        resting: metrics.heartRate?.resting ?? null,
        avg: metrics.heartRate?.avg ?? null,
        chart: metrics.heartRate?.chart,
        source: hrValue != null ? 'oura' : 'none',
        updatedAt: hrUpdated,
        confidence: hrValue != null ? 'medium' : 'none',
        isLive: false,
      }),
      stress: createEmptyMetric({
        label: 'Stress',
        value: null,
        status: stressStatus,
        source: stressSummary ? 'oura' : 'none',
        updatedAt: referenceTime,
        confidence: stressSummary ? 'medium' : 'none',
        isLive: false,
      }),
      weight: createEmptyMetric({
        label: 'Weight',
        value: weightKg,
        unit: 'kg',
        status: weightKg != null ? `${weightKg} kg` : NO_DATA,
        caloriesIn,
        caloriesOut,
        source:
          weightKg != null
            ? usingScale
              ? 'scale'
              : 'oura'
            : caloriesIn != null || caloriesOut != null
              ? 'oura'
              : 'none',
        updatedAt: metrics.weight?.recordedAt ?? referenceTime,
        confidence:
          weightKg != null ? 'high' : caloriesIn != null || caloriesOut != null ? 'medium' : 'none',
        isLive: false,
      }),
      focusWindow: createEmptyMetric({
        label: 'Focus Window',
        value: null,
        status: formatFocusWindowLine(focusWindow),
        source: readiness != null ? 'computed' : 'none',
        updatedAt: referenceTime,
        confidence: readiness != null ? 'medium' : 'none',
        isLive: false,
      }),
      movement,
    },
    capacity: createEmptyCapacity({
      value: capacityResult.value,
      label: capacityResult.label,
      subtext: formatCapacitySubtext(focusWindow),
      source: capacityResult.value != null ? 'computed' : 'none',
      updatedAt: referenceTime,
      confidence: capacityResult.confidence,
    }),
    dayProgress: {
      ...buildTimelineFromReference(referenceTime),
      markers: ['12AM', '6AM', '12PM', '6PM', '12AM'],
    },
    deepWork: {
      mode: readiness != null && readiness >= 75 ? 'Deep Work' : 'Recovery',
      message: deepWorkMessage,
      source: readiness != null ? 'computed' : 'none',
    },
    todayThree,
    nextAction: {
      title: 'NEXT BEST ACTION',
      message: nextMove?.action ?? 'Set up your roadmap to get daily actions',
      buttonLabel: 'Start Focus',
      source: nextMove?.type ? 'computed' : 'none',
    },
    summaryStrip: buildSummaryStrip({
      sleep: sleepScore,
      restingHr,
      hrvMs,
      tempDev,
      updatedAt: referenceTime,
    }),
    projectDay: buildProjectDayActivity(projectActivity, selfHubDays),
  };
}

function buildEmptyView({ displayName, ouraStatus, scaleConnected, projectActivity, selfHubDays }) {
  const referenceTime = null;
  const usingOura = ouraStatus?.connected;
  const usingScale = scaleConnected;

  const emptyMetric = (label) => createEmptyMetric({ label });

  return {
    hasData: false,
    header: {
      dateLabel: formatSelfDataDate(null),
      updatedLabel: null,
      dataDay: null,
      systemStatusLabel: NO_DATA,
      systemStatusSublabel: usingOura
        ? 'Sync Oura'
        : usingScale
          ? 'QN-Scale'
          : 'Connect devices',
      displayName: displayName ?? null,
    },
    floatingMetrics: {
      recovery: emptyMetric('Recovery'),
      heartRate: emptyMetric('HR'),
      stress: emptyMetric('Stress'),
      weight: emptyMetric('Weight'),
      focusWindow: emptyMetric('Focus Window'),
      movement: emptyMetric('Movement'),
    },
    capacity: createEmptyCapacity({ subtext: usingOura ? 'Sync Oura for capacity' : 'No data' }),
    dayProgress: {
      ...buildTimelineFromReference(new Date().toISOString()),
      markers: ['12AM', '6AM', '12PM', '6PM', '12AM'],
    },
    deepWork: {
      mode: '—',
      message: usingOura ? 'Connect and sync Oura to see today\'s mode' : 'Connect Oura or Scale',
      source: 'none',
    },
    todayThree: { source: 'none', items: [] },
    nextAction: {
      title: 'NEXT BEST ACTION',
      message: 'Add roadmap checkpoints for daily actions',
      buttonLabel: 'Start Focus',
      source: 'none',
    },
    summaryStrip: buildSummaryStrip({
      sleep: null,
      restingHr: null,
      hrvMs: null,
      tempDev: null,
      updatedAt: referenceTime,
    }),
    projectDay: buildProjectDayActivity(projectActivity, selfHubDays),
  };
}

/**
 * @param {Object} params
 * @param {Object} params.selfData
 * @param {string|null} [params.displayName]
 * @param {Object} [params.ouraStatus]
 * @param {boolean} [params.scaleConnected]
 * @param {Array} [params.stages]
 * @param {Object|null} [params.ouraRow]
 * @param {Array} [params.projectActivity]
 * @param {Object} [params.selfHubDays]
 */
export function buildSelfHubView({
  selfData,
  displayName,
  ouraStatus,
  scaleConnected,
  stages,
  ouraRow,
  projectActivity,
  selfHubDays,
}) {
  if (!selfData || selfData.source === 'empty' || selfData.source === 'oura-empty') {
    return buildEmptyView({ displayName, ouraStatus, scaleConnected, projectActivity, selfHubDays });
  }

  return buildFromSelfData(selfData, { displayName, stages, ouraRow, projectActivity, selfHubDays });
}

function mergeWeightMetric(baseWeight, hubWeight) {
  if (!baseWeight) return null;
  const hasKg = baseWeight.kg != null || (typeof baseWeight.value === 'number' && Number.isFinite(baseWeight.value));
  if (hasKg) return baseWeight;

  const hubValue = hubWeight?.value;
  if (hubValue == null || hubValue === '—') return baseWeight;

  return {
    ...baseWeight,
    kg: hubValue,
    value: hubValue,
    status: hubWeight.status && hubWeight.status !== NO_DATA ? hubWeight.status : baseWeight.status,
  };
}

function mergeNextMoveMetric(baseNextMove, hubView) {
  const base = baseNextMove ?? emptySelfData.metrics.nextMove;
  const mode = hubView.deepWork?.mode;
  const message = hubView.deepWork?.message;

  return {
    ...base,
    focus: mode && mode !== '—' ? mode : base.focus ?? 'Focus',
    message: message && message !== NO_DATA ? message : base.message ?? NO_DATA,
    chart: base.chart?.type === 'empty' ? { type: 'smoke' } : base.chart ?? { type: 'smoke' },
  };
}

function buildDesktopTimeline(selfData, hubView) {
  const timeline = selfData?.timeline ?? emptySelfData.timeline;
  return {
    ...timeline,
    currentHour: timeline.currentHour ?? hubView.dayProgress?.currentHour ?? emptySelfData.timeline.currentHour,
    markers: timeline.markers?.length ? timeline.markers : emptySelfData.timeline.markers,
    dots: timeline.dots ?? [],
    segments: timeline.segments?.length ? timeline.segments : hubView.dayProgress?.segments ?? [],
  };
}

/**
 * Desktop 3-column dashboard metrics — legacy cards with hub intelligence merged in.
 * @param {Object|null} selfData
 * @param {import('./selfHubSchema').SelfHubViewModel} hubView
 * @param {Object|null} [ouraRow]
 */
export function buildDesktopView(selfData, hubView, ouraRow = null) {
  const metricSource = selfData?.metrics ? selfData : emptySelfData;

  const metrics = metricSource.metrics ?? emptySelfData.metrics;
  const weight = mergeWeightMetric(metrics.weight ?? emptySelfData.metrics.weight, hubView.floatingMetrics?.weight);
  const nextMove = mergeNextMoveMetric(metrics.nextMove, hubView);

  const leftMetrics = [
    metrics.heartRate,
    metrics.readiness,
    metrics.activity,
    metrics.calories,
  ].filter(Boolean);

  const rightMetrics = [
    metrics.sleep,
    weight,
    metrics.aura,
    metrics.emotionalState,
    nextMove,
  ].filter(Boolean);

  const enriched = enrichDayLabMetrics(
    {
      leftMetrics,
      rightMetrics,
      systemStatus: metricSource.systemStatus ?? {
        label: hubView.header.systemStatusLabel,
        sublabel: hubView.header.systemStatusSublabel,
      },
    },
    ouraRow,
  );

  const timelineSource = selfData ?? emptySelfData;

  return {
    leftMetrics: enriched.leftMetrics,
    rightMetrics: enriched.rightMetrics,
    timeline: buildDesktopTimeline(timelineSource, hubView),
    systemStatus: {
      label: hubView.header.systemStatusLabel,
      sublabel: hubView.header.systemStatusSublabel ?? metricSource.systemStatus?.sublabel ?? 'System Status',
    },
  };
}
