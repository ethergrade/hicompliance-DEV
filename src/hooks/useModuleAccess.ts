import { useCallback } from "react";
import { useOrganizationStore } from "@/stores/organizationStore";
import { getRequiredService } from "@/config/moduleServiceMap";

/**
 * Visibilità moduli in base ai servizi attivi del cliente selezionato.
 * Senza cliente selezionato (vista console) tutto è visibile.
 */
export function useModuleAccess() {
	const selectedOrganization = useOrganizationStore((s) => s.selectedOrganization);
	const tenantServices = useOrganizationStore((s) => s.tenantServices);
	const servicesOrgId = useOrganizationStore((s) => s.servicesOrgId);

	const servicesReady = !!selectedOrganization && servicesOrgId === selectedOrganization.id;

	const isServiceActive = useCallback(
		(service: string) =>
			tenantServices.some((s) => s.service_type === service && s.status === "active"),
		[tenantServices],
	);

	const isRouteAllowed = useCallback(
		(path: string) => {
			if (!selectedOrganization) return true;
			const service = getRequiredService(path);
			if (!service) return true;
			if (!servicesReady) return false;
			return isServiceActive(service);
		},
		[selectedOrganization, servicesReady, isServiceActive],
	);

	return { isRouteAllowed, isServiceActive, servicesReady };
}
