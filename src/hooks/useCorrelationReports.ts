import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientContext } from '@/contexts/ClientContext';

export interface CorrelationReport {
  id: string;
  title: string;
  description: string | null;
  time_range_label: string;
  time_range_days: number;
  events_count: number;
  format: string;
  status: string;
  report_data: any[];
  filter_config: any;
  created_at: string;
  organization_id: string | null;
  user_id: string;
}

export const useCorrelationReports = () => {
  const { selectedOrganization } = useClientContext();
  const selectedClientId = selectedOrganization?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['correlation-reports', selectedClientId],
    queryFn: async () => {
      let q = supabase.from('hilog_correlation_reports' as any).select('*').order('created_at', { ascending: false });
      if (selectedClientId) {
        q = q.eq('organization_id', selectedClientId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as CorrelationReport[];
    },
  });

  const deleteReport = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('hilog_correlation_reports' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correlation-reports'] });
    },
  });

  return { ...query, deleteReport };
};
