import type { ChangeEvent } from 'react';
import {
  validateAmount,
  validateInteger,
  validateRate,
  validateYears,
  type ValidationResult,
} from '../../utils/calculator-validation';

export type SliderValidation =
  | { type: 'amount'; label: string; min: number; max: number }
  | { type: 'rate'; label: string; min: number; max: number }
  | { type: 'years'; min: number; max: number }
  | { type: 'integer'; label: string; min: number; max: number };

function runValidation(value: number, rule: SliderValidation): ValidationResult {
  switch (rule.type) {
    case 'amount':
      return validateAmount(value, rule.label, rule.min, rule.max);
    case 'rate':
      return validateRate(value, rule.label, rule.min, rule.max);
    case 'years':
      return validateYears(value, rule.min, rule.max);
    case 'integer':
      return validateInteger(value, rule.label, rule.min, rule.max);
  }
}

export interface SliderFieldProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  minLabel?: string;
  maxLabel?: string;
  validation: SliderValidation;
  error?: string;
  onValidChange: (value: number) => void;
  onError?: (message?: string) => void;
}

export default function SliderField({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  minLabel,
  maxLabel,
  validation,
  error,
  onValidChange,
  onError,
}: SliderFieldProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const result = runValidation(val, validation);
    onError?.(result.error);
    if (result.isValid) onValidChange(val);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor={id} className="text-sm font-medium text-surface-700 dark:text-surface-300">
          {label}
        </label>
        <span className="text-sm font-bold font-mono text-surface-900 dark:text-white">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={`${label}: ${display}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-xs text-surface-500 mt-1">
          {minLabel && <span>{minLabel}</span>}
          {maxLabel && <span>{maxLabel}</span>}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className="input-error-shake text-xs text-danger-600 dark:text-danger-400 mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
