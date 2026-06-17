import { useQuery } from '@tanstack/react-query';
import { assessmentApi } from '@/lib/api';
import type {
  AssessmentMonthlyReportData,
  Vulnerability,
  ShodanScan,
  RadarCategory,
} from '@/types/api';

interface AssessmentTrends {
  monthly: AssessmentMonthlyReportData | null;
  vulnerabilities: Vulnerability[];
  scans: ShodanScan[];
  radarCategories: RadarCategory[];
  deltaHosts: string | null;
  deltaCves: string | null;
  isLoading: boolean;
}

/**
 * Fetch per-tenant assessment trends (report-monthly) for the dashboard
 * "Analisi e Trend" section. Depends on a resolved assessmentId from
 * useDashboardMetrics.
 */
export function useAssessmentTrends(
  assessmentId: string | number | null,
  groupId?: string | null
): AssessmentTrends {
  const { data: monthly, isLoading } = useQuery({
    queryKey: ['assessment-trends', assessmentId, groupId],
    queryFn: async () => {
      if (!assessmentId) return null;
      return assessmentApi.reportMonthly(assessmentId, groupId);
    },
    enabled: !!assessmentId,
    staleTime: 120_000, // 2 min
  });

  return {
    monthly: monthly ?? null,
    vulnerabilities: monthly?.vulnerabilities ?? [],
    scans: monthly?.scans ?? [],
    radarCategories: monthly?.radar_categories ?? [],
    deltaHosts: monthly?.delta?.hosts ?? null,
    deltaCves: monthly?.delta?.cves ?? null,
    isLoading,
  };
}
