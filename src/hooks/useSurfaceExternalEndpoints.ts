import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
	surfaceScan360Api,
	type SurfaceExternalEndpoint,
	type UpsertExternalEndpointPayload,
} from "@/lib/api/surface-scan360";
import { tenantServicesApi } from "@/lib/api/tenant-services";

type ScopeTier = "standard" | "extended" | "unknown";

interface UseSurfaceExternalEndpointsReturn {
	endpoints: SurfaceExternalEndpoint[];
	loading: boolean;
	saving: boolean;
	isAdmin: boolean;
	canDeep: boolean;
	scopeTier: ScopeTier;
	createEndpoint: (payload: UpsertExternalEndpointPayload) => Promise<boolean>;
	updateEndpoint: (
		id: string,
		payload: Partial<UpsertExternalEndpointPayload>,
	) => Promise<boolean>;
	deleteEndpoint: (id: string) => Promise<boolean>;
	runEndpoint: (id: string) => Promise<boolean>;
	refetch: () => Promise<void>;
}

/** Estrae il messaggio d'errore leggibile (incl. errori di validazione Laravel). */
function readError(error: unknown, fallback: string): string {
	const e = error as { message?: string; errors?: Record<string, string[]> };
	if (e?.errors) {
		const first = Object.values(e.errors)[0];
		if (Array.isArray(first) && first[0]) return first[0];
	}
	return e?.message || fallback;
}

export const useSurfaceExternalEndpoints =
	(): UseSurfaceExternalEndpointsReturn => {
		const [endpoints, setEndpoints] = useState<SurfaceExternalEndpoint[]>([]);
		const [loading, setLoading] = useState(false);
		const [saving, setSaving] = useState(false);
		const [scopeTier, setScopeTier] = useState<ScopeTier>("unknown");

		const { toast } = useToast();
		const {
			organizationId,
			isLoading: isClientLoading,
			groupId,
		} = useClientOrganization();
		const { user } = useAuth();
		const { isSuperAdmin } = useUserRoles();

		const isAdmin = user?.user_type === "admin" || isSuperAdmin;

		const fetchEndpoints = useCallback(async () => {
			if (isClientLoading || !organizationId) return;

			setLoading(true);
			try {
				const [endpointsResult, servicesResult] = await Promise.allSettled([
					surfaceScan360Api.listExternalEndpoints(organizationId, groupId),
					tenantServicesApi.listByOrganization(organizationId, groupId),
				]);

				if (endpointsResult.status === "rejected") throw endpointsResult.reason;
				setEndpoints(endpointsResult.value || []);

				if (servicesResult.status === "fulfilled") {
					const surfaceService = servicesResult.value.find(
						(service) =>
							service.tenant_id === organizationId &&
							["surfacescan", "surfacescan360"].includes(
								service.service_type.toLowerCase(),
							) &&
							(service.status === "active" || !service.status),
					);
					setScopeTier(
						(surfaceService?.settings as { extended_range?: boolean } | null)
							?.extended_range
							? "extended"
							: "standard",
					);
				} else {
					setScopeTier("unknown");
				}
			} catch (error) {
				console.error("Error fetching external endpoints:", error);
				toast({
					title: "Errore",
					description: "Impossibile caricare gli endpoint esterni",
					variant: "destructive",
				});
			} finally {
				setLoading(false);
			}
		}, [isClientLoading, organizationId, groupId, toast]);

		useEffect(() => {
			if (!isClientLoading && organizationId) {
				void fetchEndpoints();
			}
		}, [isClientLoading, organizationId, fetchEndpoints]);

		const createEndpoint = async (
			payload: UpsertExternalEndpointPayload,
		): Promise<boolean> => {
			if (!organizationId) return false;
			setSaving(true);
			try {
				await surfaceScan360Api.createExternalEndpoint(
					organizationId,
					payload,
					groupId,
				);
				toast({ title: "Endpoint creato", description: payload.name });
				await fetchEndpoints();
				return true;
			} catch (error) {
				toast({
					title: "Errore",
					description: readError(error, "Impossibile creare l'endpoint"),
					variant: "destructive",
				});
				return false;
			} finally {
				setSaving(false);
			}
		};

		const updateEndpoint = async (
			id: string,
			payload: Partial<UpsertExternalEndpointPayload>,
		): Promise<boolean> => {
			if (!organizationId) return false;
			setSaving(true);
			try {
				await surfaceScan360Api.updateExternalEndpoint(
					organizationId,
					id,
					payload,
					groupId,
				);
				await fetchEndpoints();
				return true;
			} catch (error) {
				toast({
					title: "Errore",
					description: readError(error, "Impossibile aggiornare l'endpoint"),
					variant: "destructive",
				});
				return false;
			} finally {
				setSaving(false);
			}
		};

		const deleteEndpoint = async (id: string): Promise<boolean> => {
			if (!organizationId) return false;
			setSaving(true);
			try {
				await surfaceScan360Api.deleteExternalEndpoint(
					organizationId,
					id,
					groupId,
				);
				toast({ title: "Endpoint rimosso" });
				await fetchEndpoints();
				return true;
			} catch (error) {
				toast({
					title: "Errore",
					description: readError(error, "Impossibile rimuovere l'endpoint"),
					variant: "destructive",
				});
				return false;
			} finally {
				setSaving(false);
			}
		};

		const runEndpoint = async (id: string): Promise<boolean> => {
			if (!organizationId) return false;
			setSaving(true);
			try {
				await surfaceScan360Api.runExternalEndpoint(organizationId, id, groupId);
				toast({
					title: "Scansione avviata",
					description: "L'External Scan è stato accodato",
				});
				await fetchEndpoints();
				return true;
			} catch (error) {
				toast({
					title: "Errore",
					description: readError(error, "Impossibile avviare la scansione"),
					variant: "destructive",
				});
				return false;
			} finally {
				setSaving(false);
			}
		};

		const canDeep = useMemo(() => scopeTier === "extended", [scopeTier]);

		return {
			endpoints,
			loading,
			saving,
			isAdmin,
			canDeep,
			scopeTier,
			createEndpoint,
			updateEndpoint,
			deleteEndpoint,
			runEndpoint,
			refetch: fetchEndpoints,
		};
	};
