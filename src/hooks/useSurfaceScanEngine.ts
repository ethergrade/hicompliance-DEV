import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';

export interface SurfaceScanEngineJob {
  id: string;
  organization_id: string;
  raw_target: string;
  normalized_target: string;
  target_type: string;
  hostname: string | null;
  root_domain: string | null;
  scan_profile: string;
  status: string;
  hosting_context: string;
  shodan_status: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface SurfaceObservation {
  id: string;
  scan_job_id: string;
  module: string;
  observation_type: string;
  title: string | null;
  value: any;
  severity: string;
  confidence: string;
  created_at: string;
}

export interface SurfaceFinding {
  id: string;
  scan_job_id: string;
  module: string | null;
  finding_type: string;
  title: string;
  description: string | null;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  affected_asset: string | null;
  affected_url: string | null;
  remediation: string | null;
  evidence: any;
  attribution_confidence: string;
  status: string;
  created_at: string;
}

export const useSurfaceEngineJobs = () => {
  const { organizationId } = useClientOrganization();
  return useQuery<SurfaceScanEngineJob[]>({
    queryKey: ['surface-engine-jobs', organizationId],
    enabled: !!organizationId,
    refetchInterval: (q) => {
      const data = q.state.data as SurfaceScanEngineJob[] | undefined;
      return data?.some((j) => ['queued', 'running'].includes(j.status)) ? 5000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surface_scan_jobs' as any)
        .select('*').eq('organization_id', organizationId!)
        .order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as SurfaceScanEngineJob[];
    },
  });
};

export const useSurfaceObservations = (jobId?: string) => {
  const { organizationId } = useClientOrganization();
  return useQuery<SurfaceObservation[]>({
    queryKey: ['surface-observations', organizationId, jobId],
    enabled: !!organizationId && !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surface_observations' as any)
        .select('*').eq('organization_id', organizationId!).eq('scan_job_id', jobId!)
        .order('module');
      if (error) throw error;
      return (data ?? []) as unknown as SurfaceObservation[];
    },
  });
};

export const useSurfaceEngineFindings = (jobId?: string) => {
  const { organizationId } = useClientOrganization();
  return useQuery<SurfaceFinding[]>({
    queryKey: ['surface-engine-findings', organizationId, jobId],
    enabled: !!organizationId && !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surface_findings' as any)
        .select('*').eq('organization_id', organizationId!).eq('scan_job_id', jobId!)
        .order('severity');
      if (error) throw error;
      return (data ?? []) as unknown as SurfaceFinding[];
    },
  });
};

export interface SurfaceExternalIntel {
  id: string;
  scan_job_id: string;
  provider: 'shodan' | 'urlscan' | 'hosting_context' | string;
  target: string;
  found: boolean;
  summary: any;
  raw_response: any;
  confidence: string;
  created_at: string;
}

export const useSurfaceExternalIntel = (jobId?: string) => {
  const { organizationId } = useClientOrganization();
  return useQuery<SurfaceExternalIntel[]>({
    queryKey: ['surface-external-intel', organizationId, jobId],
    enabled: !!organizationId && !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surface_external_intel' as any)
        .select('*').eq('organization_id', organizationId!).eq('scan_job_id', jobId!)
        .order('provider');
      if (error) throw error;
      return (data ?? []) as unknown as SurfaceExternalIntel[];
    },
  });
};

export const useStartSurfaceScan = () => {
  const { organizationId } = useClientOrganization();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { target: string }) => {
      const { data, error } = await supabase.functions.invoke('surfacescan360-start-scan', {
        body: {
          organization_id: organizationId,
          target: input.target,
          scan_profile: 'safe_recon',
          authorization_confirmed: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surface-engine-jobs'] }),
  });
};
