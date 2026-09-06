/** @typedef {'oura'|'scale'|'computed'|'none'} SelfHubMetricSource */
/** @typedef {'high'|'medium'|'low'|'none'} SelfHubConfidence */

export const NO_DATA = 'No data';

/** @typedef {Object} SelfHubMetric
 * @property {string|number|null} value
 * @property {string} label
 * @property {string} status
 * @property {SelfHubMetricSource} source
 * @property {string|null} updatedAt
 * @property {SelfHubConfidence} confidence
 * @property {boolean} isLive
 * @property {string} [unit]
 * @property {string} [secondary] — e.g. "3 min ago", "/100"
 * @property {number|null} [max]
 * @property {number|null} [caloriesIn] — total kcal (Oura total_calories)
 * @property {number|null} [caloriesOut] — active kcal burned (Oura active_calories)
 * @property {number|null} [resting] — resting HR (bpm)
 * @property {number|null} [avg] — average HR (bpm)
 * @property {{ type: string, points?: number[], samples?: unknown[], startLabel?: string, endLabel?: string, sampleCount?: number }|undefined} [chart]
 */

/** @typedef {Object} SelfHubHeader
 * @property {string} dateLabel
 * @property {string|null} updatedLabel
 * @property {string|null} dataDay
 * @property {string} systemStatusLabel
 * @property {string} systemStatusSublabel
 * @property {string|null} displayName
 */

/** @typedef {Object} SelfHubCapacity
 * @property {number|null} value
 * @property {string} label
 * @property {string} subtext
 * @property {SelfHubMetricSource} source
 * @property {string|null} updatedAt
 * @property {SelfHubConfidence} confidence
 */

/** @typedef {Object} SelfHubDaySegment
 * @property {number} start — hour 0–24
 * @property {number} end
 * @property {string} tone — emerald | amber | muted | focus | sleep | meeting
 * @property {string} [label]
 */

/** @typedef {Object} SelfHubDayProgress
 * @property {number} currentHour
 * @property {string[]} markers
 * @property {SelfHubDaySegment[]} segments
 * @property {string|null} referenceTime
 */

/** @typedef {Object} SelfHubDeepWork
 * @property {string} mode
 * @property {string} message
 * @property {SelfHubMetricSource} source
 */

/** @typedef {Object} SelfHubTodayItem
 * @property {string} id
 * @property {string} text
 * @property {boolean} done
 */

/** @typedef {Object} SelfHubTodayThree
 * @property {SelfHubTodayItem[]} items
 * @property {SelfHubMetricSource} source
 */

/** @typedef {Object} SelfHubNextAction
 * @property {string} title
 * @property {string} message
 * @property {string} buttonLabel
 * @property {SelfHubMetricSource} source
 */

/** @typedef {Object} SelfHubProjectDayItem
 * @property {string} id
 * @property {string} title
 * @property {string} projectTitle
 * @property {string|null} [stageTitle]
 * @property {'milestone'|'checkpoint'|'note'|'task'|'obstacle'|'resource'|'idea'|'image'|'sticky'|'path'} [kind]
 * @property {string} [timestamp]
 * @property {string} [completedAt]
 * @property {string} [timeLabel]
 * @property {boolean} [done]
 */

/** @typedef {Object} SelfHubProjectDay
 * @property {SelfHubProjectDayItem[]} completed
 * @property {SelfHubProjectDayItem[]} notes
 * @property {SelfHubProjectDayItem[]} scheduled
 * @property {SelfHubMetricSource} source
 */

/** @typedef {Object} SelfHubFloatingMetrics
 * @property {SelfHubMetric} recovery
 * @property {SelfHubMetric} heartRate
 * @property {SelfHubMetric} stress
 * @property {SelfHubMetric} weight
 * @property {SelfHubMetric} focusWindow
 * @property {SelfHubMetric} movement
 */

/** @typedef {Object} SelfHubViewModel
 * @property {SelfHubHeader} header
 * @property {SelfHubFloatingMetrics} floatingMetrics
 * @property {SelfHubCapacity} capacity
 * @property {SelfHubDayProgress} dayProgress
 * @property {SelfHubDeepWork} deepWork
 * @property {SelfHubTodayThree} todayThree
 * @property {SelfHubNextAction} nextAction
 * @property {SelfHubMetric[]} summaryStrip
 * @property {SelfHubProjectDay} projectDay
 * @property {boolean} hasData
 */

/** @param {Partial<SelfHubMetric>} [overrides] */
export function createEmptyMetric(overrides = {}) {
  return {
    value: null,
    label: '',
    status: NO_DATA,
    source: 'none',
    updatedAt: null,
    confidence: 'none',
    isLive: false,
    unit: undefined,
    secondary: undefined,
    max: null,
    ...overrides,
  };
}

/** @param {Partial<SelfHubCapacity>} [overrides] */
export function createEmptyCapacity(overrides = {}) {
  return {
    value: null,
    label: NO_DATA,
    subtext: '',
    source: 'none',
    updatedAt: null,
    confidence: 'none',
    ...overrides,
  };
}
