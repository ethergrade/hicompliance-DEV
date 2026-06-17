import { useQuery } from '@tanstack/react-query';
import { assessmentApi } from '@/lib/api';

interface DashboardMetrics {
  completionScore: number;
  riskScore: number;
  assessmentId: string | number | null;
  isLoading: boolean;
}

/**
 * Fetch per-tenant assessment summary for the dashboard widgets.
 * Refetches automatically when organizationId/groupId change.
 */
export function useDashboardMetrics(
  organizationId?: string | null,
  groupId?: string | null
): DashboardMetrics {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-metrics', organizationId, groupId],
    queryFn: async () => {
      if (!organizationId || !groupId) {
        return { completionScore: 0, riskScore: 0, assessmentId: null };
      }

      // List assessments for the group, find the one matching this organization
      const assessments = await assessmentApi.list(groupId);
      const match = assessments.find(a => a.tenant_id === organizationId);

      if (!match) {
        return { completionScore: 0, riskScore: 0, assessmentId: null };
      }

      // Fetch the report to get the summary scores
      const report = await assessmentApi.report(match.id, groupId);

      return {
        completionScore: report.summary?.completion_score ?? 0,
        riskScore: report.summary?.risk_score ?? 0,
        assessmentId: match.id,
      };
    },
    enabled: !!organizationId && !!groupId,
    staleTime: 60_000, // 1 min before refetch
  });

  return {
    completionScore: data?.completionScore ?? 0,
    riskScore: data?.riskScore ?? 0,
    assessmentId: data?.assessmentId ?? null,
    isLoading,
  };
}
