import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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

export const useDarkRiskQaStatus = () => {
  const { organizationId } = useClientOrganization();

  const query = useQuery({
    queryKey: ['darkrisk360-qa-status', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DarkRiskQaStatus> => {
      if (!organizationId) return emptyQa;

      const { data, error } = await supabase.functions.invoke('darkrisk360-qa-status', {
        body: { customer_id: organizationId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      return {
        ...emptyQa,
        ...(data || {}),
      } as DarkRiskQaStatus;
    },
    staleTime: 120_000,
    refetchInterval: 180_000,
  });

  return {
    ...query,
    data: query.data || emptyQa,
  };
};
