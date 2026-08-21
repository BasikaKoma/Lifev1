import { deriveCircadianContext } from './capacityEngine';

/**
 * Focus window from recovery + circadian context (not hardcoded times).
 *
 * @param {{ recovery: number|null, sleepScore: number|null }} params
 * @param {Date} [now]
 */
export function computeFocusWindow({ recovery, sleepScore }, now = new Date()) {
  const ctx = deriveCircadianContext(now);
  const hour = ctx.hour;

  if (recovery == null) {
    return {
      status: 'No data',
      detail: null,
      endHour: null,
      level: 'none',
    };
  }

  if (recovery >= 80 && ctx.isMorningPeak) {
    const endHour = Math.min(12.25, hour + 2.5);
    return {
      status: 'HIGH',
      detail: formatHour(endHour),
      endHour,
      level: 'high',
    };
  }

  if (recovery >= 70 && hour >= 8 && hour < 14) {
    const endHour = Math.min(14, hour + 2);
    return {
      status: 'MODERATE',
      detail: formatHour(endHour),
      endHour,
      level: 'moderate',
    };
  }

  if ((sleepScore ?? 100) < 65) {
    return {
      status: 'LOW',
      detail: 'Protect recovery',
      endHour: null,
      level: 'low',
    };
  }

  if (hour >= 17) {
    return {
      status: 'WIND DOWN',
      detail: 'Evening recovery',
      endHour: null,
      level: 'low',
    };
  }

  return {
    status: 'STEADY',
    detail: formatHour(Math.min(24, hour + 1.5)),
    endHour: hour + 1.5,
    level: 'moderate',
  };
}

function formatHour(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 || 12;
  return m ? `${display}:${String(m).padStart(2, '0')} ${period}` : `${display} ${period}`;
}

export function formatFocusWindowLine(focusWindow) {
  if (!focusWindow?.detail) return focusWindow?.status ?? 'No data';
  if (focusWindow.level === 'high' || focusWindow.level === 'moderate') {
    return `${focusWindow.status} → ${focusWindow.detail}`;
  }
  return focusWindow.status;
}

export function formatCapacitySubtext(focusWindow) {
  if (!focusWindow?.detail || focusWindow.level === 'low') {
    return focusWindow?.detail ?? 'Sync Oura for focus guidance';
  }
  return `Best window → ${focusWindow.detail}`;
}
