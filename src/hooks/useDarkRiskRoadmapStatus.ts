import { useQuery } from '@tanstack/react-query';
import { darkRiskApi } from '@/lib/api/darkrisk';
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

/** Map the dedicated roadmap-status endpoint response to DarkRiskRoadmapStatus. */
const mapRoadmapStatusResponse = (data: any, organizationId: string): DarkRiskRoadmapStatus => {
  if (!data) return emptyData;

  return {
    ...emptyData,
    customer_id: String(data?.customer_id || organizationId || '').trim(),
    enabled: Boolean(data?.enabled ?? true),
    tier: (data?.tier === 'extended' ? 'extended' : 'standard') as 'standard' | 'extended',
    counters: {
      ...emptyData.counters,
      ...(data?.counters || {}),
      scan_runs_total: Number(data?.counters?.scan_runs_total) || 0,
      completed_runs: Number(data?.counters?.completed_runs) || 0,
      assets: Number(data?.counters?.assets) || 0,
      selectors: Number(data?.counters?.selectors) || 0,
      source_records: Number(data?.counters?.source_records) || 0,
      findings: Number(data?.counters?.findings) || 0,
      recommendations: Number(data?.counters?.recommendations) || 0,
      alerts: Number(data?.counters?.alerts) || 0,
      reports: Number(data?.counters?.reports) || 0,
      audits: Number(data?.counters?.audits) || 0,
    },
    summary: {
      progress_percent: Number(data?.summary?.progress_percent) || 0,
      completed: Number(data?.summary?.completed) || 0,
      in_progress: Number(data?.summary?.in_progress) || 0,
      planned: Number(data?.summary?.planned) || 0,
      blocked: Number(data?.summary?.blocked) || 0,
    },
    phases: Array.isArray(data?.phases) ? data.phases : [],
    generated_at: String(data?.generated_at || ''),
  };
};

export const useDarkRiskRoadmapStatus = () => {
  const { organizationId, groupId } = useClientOrganization();

  const query = useQuery({
    queryKey: ['darkrisk360-roadmap-status', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DarkRiskRoadmapStatus> => {
      if (!organizationId) return emptyData;

      const data = await darkRiskApi.getRoadmapStatus(organizationId, groupId);

      if (!data) return emptyData;

      return mapRoadmapStatusResponse(data, organizationId);
    },
    staleTime: 90_000,
    refetchInterval: 120_000,
  });

  return {
    ...query,
    data: query.data || emptyData,
  };
};
