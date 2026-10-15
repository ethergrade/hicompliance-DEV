import { useQuery } from '@tanstack/react-query';
import { hipatchApi } from '@/lib/api/hipatch';
import type { HipatchSummary, HipatchAsset, HipatchOsPatch, HipatchSoftwarePatch, HipatchRemediation, HipatchCve } from '@/lib/api/hipatch';
import { useClientOrganization } from './useClientOrganization';

export interface HipatchDashboardData {
  summary: HipatchSummary | null;
  assets: HipatchAsset[];
  osPatchesPending: HipatchOsPatch[];
  osPatchesInstalled: HipatchOsPatch[];
  softwarePatchesPending: HipatchSoftwarePatch[];
  softwarePatchesInstalled: HipatchSoftwarePatch[];
  remediations: HipatchRemediation[];
  cves: HipatchCve[];
  epssVulnerabilities: HipatchCve[];
  /** La chiamata delle CVE è fallita: non è "nessuna CVE". */
  cvesFailed: boolean;
}

const emptyData: HipatchDashboardData = {
  summary: null,
  assets: [],
  osPatchesPending: [],
  osPatchesInstalled: [],
  softwarePatchesPending: [],
  softwarePatchesInstalled: [],
  remediations: [],
  cves: [],
  epssVulnerabilities: [],
  cvesFailed: false,
};

/**
 * Il backend manda per ogni CVE solo gli id degli asset (con le righe intere,
 * su un cliente grande la risposta superava la memoria del server): gli asset
 * si ricollegano qui dall'elenco asset, che si scarica comunque.
 */
function withAssets(cves: HipatchCve[], assets: HipatchAsset[]): HipatchCve[] {
  const byId = new Map(assets.map((a) => [String(a['data.id'] ?? ''), a]));
  return cves.map((c) => (c.asset_ids
    ? {
        ...c,
        assets: c.asset_ids
          .map((id) => byId.get(String(id)))
          .filter((a): a is HipatchAsset => !!a) as HipatchCve['assets'],
      }
    : c));
}

export function useHipatchDashboard(date?: string) {
  const { organizationId, groupId } = useClientOrganization();

  return useQuery<HipatchDashboardData>({
    queryKey: ['hipatch-dashboard', organizationId, groupId, date],
    queryFn: async () => {
      if (!organizationId) return emptyData;

      const [summary, assets, osPending, osInstalled, swPending, swInstalled, remediations, cves, epss] =
        await Promise.all([
          hipatchApi.summary(organizationId, groupId, date).catch(() => null),
          hipatchApi.assets(organizationId, groupId, date).catch(() => []),
          hipatchApi.osPatchesPending(organizationId, groupId, date).catch(() => []),
          hipatchApi.osPatchesInstalled(organizationId, groupId, date).catch(() => []),
          hipatchApi.softwarePatchesPending(organizationId, groupId, date).catch(() => []),
          hipatchApi.softwarePatchesInstalled(organizationId, groupId, date).catch(() => []),
          hipatchApi.remediations(organizationId, groupId, date).catch(() => []),
          hipatchApi.cves(organizationId, groupId, date).catch(() => null),
          hipatchApi.epssVulnerabilities(organizationId, groupId, date).catch(() => []),
        ]);

      return {
        summary,
        assets,
        osPatchesPending: osPending,
        osPatchesInstalled: osInstalled,
        softwarePatchesPending: swPending,
        softwarePatchesInstalled: swInstalled,
        remediations,
        cves: withAssets(cves ?? [], assets),
        epssVulnerabilities: withAssets(epss, assets),
        cvesFailed: cves === null,
      };
    },
    enabled: !!organizationId,
    staleTime: 0,
    gcTime: 0,
  });
}

export type { HipatchSummary, HipatchAsset, HipatchOsPatch, HipatchSoftwarePatch, HipatchRemediation, HipatchCve } from '@/lib/api/hipatch';
