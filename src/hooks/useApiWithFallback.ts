import { useState, useEffect, useCallback } from 'react';

/**
 * Hook that tries to fetch data from an API endpoint,
 * falling back to mock data if the endpoint doesn't exist yet.
 *
 * @param fetcher - async function that calls the real API
 * @param mockData - fallback data when API fails
 * @param deps - dependency array for re-fetching
 */
export function useApiWithFallback<T>(
  fetcher: () => Promise<T>,
  mockData: T,
  deps: readonly unknown[] = [],
) {
  const [data, setData] = useState<T>(mockData);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
      setIsMock(false);
    } catch (err: any) {
      // API endpoint doesn't exist yet or returned error — use mock data
      setData(mockData);
      setIsMock(true);
      setError(err?.message || null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, isMock, error, refresh: fetchData };
}
