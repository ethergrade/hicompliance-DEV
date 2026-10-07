import { useState, useEffect, useCallback } from 'react';

/**
 * I dati di esempio si vedono solo nella build demo (/demo/). Altrove un
 * endpoint che non risponde lascia `data` a null: un cliente reale non deve
 * mai vedere numeri inventati presentati come suoi, nemmeno con il badge
 * "Demo Data" accanto (criteri A3 e G3 dell'integrazione Sophos).
 */
const MOCK_ALLOWED = import.meta.env.VITE_DEMO_MODE === 'true';

/**
 * Hook that fetches data from an API endpoint. In the demo build only, it
 * falls back to mock data when the endpoint fails or doesn't exist yet.
 *
 * @param fetcher - async function that calls the real API
 * @param mockData - fallback data, used only in the demo build
 * @param deps - dependency array for re-fetching
 */
export function useApiWithFallback<T>(
  fetcher: () => Promise<T>,
  mockData: T,
  deps: readonly unknown[] = [],
) {
  const [data, setData] = useState<T | null>(MOCK_ALLOWED ? mockData : null);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(MOCK_ALLOWED);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
      setIsMock(false);
    } catch (err: any) {
      setData(MOCK_ALLOWED ? mockData : null);
      setIsMock(MOCK_ALLOWED);
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
