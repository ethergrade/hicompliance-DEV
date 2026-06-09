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

/** Derive roadmap status from the DarkRisk overview response. */
const deriveRoadmapFromOverview = (overview: any, organizationId: string): DarkRiskRoadmapStatus => {
  const raw = overview?.roadmap ?? overview?.metadata?.roadmap ?? overview;
  return {
    ...emptyData,
    customer_id: String(raw?.customer_id || organizationId || '').trim(),
    enabled: Boolean(raw?.enabled ?? true),
    tier: (raw?.tier === 'extended' ? 'extended' : 'standard') as 'standard' | 'extended',
    counters: {
      ...emptyData.counters,
      ...(raw?.counters || {}),
      scan_runs_total: Number(raw?.counters?.scan_runs_total) || 0,
      completed_runs: Number(raw?.counters?.completed_runs) || 0,
      assets: Number(raw?.counters?.assets) || 0,
      selectors: Number(raw?.counters?.selectors) || 0,
      source_records: Number(raw?.counters?.source_records) || 0,
      findings: Number(raw?.counters?.findings) || 0,
      recommendations: Number(raw?.counters?.recommendations) || 0,
      alerts: Number(raw?.counters?.alerts) || 0,
      reports: Number(raw?.counters?.reports) || 0,
      audits: Number(raw?.counters?.audits) || 0,
    },
    summary: {
      progress_percent: Number(raw?.summary?.progress_percent) || 0,
      completed: Number(raw?.summary?.completed) || 0,
      in_progress: Number(raw?.summary?.in_progress) || 0,
      planned: Number(raw?.summary?.planned) || 0,
      blocked: Number(raw?.summary?.blocked) || 0,
    },
    phases: Array.isArray(raw?.phases) ? raw.phases : [],
    generated_at: String(raw?.generated_at || ''),
  };
};

export const useDarkRiskRoadmapStatus = () => {
  const { organizationId, groupId } = useClientOrganization();

  const query = useQuery({
    queryKey: ['darkrisk360-roadmap-status', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DarkRiskRoadmapStatus> => {
      if (!organizationId) return emptyData;

      const overview = await darkRiskApi.getOverview(organizationId, groupId);

      if (!overview) return emptyData;

      return deriveRoadmapFromOverview(overview, organizationId);
    },
    staleTime: 90_000,
    refetchInterval: 120_000,
  });

  return {
    ...query,
    data: query.data || emptyData,
  };
};
