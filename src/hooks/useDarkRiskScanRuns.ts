import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { darkRiskApi } from '@/lib/api/darkrisk';
import { useClientOrganization } from './useClientOrganization';

export function useDarkRiskScanRuns() {
  const { organizationId, groupId } = useClientOrganization();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['darkrisk-scan-runs', organizationId, groupId],
    queryFn: () => {
      if (!organizationId) return Promise.resolve([] as any[]);
      return darkRiskApi.listScanRuns(organizationId, { page: 1, per_page: 15 }, groupId);
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: (payload?: { notes?: string }) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      return darkRiskApi.createScanRun(organizationId, payload, groupId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['darkrisk-scan-runs', organizationId, groupId] });
      qc.invalidateQueries({ queryKey: ['darkrisk-overview', organizationId, groupId] });
    },
  });

  return { list, create };
}

export function useDarkRiskScanRun(scanRunId?: string | null) {
  const { organizationId, groupId } = useClientOrganization();

  return useQuery({
    queryKey: ['darkrisk-scan-run', organizationId, scanRunId, groupId],
    queryFn: () => {
      if (!organizationId || !scanRunId) return Promise.resolve(null);
      return darkRiskApi.getScanRun(organizationId, scanRunId, groupId);
    },
    enabled: !!organizationId && !!scanRunId,
    staleTime: 30_000,
  });
}

export function useDarkRiskScanRunFindings(scanRunId?: string | null, severity?: string) {
  const { organizationId, groupId } = useClientOrganization();

  return useQuery({
    queryKey: ['darkrisk-scan-run-findings', organizationId, scanRunId, severity, groupId],
    queryFn: () => {
      if (!organizationId || !scanRunId) return Promise.resolve([] as any[]);
      return darkRiskApi.getScanRunFindings(
        organizationId,
        scanRunId,
        severity ? { severity, page: 1 } : { page: 1 },
        groupId,
      );
    },
    enabled: !!organizationId && !!scanRunId,
    staleTime: 30_000,
  });
}
