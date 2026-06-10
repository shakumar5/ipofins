// scripts/lib/staleness-monitor.mjs

/**
 * @typedef {Object} StalenessReport
 * @property {number} staleCount - Number of stale records
 * @property {string} dataType - 'IPO' or 'MF'
 * @property {string[]} staleRecords - Slugs/identifiers of stale records
 */

/**
 * Check records for staleness based on their lastUpdated timestamp.
 *
 * Records are considered stale if:
 * - They have no lastUpdated field (always stale)
 * - Their lastUpdated timestamp is older than maxAgeHours
 *
 * Default thresholds: IPO = 24 hours, MF = 48 hours.
 *
 * @param {Object[]} records - Records with lastUpdated field
 * @param {Object} options
 * @param {number} options.maxAgeHours - Maximum age in hours before flagging
 * @param {string} options.dataType - 'IPO' or 'MF'
 * @param {Date} [options.now] - Current time (for testing)
 * @returns {StalenessReport}
 */
export function checkStaleness(records, options) {
  const { maxAgeHours, dataType, now = new Date() } = options;
  const threshold = maxAgeHours * 60 * 60 * 1000; // Convert hours to milliseconds
  const staleRecords = [];

  for (const record of records) {
    if (!record.lastUpdated) {
      staleRecords.push(record.slug || record.name || 'unknown');
      continue;
    }

    const recordTime = new Date(record.lastUpdated).getTime();
    const age = now.getTime() - recordTime;

    if (age > threshold) {
      staleRecords.push(record.slug || record.name || 'unknown');
    }
  }

  return {
    staleCount: staleRecords.length,
    dataType,
    staleRecords,
  };
}
