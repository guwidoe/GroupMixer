import { useCallback, useEffect, useState } from 'react';

export function useLocalStorageState<T>(key: string, fallback: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return fallback;
      return JSON.parse(stored) as T;
    } catch {
      return fallback;
    }
  });

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setState((prev) => (typeof value === 'function' ? (value as (prev: T) => T)(prev) : value));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [key, state]);

  return [state, setValue] as const;
}
