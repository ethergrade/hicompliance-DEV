import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { darkRiskApi } from '@/lib/api/darkrisk';
import { ApiError } from '@/lib/api-client';
import { useClientOrganization } from './useClientOrganization';

export function useDarkRiskNotificationConfig() {
  const { organizationId, groupId } = useClientOrganization();
  const queryClient = useQueryClient();

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['darkrisk-notification-config', organizationId, groupId],
    queryFn: () => {
      if (!organizationId) return Promise.resolve(null);
      return darkRiskApi.getNotificationConfig(organizationId, groupId);
    },
    enabled: !!organizationId,
    staleTime: 60_000,
    // 403 = ruolo senza darkrisk.targets.manage: la card lo mostra, non serve riprovare
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 2,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof darkRiskApi.updateNotificationConfig>[1]) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      return darkRiskApi.updateNotificationConfig(organizationId, payload, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['darkrisk-notification-config', organizationId, groupId] });
    },
  });

  return {
    config,
    loading: isLoading,
    error,
    updateConfig: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
}
