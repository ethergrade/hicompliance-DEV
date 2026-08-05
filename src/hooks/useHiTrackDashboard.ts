import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchHiTrackCollectors,
  fetchHiTrackDashboard,
  queueHiTrackSyncNow,
} from "@/lib/hitrack/client";
import { EMPTY_HITRACK_DASHBOARD } from "@/lib/hitrack/types";
import { useClientOrganization } from "@/hooks/useClientOrganization";

/**
 * I dati arrivano dal backend Laravel. Non c'è più niente da configurare nel
 * browser — prima il modulo restava spento se mancavano le chiavi Supabase — e
 * l'unica condizione è avere un cliente selezionato.
 */
export function useHiTrackDashboard() {
  const { organizationId, groupId } = useClientOrganization();

  const query = useQuery({
    queryKey: ["hitrack-dashboard", organizationId, groupId],
    queryFn: () => fetchHiTrackDashboard(organizationId!, groupId),
    enabled: !!organizationId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  return {
    ...query,
    data: query.data ?? EMPTY_HITRACK_DASHBOARD,
  };
}

export function useHiTrackCollectors() {
  const { organizationId, groupId } = useClientOrganization();

  return useQuery({
    queryKey: ["hitrack-collectors", organizationId, groupId],
    queryFn: () => fetchHiTrackCollectors(organizationId!, groupId),
    enabled: !!organizationId,
    staleTime: 60_000,
  });
}

export function useHiTrackSyncNow() {
  const { organizationId, groupId } = useClientOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (collectorIds?: string[]) => {
      if (!organizationId) {
        throw new Error("Organizzazione non selezionata");
      }
      return queueHiTrackSyncNow(organizationId, collectorIds, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["hitrack-dashboard", organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["hitrack-collectors", organizationId],
      });
      toast.success("Sincronizzazione HiTrack accodata");
    },
    onError: (error: Error) => {
      toast.error(
        error.message || "Impossibile avviare la sincronizzazione HiTrack",
      );
    },
  });
}
