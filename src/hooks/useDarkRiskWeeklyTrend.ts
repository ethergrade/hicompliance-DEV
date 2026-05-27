import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';

type ScanRunRow = {
  id: string;
  status: string;
  trigger_type: string | null;
  created_at: string;
  completed_at: string | null;
};

type FindingRow = {
  scan_run_id: string | null;
  severity: string | null;
  risk_score: number | null;
  finding_type: string | null;
};

export type DarkRiskWeeklyTrendPoint = {
  week_key: string;
  week_label: string;
  scans: number;
  findings_total: number;
  high_critical: number;
  medium: number;
  low_info: number;
  risk_score_avg: number;
  dti_signals: number;
};

const emptyData: DarkRiskWeeklyTrendPoint[] = [];

const weekStartUtcKey = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'n/a';
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
};

const weekLabelFromKey = (key: string): string => {
  const date = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
};

export const useDarkRiskWeeklyTrend = (weeks: number = 12) => {
  const { organizationId } = useClientOrganization();

  const query = useQuery({
    queryKey: ['darkrisk360-weekly-trend', organizationId, weeks],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DarkRiskWeeklyTrendPoint[]> => {
      if (!organizationId) return emptyData;

      const { data: runsData, error: runsError } = await supabase
        .from('darkrisk_scan_runs' as any)
        .select('id, status, trigger_type, created_at, completed_at')
        .eq('organization_id', organizationId)
        .in('status', ['completed', 'completed_with_warnings', 'failed'])
        .order('created_at', { ascending: false })
        .limit(Math.max(weeks * 8, 40));

      if (runsError) throw runsError;
      const runs = (runsData || []) as ScanRunRow[];
      if (runs.length === 0) return emptyData;

      const runIds = runs.map((run) => String(run.id)).filter(Boolean);
      const { data: findingsData, error: findingsError } = await supabase
        .from('darkrisk_findings' as any)
        .select('scan_run_id, severity, risk_score, finding_type')
        .in('scan_run_id', runIds)
        .limit(6000);

      if (findingsError) throw findingsError;
      const findings = (findingsData || []) as FindingRow[];

      const findingsByRun = new Map<string, FindingRow[]>();
      for (const finding of findings) {
        const runId = String(finding.scan_run_id || '').trim();
        if (!runId) continue;
        const bucket = findingsByRun.get(runId) || [];
        bucket.push(finding);
        findingsByRun.set(runId, bucket);
      }

      const byWeek = new Map<string, DarkRiskWeeklyTrendPoint & { __risk_sum: number; __risk_count: number }>();

      for (const run of runs) {
        const runDate = String(run.completed_at || run.created_at || '').trim();
        if (!runDate) continue;
        const weekKey = weekStartUtcKey(runDate);
        const rowFindings = findingsByRun.get(String(run.id)) || [];

        const highCritical = rowFindings.filter((f) => ['high', 'critical'].includes(String(f.severity || '').toLowerCase())).length;
        const medium = rowFindings.filter((f) => String(f.severity || '').toLowerCase() === 'medium').length;
        const lowInfo = rowFindings.filter((f) => ['low', 'info'].includes(String(f.severity || '').toLowerCase())).length;
        const riskScores = rowFindings
          .map((f) => Number(f.risk_score))
          .filter((score) => Number.isFinite(score));
        const runRiskAvg = riskScores.length > 0
          ? riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length
          : 0;
        const dtiSignals = rowFindings.filter((f) => String(f.finding_type || '').toLowerCase().includes('dti')).length;

        const current = byWeek.get(weekKey) || {
          week_key: weekKey,
          week_label: weekLabelFromKey(weekKey),
          scans: 0,
          findings_total: 0,
          high_critical: 0,
          medium: 0,
          low_info: 0,
          risk_score_avg: 0,
          dti_signals: 0,
          __risk_sum: 0,
          __risk_count: 0,
        };

        current.scans += 1;
        current.findings_total += rowFindings.length;
        current.high_critical += highCritical;
        current.medium += medium;
        current.low_info += lowInfo;
        current.dti_signals += dtiSignals;
        current.__risk_sum += runRiskAvg;
        current.__risk_count += 1;

        byWeek.set(weekKey, current);
      }

      const weekly = [...byWeek.values()]
        .sort((a, b) => a.week_key.localeCompare(b.week_key))
        .map((entry) => ({
          week_key: entry.week_key,
          week_label: entry.week_label,
          scans: entry.scans,
          findings_total: entry.findings_total,
          high_critical: entry.high_critical,
          medium: entry.medium,
          low_info: entry.low_info,
          risk_score_avg: entry.__risk_count > 0 ? Math.round((entry.__risk_sum / entry.__risk_count) * 10) / 10 : 0,
          dti_signals: entry.dti_signals,
        }));

      return weekly.slice(-weeks);
    },
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  const latest = useMemo(() => query.data?.[query.data.length - 1] || null, [query.data]);
  const previous = useMemo(() => (query.data && query.data.length > 1 ? query.data[query.data.length - 2] : null), [query.data]);

  return {
    ...query,
    data: query.data || emptyData,
    latest,
    previous,
  };
};
