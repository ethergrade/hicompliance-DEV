import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { tenantServicesApi } from "@/lib/api";
import { useOrganizationStore } from "@/stores/organizationStore";

/**
 * Bridge hook: fetches tenant services for the selected organization from
 * the backend API and hydrates the Zustand organization store.
 *
 * This replaces the duplicated `listByOrganization` + flag-derivation pattern
 * that previously existed in AppSidebar, ClientProfileSheet, and
 * ClientServicesDialog.
 *
 * Usage:
 *   useHydrateOrganizationServices(organizationId, groupId);
 *
 * Components that need org flags or services can then subscribe via
 * `useOrganizationStore()` instead of making their own API call.
 */
export function useHydrateOrganizationServices(
	organizationId: string | null | undefined,
	groupId: string | null | undefined,
) {
	const setTenantServices = useOrganizationStore((s) => s.setTenantServices);

	const {
		data: services,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["org-services-hydrate", organizationId, groupId],
		queryFn: async () => {
			if (!organizationId) return [];
			const raw = await tenantServicesApi.listByOrganization(
				organizationId,
				groupId ?? undefined,
			);
			return raw;
		},
		enabled: !!organizationId,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
	});

	// Finché i servizi del cliente non sono arrivati lo store resta vuoto. Prima
	// teneva quelli del cliente precedente: cambiando cliente, il menu mostrava
	// per qualche istante (o per sempre, se la richiesta falliva) i suoi moduli.
	useEffect(() => {
		if (services && organizationId) {
			setTenantServices(services, organizationId);
		} else {
			setTenantServices([], null);
		}
	}, [services, organizationId, setTenantServices]);

	return { isLoading, error };
}
