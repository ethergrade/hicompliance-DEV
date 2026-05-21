import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';

export interface SurfaceScanSnapshot {
  id: string;
  organization_id: string;
  scanned_at: string;
  total_assets: number;
  critical_count: number;
  warning_count: number;
  safe_count: number;
  avg_score: number;
  high_cves: number;
  medium_cves: number;
  low_cves: number;
  truncated_rules: string[];
  assets_snapshot: any[];
  triggered_by: string;
}

export const useSurfaceScanHistory = (limit = 12) => {
  const { organizationId } = useClientOrganization();
  return useQuery<SurfaceScanSnapshot[]>({
    queryKey: ['surface-scan-history', organizationId, limit],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surface_scan_history' as any)
        .select('*')
        .eq('organization_id', organizationId!)
        .order('scanned_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as unknown as SurfaceScanSnapshot[]).reverse();
    },
  });
};

export const triggerManualSurfaceScan = async (organizationId: string) => {
  const { data, error } = await supabase.functions.invoke('surface-scan-cron', {
    body: { organization_id: organizationId, triggered_by: 'manual' },
  });
  if (error) throw error;
  return data;
};
