import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { surfaceScan360Api } from '@/lib/api/surface-scan360';
import { useClientOrganization } from './useClientOrganization';

export function useSurfaceScan360Jobs() {
  const { organizationId, groupId } = useClientOrganization();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['surface-scan360-jobs', organizationId, groupId],
    queryFn: () => {
      if (!organizationId) return Promise.resolve([] as any[]);
      return surfaceScan360Api.listJobs(organizationId, { page: 1 }, groupId);
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: (payload: { target: string; scan_profile?: 'standard' | 'full' }) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      return surfaceScan360Api.createJob(organizationId, payload, groupId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['surface-scan360-jobs', organizationId, groupId] });
    },
  });

  return { list, create };
}

export function useSurfaceScan360Job(jobId?: string | null) {
  const { organizationId, groupId } = useClientOrganization();

  return useQuery({
    queryKey: ['surface-scan360-job', organizationId, jobId, groupId],
    queryFn: () => {
      if (!organizationId || !jobId) return Promise.resolve(null);
      return surfaceScan360Api.getJob(organizationId, jobId, groupId);
    },
    enabled: !!organizationId && !!jobId,
    staleTime: 30_000,
  });
}

export function useSurfaceScan360JobFindings(jobId?: string | null, severity?: string, module?: string) {
  const { organizationId, groupId } = useClientOrganization();

  return useQuery({
    queryKey: ['surface-scan360-job-findings', organizationId, jobId, severity, module, groupId],
    queryFn: () => {
      if (!organizationId || !jobId) return Promise.resolve([] as any[]);
      return surfaceScan360Api.getJobFindings(
        organizationId,
        jobId,
        { severity, module, page: 1 },
        groupId,
      );
    },
    enabled: !!organizationId && !!jobId,
    staleTime: 30_000,
  });
}

export function useSurfaceScan360AiReports() {
  const { organizationId, groupId } = useClientOrganization();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['surface-scan360-ai-reports', organizationId, groupId],
    queryFn: () => {
      if (!organizationId) return Promise.resolve([] as any[]);
      return surfaceScan360Api.listAiReports(organizationId, { page: 1 }, groupId);
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: (payload?: {
      job_id?: string;
      scope_mode?: 'organization_scope' | 'single_job';
      force_regenerate?: boolean;
    }) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      return surfaceScan360Api.createAiReport(
        organizationId,
        {
          scope_mode: 'organization_scope',
          trigger_source: 'manual',
          ...payload,
        },
        groupId,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['surface-scan360-ai-reports', organizationId, groupId] });
    },
  });

  return { list, create };
}

export function useSurfaceScan360AiReport(reportId?: string | null) {
  const { organizationId, groupId } = useClientOrganization();

  return useQuery({
    queryKey: ['surface-scan360-ai-report', organizationId, reportId, groupId],
    queryFn: () => {
      if (!organizationId || !reportId) return Promise.resolve(null);
      return surfaceScan360Api.getAiReport(organizationId, reportId, groupId);
    },
    enabled: !!organizationId && !!reportId,
    staleTime: 60_000,
  });
}
