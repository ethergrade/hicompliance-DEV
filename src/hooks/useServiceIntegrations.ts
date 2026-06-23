import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tenantServicesApi } from "@/lib/api";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { toast } from "sonner";
import type { TenantServiceResource } from "@/types/api";
import { getErrorDetail } from "@/lib/api-client";

interface ServiceIntegration {
	id: string;
	service_id: string;
	api_url: string;
	is_active: boolean;
	organization_id: string;
	service_code?: string;
	service_name?: string;
}

const normalizeServiceCode = (code: string) =>
	code.toLowerCase().replace(/[_-]/g, "");

/** Map TenantServiceResource to the legacy ServiceIntegration shape */
function toServiceIntegration(s: TenantServiceResource): ServiceIntegration {
	return {
		id: s.id,
		service_id: s.service_type,
		api_url: "", // new API has no api_url — stored in settings if needed
		is_active: s.status === "active",
		organization_id: s.tenant_id,
		service_code: s.service_type,
		service_name: s.service_type, // new API uses service_type as identifier
	};
}

export const useServiceIntegrations = () => {
	const { organizationId, groupId } = useClientOrganization();
	const queryClient = useQueryClient();

	const { data: integrations = [], isLoading } = useQuery({
		queryKey: ["service-integrations", organizationId, groupId],
		queryFn: async () => {
			if (!organizationId) return [];
			const list = await tenantServicesApi.listByOrganization(
				organizationId,
				groupId,
			);
			// Client-side filter: compensate for backend bug where tenant_id param is ignored
			return list
				.filter((s) => s.tenant_id === organizationId)
				.map(toServiceIntegration);
		},
		enabled: !!organizationId,
	});

	const isServiceConnected = (serviceCode: string): boolean => {
		const normalizedTargetCode = normalizeServiceCode(serviceCode);
		return integrations.some(
			(i) =>
				i.service_code &&
				normalizeServiceCode(i.service_code) === normalizedTargetCode &&
				i.is_active &&
				i.organization_id === organizationId,
		);
	};

	const getIntegrationByCode = (
		serviceCode: string,
	): ServiceIntegration | undefined => {
		const normalizedTargetCode = normalizeServiceCode(serviceCode);
		return integrations.find(
			(i) =>
				i.service_code &&
				normalizeServiceCode(i.service_code) === normalizedTargetCode &&
				i.is_active &&
				i.organization_id === organizationId,
		);
	};

	const connectMutation = useMutation({
		mutationFn: async ({
			serviceId,
			apiUrl,
			apiKey,
		}: {
			serviceId: string;
			apiUrl: string;
			apiKey: string;
		}) => {
			// Check if already exists
			const existing = integrations.find((i) => i.service_id === serviceId);

			if (existing) {
				// Re-activate if inactive
				await tenantServicesApi.update(existing.id, { status: "active" });
			} else {
				await tenantServicesApi.create({
					service_type: serviceId,
					status: "active",
					settings: apiUrl ? { url: apiUrl } : null,
				});
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["service-integrations"] });
			toast.success("Servizio collegato con successo");
		},
		onError: (error: Error) => {
			toast.error(`Errore: ${getErrorDetail(error)}`);
		},
	});

	const disconnectMutation = useMutation({
		mutationFn: async (integrationId: string) => {
			await tenantServicesApi.update(integrationId, { status: "inactive" });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["service-integrations"] });
			toast.success("Servizio scollegato");
		},
		onError: (error: Error) => {
			toast.error(`Errore: ${getErrorDetail(error)}`);
		},
	});

	return {
		integrations,
		hasAnyIntegrationsConfigured: integrations.length > 0,
		isLoading,
		organizationId,
		isServiceConnected,
		getIntegrationByCode,
		connectService: connectMutation.mutate,
		disconnectService: disconnectMutation.mutate,
		isConnecting: connectMutation.isPending,
		isDisconnecting: disconnectMutation.isPending,
	};
};
