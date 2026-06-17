import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { surfaceScan360Api, type SurfaceScanJob } from '@/lib/api/surface-scan360';
import { useToast } from '@/hooks/use-toast';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUserRoles } from '@/hooks/useUserRoles';

export type SurfaceScanJobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed';
export type SurfaceScanProfile =
  | 'safe_recon'
  | 'domain_exposure'
  | 'ip_exposure'
  | 'cve_api_validation';

const DEFAULT_SCAN_PROFILE: SurfaceScanProfile = 'domain_exposure';

// Re-export for backward compatibility
export type { SurfaceScanJob };

interface StartScanInput {
  target: string;
  scan_profile?: SurfaceScanProfile;
  authorization_confirmed: boolean;
  ownership_proof?: string;
}

interface StartScanQueueInput {
  targets: string[];
  scan_profiles: SurfaceScanProfile[];
  authorization_confirmed: boolean;
  ownership_proof?: string;
}

const mapApiJobToLocal = (job: any): SurfaceScanJob => ({
  id: job.id,
  raw_target: job.raw_target || job.normalized_target || '',
  normalized_target: job.normalized_target || '',
  target_type: job.target_type || 'domain',
  hostname: job.hostname ?? null,
  root_domain: job.root_domain ?? null,
  resolved_ips: job.resolved_ips ?? null,
  scan_profile: job.scan_profile || DEFAULT_SCAN_PROFILE,
  status: (job.status || 'pending') as SurfaceScanJobStatus,
  hosting_context: job.hosting_context ?? null,
  shodan_status: job.shodan_status ?? null,
  created_at: job.created_at || new Date().toISOString(),
  started_at: job.started_at ?? null,
  completed_at: job.completed_at ?? null,
  error_message: job.error_message ?? null,
  summary: job.summary ?? null,
});

const mapScanProfile = (profile?: SurfaceScanProfile): 'standard' | 'full' => {
  if (!profile) return 'standard';
  if (profile === 'cve_api_validation' || profile === 'safe_recon') return 'full';
  return profile === 'domain_exposure' ? 'standard' : 'full';
};

export const useSurfaceScanEngine = () => {
  const { toast } = useToast();
  const { organizationId, isLoading: clientLoading, groupId } = useClientOrganization();
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRoles();
  const qc = useQueryClient();

  const isAdmin = user?.user_type === 'admin' || isSuperAdmin;

  const listQuery = useQuery({
    queryKey: ['surface-scan-engine-jobs', organizationId, groupId],
    queryFn: async () => {
      if (!organizationId) return [] as SurfaceScanJob[];
      const result = await surfaceScan360Api.listJobs(
        organizationId,
        { page: 1 },
        groupId,
      );
      return (result || []).map(mapApiJobToLocal).slice(0, 25);
    },
    enabled: !!organizationId && !clientLoading,
    refetchInterval: 15_000, // polling replaces Realtime — scan engine status tracker
    staleTime: 10_000,
  });

  const jobs = listQuery.data ?? [];
  const loading = listQuery.isLoading;
  const fetchJobs = useCallback(
    async (_options?: { background?: boolean }) => {
      await listQuery.refetch();
    },
    [listQuery],
  );

  const startScanMut = useMutation({
    mutationFn: async (input: StartScanInput) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      if (!isAdmin) throw new Error('Solo gli admin possono avviare scansioni');
      const result = await surfaceScan360Api.createJob(
        organizationId,
        {
          target: input.target,
          scan_profile: mapScanProfile(input.scan_profile),
        },
        groupId,
      );
      return result;
    },
  });

  const startScan = useCallback(
    async (input: StartScanInput): Promise<{ job_id?: string; status?: string }> => {
      if (!organizationId) {
        toast({
          title: 'Cliente non selezionato',
          description: 'Seleziona prima un cliente',
          variant: 'destructive',
        });
        return {};
      }

      if (!isAdmin) {
        toast({
          title: 'Operazione non consentita',
          description: 'Solo gli admin possono avviare scansioni',
          variant: 'destructive',
        });
        return {};
      }

      try {
        const result = await startScanMut.mutateAsync(input);
        toast({
          title: 'Scansione avviata',
          description: `Job ${result?.id || ''} - stato: ${result?.status || 'queued'}`,
        });
        qc.invalidateQueries({ queryKey: ['surface-scan-engine-jobs', organizationId, groupId] });
        return { job_id: result?.id, status: result?.status };
      } catch (error: any) {
        console.error('Error starting surface scan:', error);
        toast({
          title: 'Errore avvio scansione',
          description: error?.message || 'Impossibile avviare la scansione',
          variant: 'destructive',
        });
        return {};
      }
    },
    [organizationId, isAdmin, startScanMut, toast, qc, groupId],
  );

  const startScanQueue = useCallback(
    async (input: StartScanQueueInput): Promise<{ queued: number; failed: number }> => {
      if (!organizationId) {
        toast({
          title: 'Cliente non selezionato',
          description: 'Seleziona prima un cliente',
          variant: 'destructive',
        });
        return { queued: 0, failed: 0 };
      }

      if (!isAdmin) {
        toast({
          title: 'Operazione non consentita',
          description: 'Solo gli admin possono avviare scansioni',
          variant: 'destructive',
        });
        return { queued: 0, failed: 0 };
      }

      const targets = [...new Set(input.targets.map((target) => target.trim()).filter(Boolean))];
      const profiles = [...new Set(input.scan_profiles)];
      const effectiveProfiles = profiles.length > 0 ? profiles : [DEFAULT_SCAN_PROFILE];

      if (targets.length === 0) {
        toast({
          title: 'Dati incompleti',
          description: 'Seleziona almeno un target',
          variant: 'destructive',
        });
        return { queued: 0, failed: 0 };
      }

      const queuePairs: Array<{ target: string; profile: SurfaceScanProfile }> = [];
      for (const target of targets) {
        for (const profile of effectiveProfiles) {
          queuePairs.push({ target, profile });
        }
      }

      const maxQueuePairs = 300;
      const pairsToQueue = queuePairs.slice(0, maxQueuePairs);
      if (queuePairs.length > maxQueuePairs) {
        toast({
          title: 'Coda limitata',
          description: `Accodate le prime ${maxQueuePairs} scansioni per sicurezza`,
        });
      }

      let queued = 0;
      let failed = 0;

      for (const pair of pairsToQueue) {
        try {
          await surfaceScan360Api.createJob(
            organizationId,
            {
              target: pair.target,
              scan_profile: mapScanProfile(pair.profile),
            },
            groupId,
          );
          queued += 1;
        } catch {
          failed += 1;
        }
      }

      if (queued > 0) {
        toast({
          title: 'Coda scansioni creata',
          description: `${queued} job in coda${failed > 0 ? `, ${failed} non avviati` : ''}`,
        });
      } else {
        toast({
          title: 'Nessun job accodato',
          description: 'Controlla autorizzazione, limiti o input target',
          variant: 'destructive',
        });
      }

      qc.invalidateQueries({ queryKey: ['surface-scan-engine-jobs', organizationId, groupId] });
      return { queued, failed };
    },
    [organizationId, isAdmin, toast, qc, groupId],
  );

  const activeJobsCount = useMemo(
    () => jobs.filter((job) => ['pending', 'queued', 'running'].includes(job.status)).length,
    [jobs],
  );

  return {
    jobs,
    loading,
    startingScan: startScanMut.isPending,
    isAdmin,
    activeJobsCount,
    startScan,
    startScanQueue,
    refetch: fetchJobs,
  };
};
