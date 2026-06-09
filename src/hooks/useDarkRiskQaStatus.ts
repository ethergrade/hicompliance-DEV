import { useQuery } from '@tanstack/react-query';
import { darkRiskApi } from '@/lib/api/darkrisk';
import { useClientOrganization } from '@/hooks/useClientOrganization';

export interface DarkRiskQaStatus {
  ok: boolean;
  customer_id: string;
  score: number;
  passed: number;
  total: number;
  checklist: Array<{
    id: string;
    passed: boolean;
  }>;
  counts: Record<string, number>;
  generated_at: string;
  notes: string[];
}

const emptyQa: DarkRiskQaStatus = {
  ok: false,
  customer_id: '',
  score: 0,
  passed: 0,
  total: 0,
  checklist: [],
  counts: {},
  generated_at: '',
  notes: [],
};

/** Derive QA status metadata from a scan run object returned by the backend. */
const deriveQaFromScanRun = (scanRun: any, organizationId: string): DarkRiskQaStatus => {
  const raw = scanRun?.qa ?? scanRun?.metadata?.qa ?? scanRun;
  return {
    ...emptyQa,
    customer_id: String(raw?.customer_id || organizationId || '').trim(),
    ok: Boolean(raw?.ok ?? false),
    score: Number.isFinite(Number(raw?.score)) ? Number(raw.score) : 0,
    passed: Number.isFinite(Number(raw?.passed)) ? Number(raw.passed) : 0,
    total: Number.isFinite(Number(raw?.total)) ? Number(raw.total) : 0,
    checklist: Array.isArray(raw?.checklist) ? raw.checklist : [],
    counts: raw?.counts && typeof raw.counts === 'object' ? raw.counts : {},
    generated_at: String(raw?.generated_at || ''),
    notes: Array.isArray(raw?.notes) ? raw.notes : [],
  };
};

export const useDarkRiskQaStatus = () => {
  const { organizationId, groupId } = useClientOrganization();

  const query = useQuery({
    queryKey: ['darkrisk360-qa-status', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DarkRiskQaStatus> => {
      if (!organizationId) return emptyQa;

      // List scan runs and use the latest one's QA metadata
      const scanRuns = await darkRiskApi.listScanRuns(
        organizationId,
        { per_page: 1 },
        groupId,
      );

      if (!scanRuns || scanRuns.length === 0) return emptyQa;

      return deriveQaFromScanRun(scanRuns[0], organizationId);
    },
    staleTime: 120_000,
    refetchInterval: 180_000,
  });

  return {
    ...query,
    data: query.data || emptyQa,
  };
};
