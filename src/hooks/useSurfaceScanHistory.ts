import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';

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

export async function triggerManualSurfaceScan(organizationId: string) {
  const { data, error } = await supabase.functions.invoke('surface-scan-cron', {
    body: { organization_id: organizationId, triggered_by: 'manual' },
  });
  if (error) throw error;
  return data as any;
}

export const useSurfaceScanHistory = (limit: number = 12) => {
  const { organizationId, isLoading: orgLoading } = useClientOrganization();
  const [rows, setRows] = useState<SurfaceScanHistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (orgLoading || !organizationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from('surface_scan_history')
        .select('id, scanned_at, total_assets, critical_count, warning_count, safe_count, avg_score, high_cves, medium_cves, low_cves, triggered_by')
        .eq('organization_id', organizationId)
        .order('scanned_at', { ascending: false })
        .limit(limit);
      if (qErr) throw qErr;
      setRows((data ?? []) as SurfaceScanHistoryRow[]);
    } catch (e: any) {
      setError(e?.message ?? 'Errore caricamento storico');
    } finally {
      setIsLoading(false);
    }
  }, [orgLoading, organizationId, limit]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    if (!organizationId) return;
    const ch = supabase
      .channel(`surface-scan-history-${organizationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'surface_scan_history',
        filter: `organization_id=eq.${organizationId}`,
      }, () => fetchHistory())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [organizationId, fetchHistory]);

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
    refetch: fetchHistory,
  };
};
