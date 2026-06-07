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
    data_scan_id?: string | null;
    data_scan_status?: string | null;
    data_scan_at?: string | null;
    using_last_good_fallback?: boolean;
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
  dti: {
    privileged_sensitive_view: boolean;
    source_runs: {
      completed: number;
      partial: number;
      failed: number;
      skipped: number;
      total: number;
    };
    failed_source_run_logs: Array<{
      id: string;
      source: string;
      source_key: string;
      query_kind: string;
      query_term: string;
      selector_value: string;
      asset_scope: string;
      status: string;
      result_count: number;
      warning: string;
      error_message: string;
      completed_at: string | null;
    }>;
    query_coverage: {
      at_domain_tld: number;
      selector: number;
      email_selector: number;
    };
    sensitive_totals: {
      domains: number;
      passwords: number;
      addresses: number;
      credit_cards: number;
      phone_numbers: number;
      total: number;
    };
    sensitive_by_asset: Array<{
      asset_scope: string;
      domains: number;
      passwords: number;
      addresses: number;
      credit_cards: number;
      phone_numbers: number;
      total: number;
    }>;
    sensitive_samples: Array<{
      id?: string;
      source_run_id?: string;
      source_record_id?: string;
      finding_id?: string;
      source: string;
      query_kind: string;
      query_term: string;
      asset_scope: string;
      tag: string;
      value: string;
      masked_value: string;
      match_policy?: string;
      extraction_confidence?: string;
      evidence_scope?: string;
      created_at: string | null;
    }>;
    intelx_stats?: {
      email_queries_run?: number;
      strict_password_hits?: number;
      metadata_only_hits?: number;
    };
    latest_scan_run_id: string | null;
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
  dti: {
    privileged_sensitive_view: false,
    source_runs: {
      completed: 0,
      partial: 0,
      failed: 0,
      skipped: 0,
      total: 0,
    },
    failed_source_run_logs: [],
    query_coverage: {
      at_domain_tld: 0,
      selector: 0,
      email_selector: 0,
    },
    sensitive_totals: {
      domains: 0,
      passwords: 0,
      addresses: 0,
      credit_cards: 0,
      phone_numbers: 0,
      total: 0,
    },
    sensitive_by_asset: [],
    sensitive_samples: [],
    intelx_stats: {
      email_queries_run: 0,
      strict_password_hits: 0,
      metadata_only_hits: 0,
    },
    latest_scan_run_id: null,
  },
};

const normalizeOverviewPayload = (data: any): DarkRiskOverviewResponse => {
  const payload = data && typeof data === 'object' ? data : {};
  const payloadDti = payload.dti && typeof payload.dti === 'object' ? payload.dti : {};
  const payloadSourceRuns =
    payloadDti.source_runs && typeof payloadDti.source_runs === 'object'
      ? payloadDti.source_runs
      : {};
  const payloadQueryCoverage =
    payloadDti.query_coverage && typeof payloadDti.query_coverage === 'object'
      ? payloadDti.query_coverage
      : {};
  const payloadSensitiveTotals =
    payloadDti.sensitive_totals && typeof payloadDti.sensitive_totals === 'object'
      ? payloadDti.sensitive_totals
      : {};
  const payloadIntelxStats =
    payloadDti.intelx_stats && typeof payloadDti.intelx_stats === 'object'
      ? payloadDti.intelx_stats
      : {};
  const payloadKpis = payload.kpis && typeof payload.kpis === 'object' ? payload.kpis : {};

  return {
    ...emptyData,
    ...payload,
    kpis: {
      ...emptyData.kpis,
      ...payloadKpis,
    },
    dti: {
      ...emptyData.dti,
      ...payloadDti,
      source_runs: {
        ...emptyData.dti.source_runs,
        ...payloadSourceRuns,
      },
      query_coverage: {
        ...emptyData.dti.query_coverage,
        ...payloadQueryCoverage,
      },
      sensitive_totals: {
        ...emptyData.dti.sensitive_totals,
        ...payloadSensitiveTotals,
      },
      intelx_stats: {
        ...emptyData.dti.intelx_stats,
        ...payloadIntelxStats,
      },
      sensitive_by_asset: Array.isArray(payloadDti.sensitive_by_asset)
        ? payloadDti.sensitive_by_asset
        : [],
      sensitive_samples: Array.isArray(payloadDti.sensitive_samples)
        ? payloadDti.sensitive_samples
        : [],
      failed_source_run_logs: Array.isArray(payloadDti.failed_source_run_logs)
        ? payloadDti.failed_source_run_logs
        : [],
      latest_scan_run_id: payloadDti.latest_scan_run_id || null,
    },
  } as DarkRiskOverviewResponse;
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

      return normalizeOverviewPayload(data || {});
    },
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  return {
    ...query,
    data: query.data || emptyData,
  };
};
