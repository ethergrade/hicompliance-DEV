import { useQuery } from '@tanstack/react-query';
import { hipatchApi } from '@/lib/api/hipatch';
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
  const { organizationId, groupId } = useClientOrganization();

  return useQuery<CveIntel | null>({
    queryKey: ['cve-intel', cveId],
    enabled: !!cveId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (q) => (q.state.data ? false : 4000),
    queryFn: async () => {
      // TODO: migrate to backend API
      if (organizationId) {
        await hipatchApi.enrichCves(organizationId, groupId).catch(() => {});
      }
      return null as CveIntel | null;
    },
  });
};

export const useCveIntelBatch = (cveIds: string[]) => {
  const { organizationId, groupId } = useClientOrganization();
  const sorted = [...new Set(cveIds.map((c) => c.toUpperCase()))].sort();
  return useQuery<Record<string, CveIntel>>({
    queryKey: ['cve-intel-batch', sorted],
    enabled: sorted.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      // TODO: migrate to backend API
      const missing = sorted;
      if (missing.length > 0 && organizationId) {
        await hipatchApi.enrichCves(organizationId, groupId).catch(() => {});
      }
      return {} as Record<string, CveIntel>;
    },
  });
};
