import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { darkRiskApi } from '@/lib/api/darkrisk';
import { useClientOrganization } from './useClientOrganization';

export function useDarkRiskReportSnapshots() {
  const { organizationId, groupId } = useClientOrganization();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['darkrisk-report-snapshots', organizationId, groupId],
    queryFn: () => {
      if (!organizationId) return Promise.resolve([] as any[]);
      return darkRiskApi.listReportSnapshots(organizationId, { page: 1, per_page: 20 }, groupId);
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: (scanRunId: string) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      return darkRiskApi.createReportSnapshot(organizationId, { scan_run_id: scanRunId }, groupId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['darkrisk-report-snapshots', organizationId, groupId] });
    },
  });

  return { list, create };
}

export function useDarkRiskReportSnapshot(snapshotId?: string | null) {
  const { organizationId, groupId } = useClientOrganization();

  return useQuery({
    queryKey: ['darkrisk-report-snapshot', organizationId, snapshotId, groupId],
    queryFn: () => {
      if (!organizationId || !snapshotId) return Promise.resolve(null);
      return darkRiskApi.getReportSnapshot(organizationId, snapshotId, groupId);
    },
    enabled: !!organizationId && !!snapshotId,
    staleTime: 60_000,
  });
}
