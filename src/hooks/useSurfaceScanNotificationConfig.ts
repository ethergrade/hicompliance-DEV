import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { surfaceScan360Api } from '@/lib/api/surface-scan360';
import { ApiError } from '@/lib/api-client';
import { useClientOrganization } from './useClientOrganization';

/** Gemello di useDarkRiskNotificationConfig: se cambia uno, guardare anche l'altro. */
export function useSurfaceScanNotificationConfig() {
  const { organizationId, groupId } = useClientOrganization();
  const queryClient = useQueryClient();

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['surfacescan-notification-config', organizationId, groupId],
    queryFn: () => {
      if (!organizationId) return Promise.resolve(null);
      return surfaceScan360Api.getNotificationConfig(organizationId, groupId);
    },
    enabled: !!organizationId,
    staleTime: 60_000,
    // 403 = ruolo senza surfacescan.assets.edit: la card lo dice, non serve riprovare
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 2,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof surfaceScan360Api.updateNotificationConfig>[1]) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      return surfaceScan360Api.updateNotificationConfig(organizationId, payload, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surfacescan-notification-config', organizationId, groupId] });
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
