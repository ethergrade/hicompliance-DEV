import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

export interface SurfaceScanJob {
  id: string;
  raw_target: string;
  normalized_target: string;
  target_type: string;
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

export const useSurfaceScanEngine = () => {
  const [jobs, setJobs] = useState<SurfaceScanJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingScan, setStartingScan] = useState(false);

  const { toast } = useToast();
  const { organizationId, isLoading: clientLoading } = useClientOrganization();
  const { userProfile } = useAuth();
  const { isSuperAdmin } = useUserRoles();

  const isAdmin = userProfile?.user_type === 'admin' || isSuperAdmin;

  const fetchJobs = useCallback(async () => {
    if (clientLoading || !organizationId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('surface_scan_jobs' as any)
        .select(
          'id, raw_target, normalized_target, target_type, scan_profile, status, hosting_context, shodan_status, created_at, started_at, completed_at, error_message',
        )
        .eq('customer_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) throw error;
      setJobs((data || []) as SurfaceScanJob[]);
    } catch (error) {
      console.error('Error fetching surface scan jobs:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare lo stato delle scansioni',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clientLoading, organizationId, toast]);

  useEffect(() => {
    if (!clientLoading && organizationId) {
      fetchJobs();
    }
  }, [clientLoading, organizationId, fetchJobs]);

  useEffect(() => {
    if (!organizationId) return;
    const interval = setInterval(() => {
      fetchJobs();
    }, 8000);
    return () => clearInterval(interval);
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
    refetch: fetchJobs,
  };
};
