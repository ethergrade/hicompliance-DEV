import { useQuery } from '@tanstack/react-query';
import { complianceApiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types/api';
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

/**
 * Legge `cve_intel_cache` dal backend.
 *
 * Fino a oggi questi due hook erano segnaposto: chiamavano l'arricchimento
 * HiPatch e ritornavano sempre null, così il dialog CVE restava in eterno su
 * «Arricchimento in coda». Gli endpoint esistevano già: bastava chiamarli.
 *
 * Un CVE assente in cache viene accodato dal backend alla prima richiesta e il
 * job lo lavora entro un minuto: per questo, finché il dato non c'è, si
 * ricontrolla ogni pochi secondi.
 */
const groupHeader = (groupId?: string | null) =>
  groupId ? { headers: { 'X-Group-Id': groupId } } : undefined;

/** Il decimal di Postgres arriva come stringa: i numeri vanno riportati a numeri. */
const normalize = (raw: CveIntel): CveIntel => ({
  ...raw,
  cvss_v3_score: raw.cvss_v3_score == null ? null : Number(raw.cvss_v3_score),
  cvss_v2_score: raw.cvss_v2_score == null ? null : Number(raw.cvss_v2_score),
  epss_score: raw.epss_score == null ? null : Number(raw.epss_score),
  epss_percentile: raw.epss_percentile == null ? null : Number(raw.epss_percentile),
  cwe_ids: raw.cwe_ids ?? [],
  references_json: raw.references_json ?? [],
  cpe_json: raw.cpe_json ?? [],
  exploit_links: raw.exploit_links ?? [],
});

export const useCveIntel = (cveId?: string | null) => {
  const { groupId } = useClientOrganization();
  const id = cveId?.trim().toUpperCase() ?? null;

  return useQuery<CveIntel | null>({
    queryKey: ['cve-intel', id],
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (q) => (q.state.data ? false : 4000),
    queryFn: async () => {
      const res = await complianceApiClient.get<ApiResponse<CveIntel | null>>(
        `/cve-intel/${id}`,
        undefined,
        groupHeader(groupId),
      );
      return res.data ? normalize(res.data) : null;
    },
  });
};

export const useCveIntelBatch = (cveIds: string[]) => {
  const { groupId } = useClientOrganization();
  const sorted = [...new Set(cveIds.map((c) => c.trim().toUpperCase()).filter(Boolean))].sort();

  return useQuery<Record<string, CveIntel>>({
    queryKey: ['cve-intel-batch', sorted],
    enabled: sorted.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await complianceApiClient.get<ApiResponse<CveIntel[]>>(
        '/cve-intel/batch',
        { cve_ids: sorted.join(',') },
        groupHeader(groupId),
      );
      const map: Record<string, CveIntel> = {};
      for (const row of res.data ?? []) {
        map[row.cve_id.toUpperCase()] = normalize(row);
      }
      return map;
    },
  });
};
