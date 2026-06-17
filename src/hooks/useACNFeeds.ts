import { useState, useEffect, useCallback } from 'react';
import { feedsApi } from '@/lib/api/feeds';
import { useClientOrganization } from '@/hooks/useClientOrganization';

export interface FeedItem {
  title: string;
  description: string;
  url: string;
  date: string;
  type: 'nis2' | 'threat' | 'cve';
  severity?: 'critica' | 'alta' | 'media' | 'bassa';
  cveId?: string;
  epssScore?: number;
  epssPercentile?: number;
}

export interface EPSSPrediction {
  cveId: string;
  vendor: string;
  prediction: number;
  cvssScore: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  url: string;
}

interface FeedsData {
  nis2: FeedItem[];
  threat: FeedItem[];
  cve: FeedItem[];
  epss: EPSSPrediction[];
}

interface UseACNFeedsResult {
  nis2Feed: FeedItem[];
  threatFeed: FeedItem[];
  cveFeed: FeedItem[];
  epssFeed: EPSSPrediction[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const CACHE_KEY = 'acn_feeds_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedData {
  data: FeedsData;
  timestamp: number;
}

function getCachedData(): FeedsData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed: CachedData = JSON.parse(cached);
    if (Date.now() - parsed.timestamp < CACHE_DURATION) {
      return parsed.data;
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

function setCachedData(data: FeedsData): void {
  try {
    const cacheEntry: CachedData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
  } catch {
    // Ignore cache errors
  }
}

export function useACNFeeds(): UseACNFeedsResult {
  const { groupId } = useClientOrganization();
  const [nis2Feed, setNis2Feed] = useState<FeedItem[]>([]);
  const [threatFeed, setThreatFeed] = useState<FeedItem[]>([]);
  const [cveFeed, setCveFeed] = useState<FeedItem[]>([]);
  const [epssFeed, setEpssFeed] = useState<EPSSPrediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeeds = useCallback(async (skipCache = false) => {
    // Check cache first
    if (!skipCache) {
      const cached = getCachedData();
      if (cached) {
        setNis2Feed(cached.nis2);
        setThreatFeed(cached.threat);
        setCveFeed(cached.cve || []);
        setEpssFeed(cached.epss || []);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await feedsApi.list(groupId);

      // Backend returns { success, message, data } where data contains nis2/threat/cve/epss
      const feedsData = (response as unknown as FeedsData);
      setNis2Feed(feedsData.nis2 || []);
      setThreatFeed(feedsData.threat || []);
      setCveFeed(feedsData.cve || []);
      setEpssFeed(feedsData.epss || []);
      setCachedData(feedsData);
    } catch (err) {
      console.error('Error fetching ACN feeds:', err);
      setError(err instanceof Error ? err.message : 'Errore nel caricamento dei feed');

      // Try to use cached data as fallback
      const cached = getCachedData();
      if (cached) {
        setNis2Feed(cached.nis2);
        setThreatFeed(cached.threat);
        setCveFeed(cached.cve || []);
        setEpssFeed(cached.epss || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchFeeds();
    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      fetchFeeds(true);
    }, CACHE_DURATION);
    return () => clearInterval(interval);
  }, [fetchFeeds]);

  const refetch = useCallback(() => {
    fetchFeeds(true);
  }, [fetchFeeds]);

  return {
    nis2Feed,
    threatFeed,
    cveFeed,
    epssFeed,
    isLoading,
    error,
    refetch,
  };
}
