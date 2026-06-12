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
};

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
          hipatchApi.cves(organizationId, groupId, date).catch(() => []),
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
        cves,
        epssVulnerabilities: epss,
      };
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

export type { HipatchSummary, HipatchAsset, HipatchOsPatch, HipatchSoftwarePatch, HipatchRemediation, HipatchCve } from '@/lib/api/hipatch';
