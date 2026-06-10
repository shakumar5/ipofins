// scripts/lib/validate.mjs
// Pure-function validation module — no side effects (no network, no file I/O).
// Accepts data arrays and schema definitions, returns partitioned results.

/**
 * @typedef {Object} FieldRule
 * @property {'string'|'number'|'boolean'|'object'|'array'} type
 * @property {number} [min] - Minimum value (for numbers)
 * @property {number} [max] - Maximum value (for numbers)
 * @property {boolean} [nonEmpty] - Must be non-empty string
 * @property {string[]} [enum] - Allowed values
 */

/**
 * @typedef {Object} Schema
 * @property {Object.<string, FieldRule>} required - Required fields and their rules
 * @property {Object.<string, FieldRule>} [optional] - Optional fields and their rules
 */

/**
 * @typedef {Object} ValidationResult
 * @property {Object[]} valid - Records that passed validation
 * @property {Array<{record: Object, reasons: string[]}>} rejected - Records with failure reasons
 */

/**
 * Validate a single field value against a rule definition.
 * @param {*} value - The field value to validate
 * @param {string} fieldName - Name of the field (for error messages)
 * @param {FieldRule} rule - The rule to validate against
 * @returns {string[]} Array of failure reasons (empty = valid)
 */
export function validateField(value, fieldName, rule) {
  const reasons = [];

  // Type check
  if (rule.type === 'number' && typeof value !== 'number') {
    reasons.push(`${fieldName}: expected number, got ${typeof value}`);
    return reasons; // Skip further checks if type is wrong
  }
  if (rule.type === 'string' && typeof value !== 'string') {
    reasons.push(`${fieldName}: expected string, got ${typeof value}`);
    return reasons;
  }
  if (rule.type === 'boolean' && typeof value !== 'boolean') {
    reasons.push(`${fieldName}: expected boolean, got ${typeof value}`);
    return reasons;
  }
  if (rule.type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    reasons.push(`${fieldName}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`);
    return reasons;
  }
  if (rule.type === 'array' && !Array.isArray(value)) {
    reasons.push(`${fieldName}: expected array, got ${typeof value}`);
    return reasons;
  }

  // Range checks for numbers
  if (rule.type === 'number' && typeof value === 'number') {
    if (isNaN(value)) {
      reasons.push(`${fieldName}: value is NaN`);
      return reasons;
    }
    if (rule.min !== undefined && value < rule.min) {
      reasons.push(`${fieldName}: value ${value} below minimum ${rule.min}`);
    }
    if (rule.max !== undefined && value > rule.max) {
      reasons.push(`${fieldName}: value ${value} above maximum ${rule.max}`);
    }
  }

  // Non-empty string check
  if (rule.nonEmpty && typeof value === 'string' && value.trim().length === 0) {
    reasons.push(`${fieldName}: string must not be empty`);
  }

  // Enum check
  if (rule.enum && !rule.enum.includes(value)) {
    reasons.push(`${fieldName}: value '${value}' not in allowed values [${rule.enum.join(', ')}]`);
  }

  return reasons;
}

/**
 * Validate a single record against a schema.
 * @param {Object} record - The record to validate
 * @param {Schema} schema - Schema definition with required and optional fields
 * @returns {string[]} Array of failure reasons (empty = valid)
 */
export function validateRecord(record, schema) {
  const reasons = [];

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return ['Record is not an object'];
  }

  // Check required fields
  for (const [field, rule] of Object.entries(schema.required)) {
    if (record[field] === undefined || record[field] === null) {
      reasons.push(`Missing required field: ${field}`);
      continue;
    }
    const fieldReasons = validateField(record[field], field, rule);
    reasons.push(...fieldReasons);
  }

  // Check optional fields (only if present)
  if (schema.optional) {
    for (const [field, rule] of Object.entries(schema.optional)) {
      if (record[field] !== undefined && record[field] !== null) {
        const fieldReasons = validateField(record[field], field, rule);
        reasons.push(...fieldReasons);
      }
    }
  }

  return reasons;
}

/**
 * Validate an array of records against a schema definition.
 * Partitions records into valid and rejected arrays.
 *
 * @param {Object[]} records - Data records to validate
 * @param {Schema} schema - Schema definition with required and optional field rules
 * @returns {ValidationResult} Object with `valid` array and `rejected` array (each rejected entry has `record` and `reasons`)
 */
export function validateBatch(records, schema) {
  const valid = [];
  const rejected = [];

  for (const record of records) {
    const reasons = validateRecord(record, schema);
    if (reasons.length === 0) {
      valid.push(record);
    } else {
      rejected.push({ record, reasons });
    }
  }

  return { valid, rejected };
}
