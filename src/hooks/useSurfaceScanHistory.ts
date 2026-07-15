import { useEffect, useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { surfaceScan360Api, type SurfaceScanHistoryEntry } from '@/lib/api/surface-scan360';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { toast } from 'sonner';

export interface SurfaceScanHistoryRow {
  id: string;
  scanned_at: string;
  total_assets: number;
  critical_count: number;
  warning_count: number;
  safe_count: number;
  avg_score: number;
  high_cves: number;
  medium_cves: number;
  low_cves: number;
  triggered_by: string | null;
}

export interface WeeklyPoint {
  label: string;
  scanned_at: string;
  porte_aperte: number;
  porte_chiuse: number;
  cve_critiche: number;
  cve_risolte: number;
  epss_score: number;
  rischio_alto: number;
  rischio_medio: number;
  rischio_basso: number;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });

const toEpss = (avgScore: number) => {
  const s = Math.max(0, Math.min(100, avgScore || 0));
  return Math.round(((100 - s) / 10) * 10) / 10;
};

/**
 * Trigger a manual SurfaceScan (creates a new job via the backend API).
 * Creates a domain_exposure scan for the organization's monitored scope.
 */
export async function triggerManualSurfaceScan(organizationId: string) {
  try {
    const result = await surfaceScan360Api.createJob(
      organizationId,
      { target: '__scope__', scan_profile: 'standard' },
    );
    return result as any;
  } catch (error: any) {
    console.error('triggerManualSurfaceScan failed:', error);
    throw error;
  }
}

export const useSurfaceScanHistory = (limit: number = 12) => {
  const { organizationId, isLoading: orgLoading, groupId } = useClientOrganization();
  const [isExporting, setIsExporting] = useState(false);

  const {
    data: historyRows = [],
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['surface-scan-history', organizationId, limit, groupId],
    queryFn: async () => {
      if (!organizationId) return [] as SurfaceScanHistoryEntry[];
      return surfaceScan360Api.listHistory(organizationId, limit, groupId);
    },
    enabled: !!organizationId,
    refetchInterval: 30_000, // polling replaces Realtime subscription
    staleTime: 15_000,
  });

  // La history API restituisce già le righe nella forma attesa (surface_scan_history).
  const rows: SurfaceScanHistoryRow[] = useMemo(
    () => historyRows as SurfaceScanHistoryRow[],
    [historyRows],
  );

  const error = queryError ? String((queryError as any)?.message || 'Errore caricamento storico') : null;

  // ASC ordering for charts/trendlines (oldest → newest)
  const data = [...rows].reverse();

  const weekly: WeeklyPoint[] = data.map((r, idx) => {
    const prev = idx > 0 ? data[idx - 1] : null;
    const resolved = prev
      ? Math.max(0, (prev.high_cves + prev.medium_cves) - (r.high_cves + r.medium_cves))
      : 0;
    return {
      label: fmt(r.scanned_at),
      scanned_at: r.scanned_at,
      porte_aperte: r.total_assets,
      porte_chiuse: r.safe_count,
      cve_critiche: r.high_cves,
      cve_risolte: resolved,
      epss_score: toEpss(Number(r.avg_score) || 0),
      rischio_alto: r.critical_count,
      rischio_medio: r.warning_count,
      rischio_basso: r.safe_count,
    };
  });

  const latest = rows[0] ?? null;
  const previous = rows[1] ?? null;
  const epssDelta = latest && previous
    ? Math.round((toEpss(Number(latest.avg_score)) - toEpss(Number(previous.avg_score))) * 10) / 10
    : 0;
  const cveResolvedLast = latest && previous
    ? Math.max(0, (previous.high_cves + previous.medium_cves) - (latest.high_cves + latest.medium_cves))
    : 0;
  const newOpenLast = latest && previous
    ? Math.max(0, latest.total_assets - previous.total_assets)
    : 0;

  return {
    rows,
    data,
    weekly,
    latest,
    previous,
    epssDelta,
    cveResolvedLast,
    newOpenLast,
    hasHistory: rows.length > 0,
    isLoading,
    loading: isLoading,
    error,
    refetch,
  } as const;
};
