import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { darkRiskApi } from '@/lib/api/darkrisk';
import { useClientOrganization } from './useClientOrganization';

export interface DarkRiskTarget {
  id: string;
  tenant_id: string;
  group_id: string;
  scope: string;
  label?: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export function useDarkRiskTargets() {
  const { organizationId, groupId } = useClientOrganization();
  const queryClient = useQueryClient();

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ['darkrisk-targets', organizationId, groupId],
    queryFn: () => {
      if (!organizationId) return Promise.resolve([] as DarkRiskTarget[]);
      return darkRiskApi.listTargets(organizationId, groupId);
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const createBatchMutation = useMutation({
    mutationFn: (payload: { scope: string[]; label?: string }) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      return darkRiskApi.createTargetsBatch(organizationId, payload, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['darkrisk-targets', organizationId, groupId] });
    },
  });

  const previewMutation = useMutation({
    mutationFn: (payload: { scope: string[] }) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      return darkRiskApi.previewTargets(organizationId, payload, groupId);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (targetId: string) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      return darkRiskApi.deleteTarget(organizationId, targetId, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['darkrisk-targets', organizationId, groupId] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (targetId: string) => {
      if (!organizationId) throw new Error('Nessun cliente selezionato');
      return darkRiskApi.toggleTarget(organizationId, targetId, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['darkrisk-targets', organizationId, groupId] });
    },
  });

  const addTargets = useCallback(
    async (scope: string[], label?: string) => {
      return createBatchMutation.mutateAsync({ scope, label });
    },
    [createBatchMutation],
  );

  const removeTarget = useCallback(
    async (targetId: string) => {
      return removeMutation.mutateAsync(targetId);
    },
    [removeMutation],
  );

  const previewTargets = useCallback(
    async (scope: string[]) => {
      return previewMutation.mutateAsync({ scope });
    },
    [previewMutation],
  );

  return {
    targets,
    loading: isLoading,
    saving: createBatchMutation.isPending || removeMutation.isPending || toggleMutation.isPending,
    addTargets,
    removeTarget,
    previewTargets,
    toggleTarget: (targetId: string) => toggleMutation.mutate(targetId),
    isToggling: toggleMutation.isPending,
  };
}
