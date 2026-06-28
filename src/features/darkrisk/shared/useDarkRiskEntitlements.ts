import { useOrganizationStore } from "@/stores/organizationStore";

const EXTENDED_UI_V2_ENABLED = String(import.meta.env.VITE_DARKRISK_EXTENDED_UI_V2 ?? "true") !== "false";

export const useDarkRiskEntitlements = () => {
	const services = useOrganizationStore((state) => state.tenantServices);
	const hiCompliance = services.some(
		(service) => service.service_type === "hicompliance" && service.status === "active",
	);
	const darkRisk = services.find(
		(service) => service.service_type === "darkrisk" && service.status === "active",
	);
	const settings = darkRisk?.settings ?? {};
	const extended =
		settings.extended_identity === true ||
		settings.extended_enabled === true ||
		settings.tier === "extended";

	return {
		standardEnabled: hiCompliance || Boolean(darkRisk) || extended,
		extendedEnabled: EXTENDED_UI_V2_ENABLED && extended,
	};
};
