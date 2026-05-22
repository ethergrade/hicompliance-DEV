import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';

export interface CveIntel {
  cve_id: string;
  description: string | null;
  cvss_v3_score: number | null;
  cvss_v3_vector: string | null;
  cvss_v3_severity: string | null;
  cvss_v2_score: number | null;
  cvss_v2_vector: string | null;
  cwe_ids: string[];
  references_json: Array<{ url: string; tags?: string[]; source?: string }>;
  cpe_json: Array<{ criteria: string; vulnerable?: boolean }>;
  exploit_links: Array<{ url: string; tags?: string[]; source?: string }>;
  epss_score: number | null;
  epss_percentile: number | null;
  cisa_kev: boolean;
  kev_date_added: string | null;
  kev_due_date: string | null;
  kev_required_action: string | null;
  published_at: string | null;
  last_modified_at: string | null;
  fetch_status: string | null;
  refreshed_at: string;
}

export const useCveIntel = (cveId?: string | null) => {
  const { organizationId } = useClientOrganization();

  return useQuery<CveIntel | null>({
    queryKey: ['cve-intel', cveId],
    enabled: !!cveId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (q) => (q.state.data ? false : 4000),
    queryFn: async () => {
      const id = String(cveId).toUpperCase();
      const { data, error } = await supabase
        .from('cve_intel_cache' as never)
        .select('*').eq('cve_id', id).maybeSingle();
      if (error) throw error;
      if (!data) {
        if (organizationId) {
          await supabase.rpc('enqueue_cve_enrichment', {
            _cves: [id],
            _org_id: organizationId,
            _source: 'ui_cve_modal',
          }).catch(() => {});
        }
        await supabase.functions.invoke('cve-enrichment', { body: {} }).catch(() => {});
      }
      return (data ?? null) as unknown as CveIntel | null;
    },
  });
};

export const useCveIntelBatch = (cveIds: string[]) => {
  const sorted = [...new Set(cveIds.map((c) => c.toUpperCase()))].sort();
  return useQuery<Record<string, CveIntel>>({
    queryKey: ['cve-intel-batch', sorted],
    enabled: sorted.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cve_intel_cache' as never)
        .select('*').in('cve_id', sorted);
      if (error) throw error;
      const map: Record<string, CveIntel> = {};
      for (const row of (data ?? []) as unknown as CveIntel[]) map[row.cve_id] = row;
      return map;
    },
  });
};
