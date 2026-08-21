export const OURA_DATA_TYPES = [
  { id: 'daily_sleep', label: 'Daily Sleep', description: 'Sleep score, contributors, efficiency, latency' },
  { id: 'sleep', label: 'Sleep Sessions', description: 'Bedtime, wake time, stages (deep/REM/light), HRV during sleep' },
  { id: 'readiness', label: 'Readiness', description: 'Recovery score, HRV balance, body temperature, resting HR' },
  { id: 'activity', label: 'Daily Activity', description: 'Activity score, steps, MET minutes, inactivity alerts' },
  { id: 'stress', label: 'Daily Stress', description: 'Stress vs recovery minutes, daily stress summary' },
  { id: 'spo2', label: 'SpO2', description: 'Nightly blood oxygen average (Gen 3+)' },
  { id: 'heartrate', label: 'Heart Rate', description: '5-min heart rate samples, avg/min/max/resting BPM' },
  { id: 'workout', label: 'Workouts', description: 'Auto-detected and manual workouts with calories & HR' },
  { id: 'session', label: 'Sessions', description: 'Guided/unguided meditation & breath sessions' },
  { id: 'tag', label: 'Tags', description: 'User-entered tags (caffeine, alcohol, etc.)' },
  { id: 'sleep_time', label: 'Sleep Time', description: 'Optimal bedtime recommendations' },
  { id: 'rest_mode', label: 'Rest Mode', description: 'Rest mode periods' },
  { id: 'personal', label: 'Personal Info', description: 'Age, gender, height, weight' },
  { id: 'ring', label: 'Ring Config', description: 'Ring model, firmware, color' },
];

export function formatOuraTimestamp(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('el-GR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDurationSeconds(seconds) {
  if (seconds == null) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} λεπτά`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours}ώ ${rest}λ` : `${hours}ώ`;
}

export function extractOuraSummary(metricsRow, status) {
  const payload = metricsRow?.payload ?? {};
  const readinessContributors = payload.readiness?.contributors ?? {};
  const sleepContributors = payload.sleep?.contributors ?? {};
  const sleepSession = payload.sleep_sessions?.[0] ?? null;
  const activityPending = metricsRow?.activity_score == null && metricsRow?.steps == null;

  return {
    day: metricsRow?.day ?? null,
    activityPending,
    sleepScore: metricsRow?.sleep_score ?? payload.sleep?.score ?? null,
    readinessScore: metricsRow?.readiness_score ?? payload.readiness?.score ?? null,
    activityScore: metricsRow?.activity_score ?? payload.activity?.score ?? null,
    steps: metricsRow?.steps ?? payload.activity?.steps ?? null,
    activeCalories: metricsRow?.active_calories ?? payload.activity?.active_calories ?? null,
    totalCalories: metricsRow?.total_calories ?? payload.activity?.total_calories ?? null,
    spo2: metricsRow?.spo2_average ?? payload.spo2?.spo2_percentage?.average ?? null,
    stressHigh: formatDurationSeconds(metricsRow?.stress_high_seconds ?? payload.stress?.stress_high),
    recoveryHigh: formatDurationSeconds(metricsRow?.recovery_high_seconds ?? payload.stress?.recovery_high),
    stressSummary: payload.stress?.day_summary ?? null,
    avgHeartRate: metricsRow?.avg_heart_rate ?? payload.heart_rate?.avg_bpm ?? null,
    restingHeartRate: metricsRow?.resting_heart_rate ?? payload.heart_rate?.resting_bpm ?? null,
    hrvBalance: readinessContributors.hrv_balance ?? null,
    deepSleep: sleepContributors.deep_sleep ?? sleepSession?.deep_sleep_duration ?? null,
    remSleep: sleepContributors.rem_sleep ?? sleepSession?.rem_sleep_duration ?? null,
    bedtime: sleepSession?.bedtime_start ?? null,
    wakeTime: sleepSession?.bedtime_end ?? null,
    workouts: payload.workouts?.length ?? 0,
    sessions: payload.sessions?.length ?? 0,
    tags: payload.tags?.length ?? 0,
    profile: status?.profile ?? {},
    scopes: status?.scopes ?? null,
  };
}

export function needsOuraReconnect(status) {
  if (!status?.connected) return false;
  const scopes = status?.scopes ?? '';
  return !scopes.includes('heartrate') || !scopes.includes('spo2Daily');
}
