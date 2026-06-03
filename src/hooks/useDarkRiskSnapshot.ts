import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';

export interface DarkRiskWeeklySnapshot {
  id: string;
  organization_id: string;
  scan_run_id: string | null;
  week_key: string;
  week_start_date: string;
  tier: string;
  total_records: number;
  new_records_this_week: number;
  risk_index: number;
  results_by_source: Record<string, number>;
  results_by_filetype: Record<string, number>;
  results_by_day: Record<string, number>;
  delta_vs_prev: {
    total_records?: number;
    risk_index?: number;
    new_buckets?: string[];
    severity_delta?: Record<string, number>;
  };
  severity_distribution: Record<string, number>;
  computed_at: string;
  created_at: string;
}

export function useDarkRiskSnapshot() {
  const { organizationId } = useClientOrganization();

  const latestQuery = useQuery({
    queryKey: ['darkrisk360-snapshot-latest', organizationId],
    enabled: Boolean(organizationId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await (supabase as any)
        .from('darkrisk360_weekly_snapshots')
        .select('*')
        .eq('organization_id', organizationId)
        .order('week_start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as DarkRiskWeeklySnapshot) ?? null;
    },
  });

  const historyQuery = useQuery({
    queryKey: ['darkrisk360-snapshot-history', organizationId],
    enabled: Boolean(organizationId),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await (supabase as any)
        .from('darkrisk360_weekly_snapshots')
        .select('week_key, week_start_date, total_records, new_records_this_week, risk_index, delta_vs_prev')
        .eq('organization_id', organizationId)
        .order('week_start_date', { ascending: false })
        .limit(52);
      if (error) throw error;
      return (data as DarkRiskWeeklySnapshot[]) ?? [];
    },
  });

  return {
    snapshot: latestQuery.data ?? null,
    history: historyQuery.data ?? [],
    isLoading: latestQuery.isLoading || historyQuery.isLoading,
    error: latestQuery.error || historyQuery.error,
    refetch: () => {
      latestQuery.refetch();
      historyQuery.refetch();
    },
  };
}
