import { useCallback } from "react";
import { useClientContext } from "@/contexts/ClientContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useHydrateOrganizationServices } from "@/hooks/useHydrateOrganizationServices";
import { getRequiredService } from "@/config/moduleServiceMap";

/**
 * Visibilità dei moduli in base ai servizi attivi del cliente selezionato.
 * Senza cliente selezionato (vista console) tutto è visibile.
 *
 * Carica i servizi anche da sé: il menu laterale, che li caricava, su mobile non
 * è montato finché non lo si apre.
 */
export function useModuleAccess() {
	const { selectedOrganization } = useClientContext();
	useHydrateOrganizationServices(selectedOrganization?.id, selectedOrganization?.group_id ?? null);
	const tenantServices = useOrganizationStore((s) => s.tenantServices);
	const servicesOrgId = useOrganizationStore((s) => s.servicesOrgId);

	const servicesReady = !!selectedOrganization && servicesOrgId === selectedOrganization.id;

	const isServiceActive = useCallback(
		(service: string) =>
			servicesReady &&
			tenantServices.some((s) => s.service_type === service && s.status === "active"),
		[servicesReady, tenantServices],
	);

	const isRouteAllowed = useCallback(
		(path: string) => {
			if (!selectedOrganization) return true;
			const service = getRequiredService(path);
			if (!service) return true;
			return isServiceActive(service);
		},
		[selectedOrganization, isServiceActive],
	);

	return { isRouteAllowed, isServiceActive, servicesReady };
}
