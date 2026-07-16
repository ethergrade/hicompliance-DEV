import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchHiTrackCollectors,
  fetchHiTrackDashboard,
  isHiTrackSupabaseConfigured,
  queueHiTrackSyncNow,
} from "@/lib/hitrack/client";
import { EMPTY_HITRACK_DASHBOARD } from "@/lib/hitrack/types";
import { useClientOrganization } from "@/hooks/useClientOrganization";

export function useHiTrackDashboard() {
  const { organizationId } = useClientOrganization();
  const configured = isHiTrackSupabaseConfigured();

  const query = useQuery({
    queryKey: ["hitrack-dashboard", organizationId],
    queryFn: () => fetchHiTrackDashboard(organizationId!),
    enabled: configured && !!organizationId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  return {
    ...query,
    isConfigured: configured,
    data: query.data ?? EMPTY_HITRACK_DASHBOARD,
  };
}

export function useHiTrackCollectors() {
  const { organizationId } = useClientOrganization();
  const configured = isHiTrackSupabaseConfigured();

  return useQuery({
    queryKey: ["hitrack-collectors", organizationId],
    queryFn: () => fetchHiTrackCollectors(organizationId!),
    enabled: configured && !!organizationId,
    staleTime: 60_000,
  });
}

export function useHiTrackSyncNow() {
  const { organizationId } = useClientOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (collectorIds?: string[]) => {
      if (!organizationId) {
        throw new Error("Organizzazione non selezionata");
      }
      return queueHiTrackSyncNow(organizationId, collectorIds);
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
