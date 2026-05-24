import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';

export type DarkRiskSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type DarkRiskCoverageStatus = 'completed' | 'partial' | 'error' | 'not_run' | 'planned';

export type DarkRiskOverviewResponse = {
  customer_id: string;
  enabled: boolean;
  tier: 'standard' | 'extended';
  latest_scan: {
    id: string;
    status: string;
    profile: string | null;
    type: string | null;
    started_at: string | null;
    completed_at: string | null;
  } | null;
  previous_scan: {
    id: string;
    started_at: string | null;
    completed_at: string | null;
  } | null;
  kpis: {
    active_threats: { value: number; delta: number | null };
    credential_leaks: { value: number; delta: number | null };
    monitored_domains: { value: number; delta: number | null };
    risk_score: { value: number; level: 'Basso' | 'Medio' | 'Alto' | 'Critico'; delta: number | null };
    last_scan: { value: string | null; delta: number | null };
    controls_coverage: { value: number; completed: number; partial: number; total: number };
    critical_findings: { value: number; delta: number | null };
    new_alerts: { value: number; delta: number | null };
    high_priority_findings: { value: number; delta: number | null };
    impacted_identities: { value: number; delta: number | null };
    exposed_services: { value: number; delta: number | null };
  };
  coverage_controls: Array<{
    key: string;
    control: string;
    status: DarkRiskCoverageStatus;
    last_execution: string | null;
    source: string;
  }>;
  threat_groups: Array<{
    category: string;
    count: number;
    severity_max: DarkRiskSeverity;
    description: string;
    trend_delta?: number | null;
  }>;
  recent_alerts: Array<{
    id: string;
    severity: DarkRiskSeverity;
    title: string;
    asset: string | null;
    type: string;
    time: string | null;
    status: string;
    confidence: string;
    source: string;
    finding_id?: string | null;
  }>;
  alert_config: {
    total: number;
    active: number;
  };
};

const emptyData: DarkRiskOverviewResponse = {
  customer_id: '',
  enabled: false,
  tier: 'standard',
  latest_scan: null,
  previous_scan: null,
  kpis: {
    active_threats: { value: 0, delta: null },
    credential_leaks: { value: 0, delta: null },
    monitored_domains: { value: 0, delta: null },
    risk_score: { value: 0, level: 'Basso', delta: null },
    last_scan: { value: null, delta: null },
    controls_coverage: { value: 0, completed: 0, partial: 0, total: 0 },
    critical_findings: { value: 0, delta: null },
    new_alerts: { value: 0, delta: null },
    high_priority_findings: { value: 0, delta: null },
    impacted_identities: { value: 0, delta: null },
    exposed_services: { value: 0, delta: null },
  },
  coverage_controls: [],
  threat_groups: [],
  recent_alerts: [],
  alert_config: {
    total: 0,
    active: 0,
  },
};

export const useDarkRiskOverview = () => {
  const { organizationId } = useClientOrganization();

  const query = useQuery({
    queryKey: ['darkrisk360-overview', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DarkRiskOverviewResponse> => {
      if (!organizationId) {
        return emptyData;
      }

      const { data, error } = await supabase.functions.invoke('darkrisk360-overview', {
        body: { customer_id: organizationId },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(String(data.error));
      }

      return {
        ...emptyData,
        ...(data || {}),
      } as DarkRiskOverviewResponse;
    },
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  return {
    ...query,
    data: query.data || emptyData,
  };
};
