import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserRoles } from "@/hooks/useUserRoles";
import { surfaceScan360Api } from "@/lib/api/surface-scan360";
import { darkRiskApi } from "@/lib/api/darkrisk";
import { tenantServicesApi } from "@/lib/api/tenant-services";
import { MonitoredIpEntryType, parseMonitoredIpInput } from "@/lib/ipRange";

export type SurfaceScanScopeTier = "standard" | "extended" | "unknown";

export interface SurfaceScanMonitoredIpRule {
	id: string;
	organization_id: string;
	input_value: string;
	entry_type: MonitoredIpEntryType;
	ip_start: string;
	ip_end: string;
	created_by: string | null;
	created_at: string;
	updated_at: string;
	discovered_via?: "manual" | "subdomain_dump" | string;
	discovered_from?: string | null;
}

export interface AddRuleOptions {
	discovered_via?: "manual" | "subdomain_dump";
	discovered_from?: string | null;
	silent?: boolean;
	auto_queue_scan?: boolean;
	auto_sync_darkrisk?: boolean;
}

interface UseSurfaceScanMonitoredIpsReturn {
	rules: SurfaceScanMonitoredIpRule[];
	loading: boolean;
	saving: boolean;
	isAdmin: boolean;
	hasRules: boolean;
	scopeTier: SurfaceScanScopeTier;
	manualScopeCount: number;
	manualScopeLimit: number | null;
	addRule: (input: string, opts?: AddRuleOptions) => Promise<boolean>;
	removeRule: (id: string) => Promise<boolean>;
	refetch: () => Promise<void>;
}

export const useSurfaceScanMonitoredIps =
	(): UseSurfaceScanMonitoredIpsReturn => {
		const [rules, setRules] = useState<SurfaceScanMonitoredIpRule[]>([]);
		const [loading, setLoading] = useState(false);
		const [saving, setSaving] = useState(false);
		const [scopeTier, setScopeTier] = useState<SurfaceScanScopeTier>("unknown");

		const { toast } = useToast();
		const {
			organizationId,
			isLoading: isClientLoading,
			groupId,
		} = useClientOrganization();
		const { user } = useAuth();
		const { isSuperAdmin } = useUserRoles();

		const isAdmin = user?.user_type === "admin" || isSuperAdmin;

		const queueScopeRuleScan = useCallback(
			async (args: {
				organizationId: string;
				target: string;
				silent?: boolean;
				discoveredVia?: string;
			}) => {
				try {
					await surfaceScan360Api.createJob(
						args.organizationId,
						{
							target: args.target,
							scan_profile: "standard",
						},
						groupId,
					);

					if (!args.silent) {
						toast({
							title: "Scansione automatica accodata",
							description: `${args.target}`,
						});
					}
				} catch (error: unknown) {
					const message = String(error?.message || "").toLowerCase();
					const expectedFailure =
						message.includes("cooldown") ||
						message.includes("rate limit") ||
						message.includes("queue is full");
					if (!expectedFailure) {
						console.warn("Auto scope scan enqueue failed:", error);
					}
				}
			},
			[toast, groupId],
		);

		const triggerDarkRiskScopeSync = useCallback(
			async (args: { organizationId: string; silent?: boolean }) => {
				try {
					await darkRiskApi.createScanRun(
						args.organizationId,
						{ notes: "auto_scope_sync" },
						groupId,
					);

					if (!args.silent) {
						toast({
							title: "DarkRisk360 sincronizzato",
							description: "Scope propagato e controlli DarkRisk avviati",
						});
					}
				} catch (syncError) {
					console.warn("DarkRisk auto scope sync error:", syncError);
				}
			},
			[toast, groupId],
		);

		const fetchRules = useCallback(async () => {
			if (isClientLoading || !organizationId) return;

			setLoading(true);
			try {
				const [rulesResult, servicesResult] = await Promise.allSettled([
					surfaceScan360Api.listMonitoredIps(organizationId, groupId),
					tenantServicesApi.listByOrganization(organizationId, groupId),
				]);

				if (rulesResult.status === "rejected") throw rulesResult.reason;
				setRules((rulesResult.value || []) as SurfaceScanMonitoredIpRule[]);

				if (servicesResult.status === "fulfilled") {
					const surfaceService = servicesResult.value.find(
						(service) =>
							service.tenant_id === organizationId &&
							["surfacescan", "surfacescan360"].includes(service.service_type.toLowerCase()) &&
							(service.status === "active" || !service.status),
					);
					setScopeTier(
						(surfaceService?.settings as { extended_range?: boolean } | null)?.extended_range
							? "extended"
							: "standard",
					);
				} else {
					setScopeTier("unknown");
				}
			} catch (error) {
				console.error("Error fetching monitored IP rules:", error);
				toast({
					title: "Errore",
					description: "Impossibile caricare gli asset monitorati",
					variant: "destructive",
				});
			} finally {
				setLoading(false);
			}
		}, [isClientLoading, organizationId, groupId, toast]);

		useEffect(() => {
			if (!isClientLoading && organizationId) {
				fetchRules();
			}
		}, [isClientLoading, organizationId, fetchRules]);

		const addRule = async (
			input: string,
			opts: AddRuleOptions = {},
		): Promise<boolean> => {
			if (!organizationId) {
				if (!opts.silent) {
					toast({
						title: "Errore",
						description: "Seleziona prima un cliente",
						variant: "destructive",
					});
				}
				return false;
			}

			if (!isAdmin) {
				if (!opts.silent) {
					toast({
						title: "Operazione non consentita",
						description: "Solo gli admin possono gestire lo scope monitorato",
						variant: "destructive",
					});
				}
				return false;
			}

			let parsed;
			try {
				parsed = parseMonitoredIpInput(input);
			} catch (error: unknown) {
				if (!opts.silent) {
					toast({
						title: "Formato non valido",
						description: error?.message || "Inserisci un formato IP valido",
						variant: "destructive",
					});
				}
				return false;
			}

			setSaving(true);
			try {
				const payload: Parameters<
					typeof surfaceScan360Api.createMonitoredIp
				>[1] = {
					organization_id: organizationId,
					input_value: parsed.inputValue,
					entry_type: parsed.entryType,
					ip_start: parsed.ipStart,
					ip_end: parsed.ipEnd,
					created_by: user?.id || null,
					discovered_via: opts.discovered_via ?? "manual",
					discovered_from: opts.discovered_from ?? null,
				};

				try {
					await surfaceScan360Api.createMonitoredIp(
						organizationId,
						payload,
						groupId,
					);
				} catch (error: unknown) {
					const isDuplicate =
						error?.status === 409 ||
						String(error?.message || "")
							.toLowerCase()
							.includes("duplicate");
					if (isDuplicate) {
						if (!opts.silent) {
							toast({
								title: "Regola duplicata",
								description: "Questa regola di monitoraggio è già presente",
								variant: "destructive",
							});
						}
						return false;
					}
					throw error;
				}

				if (!opts.silent) {
					toast({
						title: "Regola aggiunta",
						description: "Asset monitorato salvato con successo",
					});
				}

				// TODO: migrate to backend API (organizations flags)
				// Stub: default both flags to enabled to preserve previous behavior
				const orgFlagsData = {
					surface_scan360_enabled: true,
					dark_risk360_enabled: true,
				};
				const surfaceEnabled = true;
				const darkRiskEnabled = true;

				const shouldAutoQueue =
					opts.auto_queue_scan !== false && surfaceEnabled;
				if (shouldAutoQueue) {
					void queueScopeRuleScan({
						organizationId,
						target: parsed.inputValue,
						silent: opts.silent,
						discoveredVia: opts.discovered_via || "manual",
					});
				}

				const shouldSyncDarkRisk =
					darkRiskEnabled &&
					opts.auto_queue_scan !== false &&
					opts.auto_sync_darkrisk !== false &&
					String(opts.discovered_via || "manual") !== "subdomain_dump";
				if (shouldSyncDarkRisk) {
					void triggerDarkRiskScopeSync({
						organizationId,
						silent: opts.silent,
					});
				}

				await fetchRules();
				return true;
			} catch (error) {
				console.error("Error adding monitored IP rule:", error);
				if (!opts.silent) {
					toast({
						title: "Errore",
						description: "Impossibile aggiungere la regola IP",
						variant: "destructive",
					});
				}
				return false;
			} finally {
				setSaving(false);
			}
		};

		const removeRule = async (id: string): Promise<boolean> => {
			if (!isAdmin) {
				toast({
					title: "Operazione non consentita",
					description: "Solo gli admin possono gestire lo scope monitorato",
					variant: "destructive",
				});
				return false;
			}

			setSaving(true);
			try {
				await surfaceScan360Api.deleteMonitoredIp(organizationId, id, groupId);

				toast({
					title: "Regola rimossa",
					description: "Asset monitorato rimosso con successo",
				});

				await fetchRules();
				return true;
			} catch (error) {
				console.error("Error deleting monitored IP rule:", error);
				toast({
					title: "Errore",
					description: "Impossibile rimuovere la regola IP",
					variant: "destructive",
				});
				return false;
			} finally {
				setSaving(false);
			}
		};

		const hasRules = useMemo(() => rules.length > 0, [rules.length]);
		const manualScopeCount = useMemo(
			() => rules.filter((rule) => String(rule.discovered_via || "manual").toLowerCase() === "manual").length,
			[rules],
		);
		const manualScopeLimit = scopeTier === "standard" ? 4 : null;

		return {
			rules,
			loading,
			saving,
			isAdmin,
			hasRules,
			scopeTier,
			manualScopeCount,
			manualScopeLimit,
			addRule,
			removeRule,
			refetch: fetchRules,
		};
	};
