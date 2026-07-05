/**
 * Calculator input validation utilities.
 *
 * All 16 calculator components should use these helpers to guard against
 * NaN, Infinity, negative values, and out-of-range inputs that would
 * produce nonsensical results and potentially render "₹NaN" or "₹Infinity"
 * in the UI.
 */

export interface ValidationResult {
  isValid: boolean;
  /** Human-readable error message for display to the user */
  error?: string;
}

/**
 * Validates a currency amount (₹).
 * @param value   The raw input value
 * @param label   Field name shown in the error message
 * @param min     Minimum allowed value (default: 1)
 * @param max     Maximum allowed value (default: 10,00,00,000 = ₹10 Cr)
 */
export function validateAmount(
  value: number | string,
  label: string,
  min = 1,
  max = 100_000_000,
): ValidationResult {
  const n = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (value === '' || value === null || value === undefined) {
    return { isValid: false, error: `${label} is required` };
  }
  if (!Number.isFinite(n)) {
    return { isValid: false, error: `${label} must be a valid number` };
  }
  if (n < min) {
    return { isValid: false, error: `${label} must be at least ₹${min.toLocaleString('en-IN')}` };
  }
  if (n > max) {
    return {
      isValid: false,
      error: `${label} cannot exceed ₹${max.toLocaleString('en-IN')}`,
    };
  }
  return { isValid: true };
}

/**
 * Validates an interest / return rate percentage.
 * @param value   The raw input value
 * @param label   Field name shown in the error message
 * @param min     Minimum allowed % (default: 0.1)
 * @param max     Maximum allowed % (default: 50)
 */
export function validateRate(
  value: number | string,
  label: string,
  min = 0.1,
  max = 50,
): ValidationResult {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (value === '' || value === null || value === undefined) {
    return { isValid: false, error: `${label} is required` };
  }
  if (!Number.isFinite(n)) {
    return { isValid: false, error: `${label} must be a valid number` };
  }
  if (n < min) {
    return { isValid: false, error: `${label} must be at least ${min}%` };
  }
  if (n > max) {
    return { isValid: false, error: `${label} cannot exceed ${max}%` };
  }
  return { isValid: true };
}

/**
 * Validates an investment duration in years.
 * @param value   The raw input value
 * @param min     Minimum years (default: 1)
 * @param max     Maximum years (default: 50)
 */
export function validateYears(
  value: number | string,
  min = 1,
  max = 50,
): ValidationResult {
  const n = typeof value === 'string' ? parseInt(value, 10) : Math.floor(value);
  if (value === '' || value === null || value === undefined) {
    return { isValid: false, error: 'Investment period is required' };
  }
  if (!Number.isFinite(n) || n !== Math.floor(n)) {
    return { isValid: false, error: 'Investment period must be a whole number of years' };
  }
  if (n < min) {
    return { isValid: false, error: `Minimum investment period is ${min} year${min > 1 ? 's' : ''}` };
  }
  if (n > max) {
    return { isValid: false, error: `Maximum investment period is ${max} years` };
  }
  return { isValid: true };
}

/**
 * Formats currency for calculator displays — returns '—' for invalid numbers.
 */
export function formatCalculatorCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(2)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}

/**
 * Validates a positive integer within a range (e.g. age, tenure in months).
 */
export function validateInteger(
  value: number | string,
  label: string,
  min: number,
  max: number,
): ValidationResult {
  const n = typeof value === 'string' ? parseInt(value, 10) : Math.floor(value);
  if (value === '' || value === null || value === undefined) {
    return { isValid: false, error: `${label} is required` };
  }
  if (!Number.isFinite(n) || n !== Math.floor(n)) {
    return { isValid: false, error: `${label} must be a whole number` };
  }
  if (n < min) {
    return { isValid: false, error: `${label} must be at least ${min}` };
  }
  if (n > max) {
    return { isValid: false, error: `${label} cannot exceed ${max}` };
  }
  return { isValid: true };
}

/**
 * Validates a lot size / share count (positive integer).
 */
export function validateLotSize(value: number | string): ValidationResult {
  const n = typeof value === 'string' ? parseInt(value, 10) : Math.floor(value);
  if (!Number.isFinite(n) || n <= 0) {
    return { isValid: false, error: 'Lot size must be a positive whole number' };
  }
  if (n > 100_000) {
    return { isValid: false, error: 'Lot size seems unusually large. Please verify.' };
  }
  return { isValid: true };
}

/**
 * Safely parses a financial input — returns the numeric value or null.
 * Never throws. Use this before passing values to calculation functions.
 */
export function safeParseFinancial(value: number | string | undefined | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n =
    typeof value === 'string'
      ? parseFloat(value.replace(/,/g, '').replace(/₹/g, '').trim())
      : value;
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Formats a financial result safely — returns '—' instead of 'NaN' or 'Infinity'.
 */
export function safeFormatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}
