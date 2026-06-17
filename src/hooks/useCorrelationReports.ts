import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useClientContext } from '@/contexts/ClientContext';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { hilogReportsApi, type CorrelationReport } from '@/lib/api/hilog-reports';

export type { CorrelationReport };

export const useCorrelationReports = () => {
  const { selectedOrganization } = useClientContext();
  const { groupId } = useClientOrganization();
  const selectedClientId = selectedOrganization?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['correlation-reports', selectedClientId, groupId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      return hilogReportsApi.list(selectedClientId, undefined, groupId);
    },
    enabled: !!selectedClientId,
  });

  const deleteReport = useMutation({
    mutationFn: async (id: string) => {
      if (!selectedClientId) throw new Error('No client selected');
      await hilogReportsApi.delete(selectedClientId, id, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correlation-reports'] });
    },
  });

  return { ...query, deleteReport };
};
