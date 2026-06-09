import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nucleiScan360Api } from '@/lib/api/nuclei-scan360';
import { useClientOrganization } from './useClientOrganization';

export function useNucleiScan360Jobs() {
  const { organizationId, groupId } = useClientOrganization();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['nuclei-scan360-jobs', organizationId, groupId],
    queryFn: () => {
      if (!organizationId) return Promise.resolve([] as any[]);
      return nucleiScan360Api.listJobs(organizationId, { page: 1 }, groupId);
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: (payload: {
      target: string;
      profile?: 'baseline_headers' | 'exposure_medium' | 'web_vuln_safe' | 'web_vuln_authorized';
      template_tags?: string[];
      severity_filter?: string[];
    }) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      return nucleiScan360Api.createJob(organizationId, {
        target_url: payload.target,
        profile: payload.profile ?? 'web_vuln_safe',
        template_tags: payload.template_tags,
        severity_filter: payload.severity_filter,
      }, groupId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nuclei-scan360-jobs', organizationId, groupId] });
    },
  });

  return { list, create };
}

export function useNucleiScan360Job(jobId?: string | null) {
  const { organizationId, groupId } = useClientOrganization();

  return useQuery({
    queryKey: ['nuclei-scan360-job', organizationId, jobId, groupId],
    queryFn: () => {
      if (!organizationId || !jobId) return Promise.resolve(null);
      return nucleiScan360Api.getJob(organizationId, jobId, groupId);
    },
    enabled: !!organizationId && !!jobId,
    staleTime: 30_000,
  });
}

export function useNucleiScan360JobFindings(jobId?: string | null, severity?: string) {
  const { organizationId, groupId } = useClientOrganization();

  return useQuery({
    queryKey: ['nuclei-scan360-job-findings', organizationId, jobId, severity, groupId],
    queryFn: () => {
      if (!organizationId || !jobId) return Promise.resolve([] as any[]);
      return nucleiScan360Api.getJobFindings(
        organizationId,
        jobId,
        { severity, page: 1 },
        groupId,
      );
    },
    enabled: !!organizationId && !!jobId,
    staleTime: 30_000,
  });
}
