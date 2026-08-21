/**
 * Capacity engine — separate from raw readiness to avoid double-counting sleep/activity signals.
 * Weights are provisional; interface is stable.
 *
 * @typedef {Object} CapacityInputs
 * @property {number|null} recovery — readiness score 0–100
 * @property {{ stressLevel: string|null, energyLevel: string|null }} currentState
 * @property {{ hour: number, isMorningPeak: boolean, isAfternoonDip: boolean }} circadianContext
 */

/** @param {CapacityInputs} inputs */
export function computeCapacity({ recovery, currentState, circadianContext }) {
  if (recovery == null) {
    return { value: null, label: NO_DATA_LABEL, confidence: 'none' };
  }

  let score = recovery;

  if (currentState.stressLevel === 'high') score -= 12;
  else if (currentState.stressLevel === 'low') score += 4;

  if (circadianContext.isMorningPeak && recovery >= 70) score += 6;
  if (circadianContext.isAfternoonDip) score -= 8;

  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  let label = 'Moderate';
  if (clamped >= 85) label = 'Strong';
  else if (clamped >= 70) label = 'Steady';
  else if (clamped >= 55) label = 'Building';
  else label = 'Recovery';

  return {
    value: clamped,
    label,
    confidence: recovery != null ? 'medium' : 'none',
  };
}

const NO_DATA_LABEL = 'No data';

export function deriveCurrentState(stressSummary, readinessScore) {
  let stressLevel = null;
  if (stressSummary === 'stressful') stressLevel = 'high';
  else if (stressSummary === 'restored') stressLevel = 'low';
  else if (stressSummary === 'normal') stressLevel = 'medium';

  let energyLevel = null;
  if (readinessScore != null) {
    if (readinessScore >= 80) energyLevel = 'high';
    else if (readinessScore >= 60) energyLevel = 'medium';
    else energyLevel = 'low';
  }

  return { stressLevel, energyLevel };
}

export function deriveCircadianContext(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60;
  return {
    hour,
    isMorningPeak: hour >= 8 && hour <= 11.5,
    isAfternoonDip: hour >= 13 && hour <= 15.5,
  };
}
