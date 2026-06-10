// scripts/lib/diff-detector.mjs

/**
 * @typedef {Object} DiffResult
 * @property {boolean} allowed - Whether the write should proceed
 * @property {string} [reason] - Reason for rejection
 * @property {Object[]} [mergedRecords] - Records with timestamps preserved
 */

/**
 * Check if new data should replace existing data.
 * Rejects if new data has < 50% of existing record count.
 *
 * @param {Object[]} existingData - Current records on disk
 * @param {Object[]} newData - Incoming records from fetch
 * @param {Object} options
 * @param {number} [options.minRatio=0.5] - Minimum ratio of new/existing count
 * @param {string} [options.keyField='slug'] - Field used to match records
 * @returns {DiffResult}
 */
export function checkCountThreshold(existingData, newData, options = {}) {
  const { minRatio = 0.5 } = options;

  if (existingData.length === 0) {
    return { allowed: true, mergedRecords: newData };
  }

  const ratio = newData.length / existingData.length;

  if (ratio < minRatio) {
    return {
      allowed: false,
      reason: `New data has ${newData.length} records (${(ratio * 100).toFixed(1)}% of existing ${existingData.length}). Threshold: ${minRatio * 100}%`,
    };
  }

  return { allowed: true, mergedRecords: newData };
}

/**
 * Protect fields from degradation. If an existing record has a non-null/non-empty
 * field and the new record has null/empty for the same field, preserve the old value.
 *
 * @param {Object[]} existingData
 * @param {Object[]} newData
 * @param {string} keyField - Field to match records by
 * @returns {Object[]} Merged records with field protection applied
 */
export function protectFields(existingData, newData, keyField = 'slug') {
  const existingMap = new Map(existingData.map(r => [r[keyField], r]));

  return newData.map(newRecord => {
    const existing = existingMap.get(newRecord[keyField]);
    if (!existing) return newRecord;

    const merged = { ...newRecord };
    for (const [key, oldValue] of Object.entries(existing)) {
      if (key === keyField || key === 'lastUpdated') continue;

      const newValue = merged[key];
      const oldIsPopulated = oldValue !== null && oldValue !== undefined && oldValue !== '';
      const newIsEmpty = newValue === null || newValue === undefined || newValue === '';

      if (oldIsPopulated && newIsEmpty) {
        merged[key] = oldValue;
      }
    }

    return merged;
  });
}

/**
 * Preserve lastUpdated timestamps for records that haven't changed.
 *
 * @param {Object[]} existingData
 * @param {Object[]} newData
 * @param {string} keyField
 * @param {string[]} compareFields - Fields to compare for change detection
 * @returns {Object[]} Records with timestamps preserved when unchanged
 */
export function preserveTimestamps(existingData, newData, keyField = 'slug', compareFields = []) {
  const existingMap = new Map(existingData.map(r => [r[keyField], r]));
  const now = new Date().toISOString();

  return newData.map(newRecord => {
    const existing = existingMap.get(newRecord[keyField]);

    if (!existing) {
      return { ...newRecord, lastUpdated: now };
    }

    // Compare relevant fields to detect changes
    const fields = compareFields.length > 0
      ? compareFields
      : Object.keys(newRecord).filter(k => k !== 'lastUpdated' && k !== keyField);

    const hasChanged = fields.some(field =>
      JSON.stringify(newRecord[field]) !== JSON.stringify(existing[field])
    );

    if (hasChanged) {
      return { ...newRecord, lastUpdated: now };
    }

    return { ...newRecord, lastUpdated: existing.lastUpdated || now };
  });
}
