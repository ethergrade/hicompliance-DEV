import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchHiTrackCollectors,
  fetchHiTrackDashboard,
  queueHiTrackSyncNow,
} from "@/lib/hitrack/client";
import { EMPTY_HITRACK_DASHBOARD } from "@/lib/hitrack/types";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useOrganizationStore } from "@/stores/organizationStore";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRoles } from "@/hooks/useUserRoles";
import { HITRACK_DEMO_DATA, isHiTrackDemoOrganization } from "@/data/hitrackDemo";

/**
 * I dati arrivano dal backend Laravel: nel browser non c'è più niente da
 * configurare.
 *
 * Le condizioni per interrogare sono ora tre, e servono tutte. Prima ne bastava
 * una — le chiavi Supabase, che non essendo mai state configurate tenevano la
 * query spenta ovunque. Tolte quelle, la dashboard principale chiamerebbe HiTrack
 * per ogni cliente ogni sessanta secondi, compresi quelli che il servizio non
 * l'hanno: chiamate inutili al backend e un 403 in console per chi non ha la
 * capability.
 */
function useHiTrackAbilitato() {
  const { organizationId, groupId, selectedOrganization } = useClientOrganization();
  const attivo = useOrganizationStore((s) => s.orgFlags?.hitrack_enabled);
  const { hasCapability, bypass } = usePermissions();
  const { isSuperAdmin } = useUserRoles();

  // La stessa regola del menu: contratto attivo, o super-admin. Se divergessero,
  // la voce comparirebbe su una pagina che non interroga niente.
  const previsto = !!attivo || isSuperAdmin;

  return {
    organizationId,
    groupId,
    demo: isHiTrackDemoOrganization(selectedOrganization?.name),
    abilitato:
      !!organizationId && previsto && (bypass || hasCapability("hitrack.view")),
  };
}

export function useHiTrackDashboard() {
  const { organizationId, groupId, abilitato, demo } = useHiTrackAbilitato();

  const query = useQuery({
    queryKey: ["hitrack-dashboard", organizationId, groupId, demo],
    queryFn: () => demo ? Promise.resolve(HITRACK_DEMO_DATA) : fetchHiTrackDashboard(organizationId!, groupId),
    enabled: abilitato,
    staleTime: 60_000,
    refetchInterval: demo ? false : 60_000,
  });

  return {
    ...query,
    data: query.data ?? EMPTY_HITRACK_DASHBOARD,
  };
}

export function useHiTrackCollectors() {
  const { organizationId, groupId, abilitato } = useHiTrackAbilitato();

  return useQuery({
    queryKey: ["hitrack-collectors", organizationId, groupId],
    queryFn: () => fetchHiTrackCollectors(organizationId!, groupId),
    enabled: abilitato,
    staleTime: 60_000,
  });
}

export function useHiTrackSyncNow() {
  const { organizationId, groupId, selectedOrganization } = useClientOrganization();
  const demo = isHiTrackDemoOrganization(selectedOrganization?.name);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (collectorIds?: string[]) => {
      if (!organizationId) {
        throw new Error("Organizzazione non selezionata");
      }
      if (demo) return { queued: false, demo: true };
      return queueHiTrackSyncNow(organizationId, collectorIds, groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["hitrack-dashboard", organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["hitrack-collectors", organizationId],
      });
      toast.success(demo ? "Dati dimostrativi aggiornati" : "Sincronizzazione HiTrack accodata");
    },
    onError: (error: Error) => {
      toast.error(
        error.message || "Impossibile avviare la sincronizzazione HiTrack",
      );
    },
  });
}
