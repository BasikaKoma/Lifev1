export function localTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatSelfDataDate(isoString) {
  const date = isoString ? new Date(isoString) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date());
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatSelfUpdatedTime(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('el-GR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function buildTimelineFromReference(isoString) {
  const date = isoString ? new Date(isoString) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const currentHour =
    safeDate.getHours() + safeDate.getMinutes() / 60 + safeDate.getSeconds() / 3600;

  return {
    currentHour,
    referenceTime: safeDate.toISOString(),
    markers: ['12 AM', '3 AM', '6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM', '12 AM'],
    segments: [],
    dots: [],
  };
}

export function rowHasOuraScores(row) {
  if (!row) return false;
  return (
    row.sleep_score != null
    || row.readiness_score != null
    || row.activity_score != null
    || row.avg_heart_rate != null
    || row.resting_heart_rate != null
  );
}

export function pickBestOuraRow(rows) {
  if (!rows?.length) return null;

  const today = localTodayIsoDate();
  const sorted = [...rows].sort((a, b) => b.day.localeCompare(a.day));

  const todayRow = sorted.find((row) => row.day === today);
  if (todayRow) return todayRow;

  return sorted.find(rowHasOuraScores) ?? sorted[0];
}

export function isOuraSyncDue(lastSyncedAt, minIntervalMs = 30 * 60 * 1000) {
  if (!lastSyncedAt) return true;
  return Date.now() - new Date(lastSyncedAt).getTime() > minIntervalMs;
}

/** @deprecated use isOuraSyncDue — kept for callers; no longer checks row.day to avoid sync loops */
export function isOuraRowStale(_row, lastSyncedAt) {
  return isOuraSyncDue(lastSyncedAt);
}
