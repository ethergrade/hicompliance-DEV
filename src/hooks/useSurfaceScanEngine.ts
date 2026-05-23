import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUserRoles } from '@/hooks/useUserRoles';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type SurfaceScanJobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed';
export type SurfaceScanProfile =
  | 'safe_recon'
  | 'domain_exposure'
  | 'ip_exposure'
  | 'cve_api_validation';

export interface SurfaceScanJob {
  id: string;
  raw_target: string;
  normalized_target: string;
  target_type: string;
  hostname: string | null;
  root_domain: string | null;
  resolved_ips: string[] | null;
  scan_profile: SurfaceScanProfile;
  status: SurfaceScanJobStatus;
  hosting_context: string | null;
  shodan_status: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

interface StartScanInput {
  target: string;
  scan_profile: SurfaceScanProfile;
  authorization_confirmed: boolean;
  ownership_proof?: string;
}

interface StartScanQueueInput {
  targets: string[];
  scan_profiles: SurfaceScanProfile[];
  authorization_confirmed: boolean;
  ownership_proof?: string;
}

export const useSurfaceScanEngine = () => {
  const [jobs, setJobs] = useState<SurfaceScanJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingScan, setStartingScan] = useState(false);

  const { toast } = useToast();
  const { organizationId, isLoading: clientLoading } = useClientOrganization();
  const { userProfile } = useAuth();
  const { isSuperAdmin } = useUserRoles();

  const isAdmin = userProfile?.user_type === 'admin' || isSuperAdmin;

  const fetchJobs = useCallback(async (options?: { background?: boolean }) => {
    if (clientLoading || !organizationId) return;

    const background = Boolean(options?.background);
    if (!background) {
      setLoading(true);
    }
    try {
      const { data, error } = await supabase
        .from('surface_scan_jobs' as any)
        .select(
          'id, raw_target, normalized_target, target_type, hostname, root_domain, resolved_ips, scan_profile, status, hosting_context, shodan_status, created_at, started_at, completed_at, error_message',
        )
        .eq('customer_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) throw error;
      setJobs((data || []) as SurfaceScanJob[]);
    } catch (error) {
      console.error('Error fetching surface scan jobs:', error);
      if (!background) {
        toast({
          title: 'Errore',
          description: 'Impossibile caricare lo stato delle scansioni',
          variant: 'destructive',
        });
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [clientLoading, organizationId, toast]);

  useEffect(() => {
    if (!clientLoading && organizationId) {
      fetchJobs();
    }
  }, [clientLoading, organizationId, fetchJobs]);

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel(`surface-scan-jobs-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'surface_scan_jobs',
          filter: `customer_id=eq.${organizationId}`,
        },
        (_payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
          void fetchJobs({ background: true });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, fetchJobs]);

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
          description: 'Solo gli admin possono avviare scansioni in v1',
          variant: 'destructive',
        });
        return {};
      }

      setStartingScan(true);
      try {
        const { data, error } = await supabase.functions.invoke('surfacescan360-start-scan', {
          body: {
            target: input.target,
            customer_id: organizationId,
            scan_profile: input.scan_profile,
            authorization_confirmed: input.authorization_confirmed,
            ownership_proof: input.ownership_proof || null,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast({
          title: 'Scansione avviata',
          description: `Job ${data?.job_id || ''} - stato: ${data?.status || 'queued'}`,
        });
        await fetchJobs();
        return data || {};
      } catch (error: any) {
        console.error('Error starting surface scan:', error);
        toast({
          title: 'Errore avvio scansione',
          description: error?.message || 'Impossibile avviare la scansione',
          variant: 'destructive',
        });
        return {};
      } finally {
        setStartingScan(false);
      }
    },
    [organizationId, isAdmin, fetchJobs, toast],
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
          description: 'Solo gli admin possono avviare scansioni in v1',
          variant: 'destructive',
        });
        return { queued: 0, failed: 0 };
      }

      const targets = [...new Set(input.targets.map((target) => target.trim()).filter(Boolean))];
      const profiles = [...new Set(input.scan_profiles)];

      if (targets.length === 0 || profiles.length === 0) {
        toast({
          title: 'Dati incompleti',
          description: 'Seleziona almeno un target e un profilo',
          variant: 'destructive',
        });
        return { queued: 0, failed: 0 };
      }

      const queuePairs: Array<{ target: string; profile: SurfaceScanProfile }> = [];
      for (const target of targets) {
        for (const profile of profiles) {
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

      setStartingScan(true);
      let queued = 0;
      let failed = 0;

      try {
        for (const pair of pairsToQueue) {
          const { data, error } = await supabase.functions.invoke('surfacescan360-start-scan', {
            body: {
              target: pair.target,
              customer_id: organizationId,
              scan_profile: pair.profile,
              authorization_confirmed: input.authorization_confirmed,
              ownership_proof: input.ownership_proof || null,
            },
          });

          if (error || data?.error) {
            failed += 1;
            continue;
          }

          queued += 1;
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
      } catch (error: any) {
        console.error('Error queueing surface scans:', error);
        toast({
          title: 'Errore coda scansioni',
          description: error?.message || 'Impossibile creare la coda',
          variant: 'destructive',
        });
      } finally {
        setStartingScan(false);
        await fetchJobs();
      }

      return { queued, failed };
    },
    [organizationId, isAdmin, fetchJobs, toast],
  );

  const activeJobsCount = useMemo(
    () => jobs.filter((job) => ['pending', 'queued', 'running'].includes(job.status)).length,
    [jobs],
  );

  return {
    jobs,
    loading,
    startingScan,
    isAdmin,
    activeJobsCount,
    startScan,
    startScanQueue,
    refetch: fetchJobs,
  };
};
