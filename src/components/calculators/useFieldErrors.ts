import { useCallback, useState } from 'react';

/** Shared error state for calculator slider fields. */
export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const setError = useCallback(
    (field: string) => (msg?: string) => setErrors((e) => ({ ...e, [field]: msg })),
    [],
  );
  return { errors, setError };
}
