import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';

export type DarkRiskRoadmapPhaseStatus = 'completed' | 'in_progress' | 'planned' | 'blocked';

export interface DarkRiskRoadmapStatus {
  customer_id: string;
  enabled: boolean;
  tier: 'standard' | 'extended';
  counters: {
    scan_runs_total: number;
    completed_runs: number;
    assets: number;
    selectors: number;
    source_records: number;
    findings: number;
    recommendations: number;
    alerts: number;
    reports: number;
    audits: number;
  };
  summary: {
    progress_percent: number;
    completed: number;
    in_progress: number;
    planned: number;
    blocked: number;
  };
  phases: Array<{
    phase: number;
    key: string;
    title: string;
    status: DarkRiskRoadmapPhaseStatus;
    score: number;
    evidence: string;
  }>;
  generated_at: string;
}

const emptyData: DarkRiskRoadmapStatus = {
  customer_id: '',
  enabled: false,
  tier: 'standard',
  counters: {
    scan_runs_total: 0,
    completed_runs: 0,
    assets: 0,
    selectors: 0,
    source_records: 0,
    findings: 0,
    recommendations: 0,
    alerts: 0,
    reports: 0,
    audits: 0,
  },
  summary: {
    progress_percent: 0,
    completed: 0,
    in_progress: 0,
    planned: 0,
    blocked: 0,
  },
  phases: [],
  generated_at: '',
};

export const useDarkRiskRoadmapStatus = () => {
  const { organizationId } = useClientOrganization();

  const query = useQuery({
    queryKey: ['darkrisk360-roadmap-status', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DarkRiskRoadmapStatus> => {
      if (!organizationId) return emptyData;

      const { data, error } = await supabase.functions.invoke('darkrisk360-roadmap-status', {
        body: { customer_id: organizationId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      return {
        ...emptyData,
        ...(data || {}),
      } as DarkRiskRoadmapStatus;
    },
    staleTime: 90_000,
    refetchInterval: 120_000,
  });

  return {
    ...query,
    data: query.data || emptyData,
  };
};
