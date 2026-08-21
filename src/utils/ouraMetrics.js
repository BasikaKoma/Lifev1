import { emptySelfData, NO_DATA } from '../data/emptySelfData';
import { buildHeartRateMetric, extractHeartRateFromOuraRow, parseOuraPayload } from './heartRateMetric';
import { buildTimelineFromReference } from './selfDateUtils';

function scoreStatus(score, bands) {
  if (score == null) return NO_DATA;
  for (const band of bands) {
    if (score >= band.min) return band.label;
  }
  return bands[bands.length - 1]?.label ?? '—';
}

function formatTimeLabel(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function deriveSystemStatus(metrics) {
  const scores = [metrics.sleep?.value, metrics.readiness?.value, metrics.activity?.value].filter(
    (value) => typeof value === 'number',
  );
  if (scores.length === 0) return emptySelfData.systemStatus;
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  if (avg >= 80) return { label: 'Balanced', sublabel: 'System Status' };
  if (avg >= 65) return { label: 'Steady', sublabel: 'System Status' };
  return { label: 'Recovering', sublabel: 'System Status' };
}

function deriveNextMove(readinessScore, sleepScore) {
  const base = emptySelfData.metrics.nextMove;
  if (readinessScore == null && sleepScore == null) return base;
  if ((readinessScore ?? 0) >= 80) {
    return {
      ...base,
      message: 'High readiness today. Good window for focused work or training.',
      chart: { type: 'smoke' },
    };
  }
  if ((sleepScore ?? 100) < 70) {
    return {
      ...base,
      message: 'Sleep was light last night. Protect recovery and keep the morning lighter.',
      chart: { type: 'smoke' },
    };
  }
  return {
    ...base,
    message: 'Protect your focus this morning. Consider a 90-min deep work block.',
    chart: { type: 'smoke' },
  };
}

function deriveEmotionalState(stressPayload, readinessScore) {
  const base = emptySelfData.metrics.emotionalState;
  const stressHigh = stressPayload?.stress_high;
  const recoveryHigh = stressPayload?.recovery_high;
  const summary = stressPayload?.day_summary;

  if (stressHigh == null && recoveryHigh == null && readinessScore == null) {
    return base;
  }

  const stressMinutes = typeof stressHigh === 'number' ? stressHigh / 60 : 0;
  const recoveryMinutes = typeof recoveryHigh === 'number' ? recoveryHigh / 60 : 0;
  const balance = recoveryMinutes - stressMinutes;
  const value = Math.max(
    20,
    Math.min(100, Math.round((readinessScore ?? 70) * 0.6 + balance * 0.4 + 20)),
  );

  let status = 'Balanced';
  if (summary === 'stressful') status = 'Elevated stress';
  else if (summary === 'restored') status = 'Recovered';
  else if (balance > 30) status = 'Calm';
  else if (balance < -30) status = 'Tense';

  return { ...base, value, status };
}

function deriveAura(spo2, hrvBalance, readinessScore) {
  const base = emptySelfData.metrics.aura;
  const spo2Value = typeof spo2 === 'number' ? spo2 : null;
  const hrv = typeof hrvBalance === 'number' ? hrvBalance : null;
  const readiness = typeof readinessScore === 'number' ? readinessScore : null;

  if (spo2Value == null && hrv == null && readiness == null) {
    return base;
  }

  const value = Math.round(
    (readiness ?? 75) * 0.45 + (hrv ?? 70) * 0.35 + ((spo2Value ?? 97) - 90) * 3,
  );
  const clamped = Math.max(30, Math.min(100, value));
  const factor = clamped / 100;

  return {
    ...base,
    value: clamped,
    status: clamped >= 85 ? 'Radiant' : clamped >= 70 ? 'Steady' : 'Muted',
    chart: {
      type: 'auraRings',
      layers: [0.92, 0.68, 0.46, 0.24].map((layer) => Math.max(0.12, layer * factor)),
    },
  };
}

export function mapOuraRowToSelfData(row) {
  if (!row) return { ...emptySelfData, source: 'empty' };

  const payload = parseOuraPayload(row.payload);
  const sleepSession = payload.sleep_sessions?.[0] ?? null;
  const sleepScore = row.sleep_score ?? payload.sleep?.score ?? null;
  const readinessScore = row.readiness_score ?? payload.readiness?.score ?? null;
  const activityScore = row.activity_score ?? payload.activity?.score ?? null;
  const activeCalories = row.active_calories ?? payload.activity?.active_calories ?? null;
  const totalCalories = row.total_calories ?? payload.activity?.total_calories ?? null;
  const targetCalories = row.target_calories ?? payload.activity?.target_calories ?? null;
  const hrvBalance = payload.readiness?.contributors?.hrv_balance ?? null;
  const spo2 = row.spo2_average ?? payload.spo2?.spo2_percentage?.average ?? null;
  const steps = row.steps ?? payload.activity?.steps ?? null;

  const metrics = {
    ...emptySelfData.metrics,
    sleep: {
      ...emptySelfData.metrics.sleep,
      value: sleepScore ?? '—',
      status: scoreStatus(sleepScore, [
        { min: 85, label: 'Restorative' },
        { min: 70, label: 'Solid' },
        { min: 55, label: 'Light' },
        { min: 0, label: 'Recovery needed' },
      ]),
      chart: sleepScore != null || sleepSession
        ? {
            type: 'sleepBars',
            startLabel: formatTimeLabel(sleepSession?.bedtime_start),
            endLabel: formatTimeLabel(sleepSession?.bedtime_end),
            bars: sleepScore != null
              ? Array.from({ length: 20 }, (_, i) =>
                  Math.round((sleepScore / 100) * 80 * (0.85 + (i % 5) * 0.03)),
                )
              : [],
          }
        : emptySelfData.metrics.sleep.chart,
    },
    readiness: {
      ...emptySelfData.metrics.readiness,
      value: readinessScore ?? '—',
      status: scoreStatus(readinessScore, [
        { min: 85, label: 'Good to go' },
        { min: 70, label: 'Ready' },
        { min: 55, label: 'Take it easy' },
        { min: 0, label: 'Recovery day' },
      ]),
    },
    activity: {
      ...emptySelfData.metrics.activity,
      value: activityScore ?? '—',
      status: activityScore != null
        ? scoreStatus(activityScore, [
            { min: 85, label: 'Strong day' },
            { min: 70, label: 'On track' },
            { min: 55, label: 'Building' },
            { min: 0, label: 'Low movement' },
          ])
        : steps != null
          ? `${steps.toLocaleString()} steps`
          : NO_DATA,
      chart: activityScore != null
        ? {
            type: 'activityBars',
            labels: ['12 AM', '12 PM', '12 AM'],
            bars: Array.from({ length: 24 }, () => Math.round((activityScore / 100) * 45)),
          }
        : emptySelfData.metrics.activity.chart,
    },
    calories: {
      ...emptySelfData.metrics.calories,
      intake: totalCalories ?? '—',
      burned: activeCalories ?? '—',
      goal: targetCalories ?? 2400,
      status:
        totalCalories != null && activeCalories != null
          ? `${totalCalories - activeCalories >= 0 ? '+' : ''}${totalCalories - activeCalories} net`
          : NO_DATA,
    },
    aura: deriveAura(spo2, hrvBalance, readinessScore),
    emotionalState: deriveEmotionalState(payload.stress, readinessScore),
    heartRate: buildHeartRateMetric({
      ...extractHeartRateFromOuraRow(row),
    }),
    nextMove: deriveNextMove(readinessScore, sleepScore),
  };

  return {
    systemStatus: deriveSystemStatus(metrics),
    metrics,
    timeline: buildTimelineFromReference(row.synced_at),
    source: 'oura',
    day: row.day,
    updatedAt: row.synced_at ?? null,
    dataDay: row.day ?? null,
  };
}

export function buildSelfViewData({ ouraRow, connected }) {
  if (connected && ouraRow) {
    return mapOuraRowToSelfData(ouraRow);
  }
  return { ...emptySelfData, source: connected ? 'oura-empty' : 'empty' };
}
