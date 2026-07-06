import { useQuery } from '@tanstack/react-query';
import { assessmentApi } from '@/lib/api';
import { assessmentV2Api } from '@/lib/api/assessment-v2';
import { loadV2AssessmentData, mapToUiStatus } from '@/lib/assessmentV2Mapper';
import { computeOverallScore } from '@/lib/assessment/scoring';
import type { AssessmentResponse } from '@/data/assessmentQuestions';

interface DashboardMetrics {
  completionScore: number;
  riskScore: number;
  assessmentId: string | number | null;
  isLoading: boolean;
}

/**
 * Per-tenant assessment score for the dashboard widgets.
 *
 * The compliance score is computed from the SAME v2 data and the SAME shared
 * scoring util (computeOverallScore) used by the /assessment page, so the two
 * screens always match. The legacy v1 assessmentId is still resolved because
 * the dashboard "Analisi e Trend" section depends on it (reportMonthly).
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

      // Resolve the legacy v1 assessment id (needed by useAssessmentTrends).
      const assessments = await assessmentApi.list(groupId);
      const assessmentId =
        assessments.find((a) => a.tenant_id === organizationId)?.id ?? null;

      // Compute the compliance score from v2 data using the same shared util
      // as the /assessment page so the numbers are identical.
      const { categories, indexToUuid } = await loadV2AssessmentData(groupId);
      const items = await assessmentV2Api.responses(organizationId, groupId);

      const uuidToIndex: Record<string, number> = {};
      Object.entries(indexToUuid).forEach(([idx, uuid]) => {
        uuidToIndex[uuid] = Number(idx);
      });

      const responses: Record<number, AssessmentResponse> = {};
      items.forEach((it) => {
        const idx = uuidToIndex[it.question_id];
        if (idx) responses[idx] = mapToUiStatus(it.status);
      });

      const completionScore = computeOverallScore(categories, responses);
      const riskScore = 100 - completionScore;

      return { completionScore, riskScore, assessmentId };
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
