import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tenantServicesApi } from "@/lib/api";
import type {
  TenantServiceResource,
  StoreTenantServiceRequest,
  UpdateTenantServiceRequest,
} from "@/types/api";
import { toast } from "sonner";
import { getErrorDetail } from "@/lib/api-client";

export function useTenantServices(status?: "active" | "inactive") {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["tenant-services", status],
    queryFn: () => tenantServicesApi.list(status),
    staleTime: 30_000,
  });

  const getQuery = (id: string) =>
    useQuery({
      queryKey: ["tenant-services", id],
      queryFn: () => tenantServicesApi.get(id),
      enabled: !!id,
    });

  const createMutation = useMutation({
    mutationFn: (payload: StoreTenantServiceRequest) => tenantServicesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-services"] });
      toast.success("Servizio creato");
    },
    onError: (e: Error) => toast.error(`Errore: ${getErrorDetail(e)}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTenantServiceRequest }) =>
      tenantServicesApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-services"] });
      toast.success("Servizio aggiornato");
    },
    onError: (e: Error) => toast.error(`Errore: ${getErrorDetail(e)}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tenantServicesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-services"] });
      toast.success("Servizio eliminato");
    },
    onError: (e: Error) => toast.error(`Errore: ${getErrorDetail(e)}`),
  });

  const catalogQuery = useQuery({
    queryKey: ["tenant-services-catalog"],
    queryFn: () => tenantServicesApi.catalog(),
    staleTime: 5 * 60_000,
  });

  return {
    services: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    catalog: catalogQuery.data,
    getService: getQuery,
    createService: createMutation.mutate,
    updateService: updateMutation.mutate,
    deleteService: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
