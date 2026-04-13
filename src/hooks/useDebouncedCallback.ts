import { useRef, useCallback, useEffect } from 'react';

/**
 * Returns a debounced async callback that cancels any pending invocation
 * when a new one arrives or when the component unmounts.
 */
export function useDebouncedCallback<T extends (...args: never[]) => Promise<void>>(
  callback: T,
  delay = 1500,
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      cancel();
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay, cancel],
  );

  useEffect(() => cancel, [cancel]);

  return { debouncedFn, cancel };
}
