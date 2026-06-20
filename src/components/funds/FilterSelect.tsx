import type { ReactNode, SelectHTMLAttributes } from 'react';

const SELECT_CLASS =
  'w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white';

interface FilterSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label: string;
  children: ReactNode;
}

/** Labeled select — wrapping label + explicit aria-label for screen readers and AI agent audits. */
export default function FilterSelect({
  id,
  label,
  className,
  children,
  'aria-label': ariaLabelProp,
  ...rest
}: FilterSelectProps) {
  const accessibleName = ariaLabelProp ?? label;
  return (
    <label className="block">
      <span className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">
        {label}
      </span>
      <select
        id={id}
        aria-label={accessibleName}
        className={className ? `${SELECT_CLASS} ${className}` : SELECT_CLASS}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}
