import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { darkRiskApi } from '@/lib/api/darkrisk';
import { useClientOrganization } from '@/hooks/useClientOrganization';

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
  const { organizationId, groupId } = useClientOrganization();

  const query = useQuery({
    queryKey: ['darkrisk360-weekly-trend', organizationId, weeks],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DarkRiskWeeklyTrendPoint[]> => {
      if (!organizationId) return emptyData;

      // Fetch scan runs from the backend API
      const scanRuns = await darkRiskApi.listScanRuns(
        organizationId,
        { per_page: Math.max(weeks * 8, 40) },
        groupId,
      );

      if (!scanRuns || scanRuns.length === 0) return emptyData;

      // Gather findings for each scan run (up to all runs, but only completed/failed ones)
      const byWeek = new Map<string, DarkRiskWeeklyTrendPoint & { __risk_sum: number; __risk_count: number }>();

      // Process scan runs (backend returns them newest-first by default — we process all, not just the tail)
      for (const run of scanRuns) {
        const runStatus = String(run.status || '').toLowerCase();
        if (!runStatus || !['completed', 'completed_with_warnings', 'failed'].includes(runStatus)) continue;

        const runDate = String(run.completed_at || run.created_at || '').trim();
        if (!runDate) continue;

        const weekKey = weekStartUtcKey(runDate);

        if (!weekKey || weekKey === 'n/a') continue;

        // Fetch findings for this run
        let findings: any[] = [];
        try {
          findings = await darkRiskApi.getScanRunFindings(
            organizationId,
            String(run.id),
            undefined,
            groupId,
          );
        } catch {
          // If findings fetch fails for a single run, skip its finding stats but count the scan
        }

        findings = Array.isArray(findings) ? findings : [];

        const highCritical = findings.filter(
          (f: any) => ['high', 'critical'].includes(String(f.severity || '').toLowerCase()),
        ).length;
        const medium = findings.filter(
          (f: any) => String(f.severity || '').toLowerCase() === 'medium',
        ).length;
        const lowInfo = findings.filter(
          (f: any) => ['low', 'info'].includes(String(f.severity || '').toLowerCase()),
        ).length;

        const riskScores = findings
          .map((f: any) => Number(f.risk_score))
          .filter((score: number) => Number.isFinite(score));
        const runRiskAvg = riskScores.length > 0
          ? riskScores.reduce((sum: number, score: number) => sum + score, 0) / riskScores.length
          : 0;

        const dtiSignals = findings.filter(
          (f: any) => String(f.finding_type || '').toLowerCase().includes('dti'),
        ).length;

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
        current.findings_total += findings.length;
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
