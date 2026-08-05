import React, { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Loader2,
	Link2,
	Unlink,
	Plug,
	Shield,
	ShieldAlert,
	Mail,
	Monitor,
	Smartphone,
	Activity,
	Search as SearchIcon,
	Server,
	ShieldCheck,
	FileCheck,
	Eye,
	Radar,
	Calendar,
	Database,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tenantServicesApi } from "@/lib/api";
import { FALLBACK_SERVICE_CATALOG } from "@/data/serviceCatalog";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import type { TenantServiceResource } from "@/types/api";
import { getErrorDetail } from "@/lib/api-client";

interface ClientServicesDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId?: string;
	organizationName?: string;
	groupId?: string | null;
}

interface Integration {
	id: string;
	service_id: string;
	api_url: string;
	is_active: boolean;
	service_code?: string;
	service_name?: string;
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
	hipatch: <Shield className="w-4 h-4" />,
	hifirewall: <Shield className="w-4 h-4" />,
	hiendpoint: <Monitor className="w-4 h-4" />,
	himail: <Mail className="w-4 h-4" />,
	surfacescan: <Activity className="w-4 h-4" />,
	hilog: <Server className="w-4 h-4" />,
	hidetect: <SearchIcon className="w-4 h-4" />,
	himobile: <Smartphone className="w-4 h-4" />,
	hitrack: <Activity className="w-4 h-4" />,
};

/** Derive feature flags from tenant-services list */
function deriveFlags(services: TenantServiceResource[]) {
	const hc = services.find(
		(s) =>
			s.service_type === "hicompliance" && (s.status === "active" || !s.status),
	);
	const ht = services.find(
		(s) =>
			s.service_type === "surfacescan" && (s.status === "active" || !s.status),
	);
	const dr = services.find(
		(s) =>
			s.service_type === "darkrisk" && (s.status === "active" || !s.status),
	);
	const hp = services.find(
		(s) => s.service_type === "hipatch" && (s.status === "active" || !s.status),
	);
	const htk = services.find(
		(s) => s.service_type === "hitrack" && (s.status === "active" || !s.status),
	);
	return {
		hicompliance_enabled: !!hc,
		hicompliance_license:
			((hc?.settings as any)?.license as string) || "standard",
		irp_extended: !!(hc?.settings as any)?.extended_range,
		surface_scan_extended: !!(ht?.settings as any)?.extended_range,
		surface_scan360_enabled: !!ht,
		dark_risk360_enabled: !!dr || !!hc,
		hipatch_enabled: !!hp,
		hitrack_enabled: !!htk,
	};
}

/** Derive DarkRisk tier from tenant-services list */
function deriveDarkRiskTier(services: TenantServiceResource[]) {
	const dr = services.find(
		(s) =>
			s.service_type === "darkrisk" && (s.status === "active" || !s.status),
	);
	const settings = (dr?.settings as Record<string, unknown> | null) ?? {};
	const extended =
		settings.extended_identity === true ||
		settings.extended_enabled === true ||
		settings.tier === "extended";
	return {
		tier: (extended ? "extended" : "standard") as "standard" | "extended",
		enabled: !!dr,
		standard: !!dr || extended,
		extended,
	};
}

/** Input data contratto: stato locale, salva solo on-blur (evita salvataggio su ogni keystroke) */
const ContractDateInput: React.FC<{
	value: string;
	onSave: (date: string) => void;
	disabled?: boolean;
}> = ({ value, onSave, disabled }) => {
	const [local, setLocal] = React.useState(value);

	// Sincronizza quando il parent fa refetch
	React.useEffect(() => {
		setLocal(value);
	}, [value]);

	// Trello #67: shortcut per impostare rapidamente la data di oggi.
	const handleToday = () => {
		const today = new Date().toISOString().slice(0, 10);
		setLocal(today);
		if (today !== value) onSave(today);
	};

	return (
		<div className="flex items-center gap-1">
			<Input
				type="date"
				// Trello #67: forza il Calendar Picker bianco anche in dark mode
				// (l'icona nativa del date-picker eredita color-scheme dal browser).
				className="h-7 text-xs bg-white text-gray-900 [color-scheme:light]"
				value={local}
				onChange={(e) => setLocal(e.target.value)}
				onBlur={() => {
					if (local !== value) onSave(local);
				}}
				disabled={disabled}
			/>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={handleToday}
				disabled={disabled}
				className="h-7 px-2 text-[10px] shrink-0"
				title="Imposta la data di inizio a oggi"
			>
				Oggi
			</Button>
		</div>
	);
};

const calcEndDate = (
	startDate: string | null,
	durationYears: string | null,
): string => {
	if (!startDate || !durationYears) return "";
	const d = new Date(startDate + "T00:00:00");
	d.setFullYear(d.getFullYear() + parseInt(durationYears, 10));
	return d.toLocaleDateString("it-IT");
};

const ClientServicesDialog: React.FC<ClientServicesDialogProps> = ({
	open,
	onOpenChange,
	organizationId: propOrgId,
	organizationName,
	groupId: propGroupId,
}) => {
	const queryClient = useQueryClient();
	const { organizationId: hookOrgId, groupId: hookGroupId } =
		useClientOrganization();
	const organizationId = propOrgId || hookOrgId;
	const groupId = propGroupId ?? hookGroupId;
	const [connectingService, setConnectingService] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [apiUrl, setApiUrl] = useState("");
	const [apiKey, setApiKey] = useState("");

	// All tenant-services for this client (backend ignores tenant_id, filter client-side)
	const { data: tenantServices = [], refetch: refetchServices } = useQuery({
		queryKey: ["tenant-services-client", organizationId],
		queryFn: async () => {
			const all = await tenantServicesApi.listByOrganization(
				organizationId!,
				groupId,
			);
			return all.filter((s) => s.tenant_id === organizationId);
		},
		enabled: open && !!organizationId && !!groupId,
	});

	// Feature flags derived from tenant-services
	const orgFlags = deriveFlags(tenantServices);
	const darkRiskEntitlement = deriveDarkRiskTier(tenantServices);

	const updateFlagsMutation = useMutation({
		mutationFn: async (patch: Record<string, boolean | string>) => {
			if (!organizationId) {
				throw new Error("Nessuna azienda selezionata");
			}
			const ts = [...tenantServices];
			const darkRiskTier = (patch.dark_risk_tier as string) || "standard";

			// Settings updates (only reachable if services still exist after creates)
			// HiCompliance license toggle
			if ("hicompliance_license" in patch) {
				const hc = ts.find((s) => s.service_type === "hicompliance");
				if (hc) {
					await tenantServicesApi.update(
						hc.id,
						{
							settings: {
								...((hc.settings as any) || {}),
								license: patch.hicompliance_license,
							},
						},
						groupId,
					);
				}
			}
			// IRP extended toggle
			if ("irp_extended" in patch) {
				const hc = ts.find((s) => s.service_type === "hicompliance");
				if (hc) {
					await tenantServicesApi.update(
						hc.id,
						{
							settings: {
								...((hc.settings as any) || {}),
								extended_range: patch.irp_extended,
							},
						},
						groupId,
					);
				}
			}
			// SurfaceScan extended toggle (skip if service was just toggled OFF)
			if (
				"surface_scan_extended" in patch &&
				patch.surface_scan360_enabled !== false
			) {
				const ht = ts.find((s) => s.service_type === "surfacescan");
				if (ht) {
					await tenantServicesApi.update(
						ht.id,
						{
							settings: {
								...((ht.settings as any) || {}),
								extended_range: patch.surface_scan_extended,
							},
						},
						groupId,
					);
				}
			}
			// Handle deletions AFTER settings updates, so the settings PUT lands on a still-existing record
			// HiCompliance toggle OFF
			if (patch.hicompliance_enabled === false) {
				const hc = ts.find((s) => s.service_type === "hicompliance");
				if (hc) await tenantServicesApi.delete(hc.id, groupId);
			}
			// SurfaceScan360 toggle OFF
			if (patch.surface_scan360_enabled === false) {
				const ht = ts.find((s) => s.service_type === "surfacescan");
				if (ht) await tenantServicesApi.delete(ht.id, groupId);
			}
			// DarkRisk360 toggle OFF
			if (patch.dark_risk360_enabled === false) {
				const dr = ts.find((s) => s.service_type === "darkrisk");
				if (dr) await tenantServicesApi.delete(dr.id, groupId);
			}
			// Hipatch toggle OFF
			if (patch.hipatch_enabled === false) {
				const hp = ts.find((s) => s.service_type === "hipatch");
				if (hp) await tenantServicesApi.delete(hp.id, groupId);
			}
			// HiTrack toggle OFF
			if (patch.hitrack_enabled === false) {
				const ht = ts.find((s) => s.service_type === "hitrack");
				if (ht) await tenantServicesApi.delete(ht.id, groupId);
			}

			// Create new services
			// HiCompliance toggle ON
			if (patch.hicompliance_enabled === true) {
				const hc = ts.find((s) => s.service_type === "hicompliance");
				if (!hc) {
					await tenantServicesApi.create(
						{
							tenant_id: organizationId,
							service_type: "hicompliance",
							status: "active",
							settings: { duration: "3", extended_range: false },
						},
						groupId,
					);
				}
				// Card #47: Auto-enable SurfaceScan360 (standard) when hicompliance is activated
				const autoHt = ts.find((s) => s.service_type === "surfacescan");
				if (!autoHt) {
					await tenantServicesApi.create(
						{
							tenant_id: organizationId,
							service_type: "surfacescan",
							status: "active",
							settings: { duration: "3", extended_range: false },
						},
						groupId,
					);
				}
				// Card #47: Auto-enable DarkRisk360 (standard) when hicompliance is activated
				const autoDr = ts.find((s) => s.service_type === "darkrisk");
				if (!autoDr) {
					await tenantServicesApi.create(
						{
							tenant_id: organizationId,
							service_type: "darkrisk",
							status: "active",
							settings: {
								tier: "standard",
								standard_monitor: true,
								extended_identity: false,
							},
						},
						groupId,
					);
				}
			}
			// SurfaceScan360 toggle ON — eredita contract_start da HiCompliance se presente
			if (patch.surface_scan360_enabled === true) {
				const ht = ts.find((s) => s.service_type === "surfacescan");
				if (!ht) {
					const hcSettings =
						(ts.find((s) => s.service_type === "hicompliance")
							?.settings as any) || {};
					const defaultStart = hcSettings.contract_start || "";
					await tenantServicesApi.create(
						{
							tenant_id: organizationId,
							service_type: "surfacescan",
							status: "active",
							settings: {
								duration: "3",
								extended_range: false,
								...(defaultStart ? { contract_start: defaultStart } : {}),
							},
						},
						groupId,
					);
				}
			}
			// DarkRisk360 toggle ON — eredita contract_start da HiCompliance se presente
			if (patch.dark_risk360_enabled === true) {
				const dr = ts.find((s) => s.service_type === "darkrisk");
				if (!dr) {
					const hcSettings =
						(ts.find((s) => s.service_type === "hicompliance")
							?.settings as any) || {};
					const defaultStart = hcSettings.contract_start || "";
					await tenantServicesApi.create(
						{
							tenant_id: organizationId,
							service_type: "darkrisk",
							status: "active",
							settings: {
								tier: darkRiskTier,
								standard_monitor: true,
								extended_identity: darkRiskTier === "extended",
								...(defaultStart ? { contract_start: defaultStart } : {}),
							},
						},
						groupId,
					);
				}
			}
			// Hipatch toggle ON — eredita contract_start da HiCompliance se presente
			if (patch.hipatch_enabled === true) {
				const hp = ts.find((s) => s.service_type === "hipatch");
				if (!hp) {
					const hcSettings =
						(ts.find((s) => s.service_type === "hicompliance")
							?.settings as any) || {};
					const defaultStart = hcSettings.contract_start || "";
					await tenantServicesApi.create(
						{
							tenant_id: organizationId,
							service_type: "hipatch",
							status: "active",
							settings: {
								...(defaultStart ? { contract_start: defaultStart } : {}),
							},
						},
						groupId,
					);
				}
			}
			// HiTrack toggle ON — qui si attiva solo il servizio: il collector Domotz
			// si associa dal backend con hitrack:discover
			if (patch.hitrack_enabled === true) {
				const ht = ts.find((s) => s.service_type === "hitrack");
				if (!ht) {
					const hcSettings =
						(ts.find((s) => s.service_type === "hicompliance")
							?.settings as any) || {};
					const defaultStart = hcSettings.contract_start || "";
					await tenantServicesApi.create(
						{
							tenant_id: organizationId,
							service_type: "hitrack",
							status: "active",
							settings: {
								collector_match_mode: "organization_alias",
								collector_aliases: [],
								sync_interval_minutes: 15,
								data_source: "domotz_public_api",
								...(defaultStart ? { contract_start: defaultStart } : {}),
							},
						},
						groupId,
					);
				}
			}
		},
		onSuccess: () => {
			refetchServices();
			queryClient.invalidateQueries({
				queryKey: ["org-feature-flags", organizationId],
			});
			queryClient.invalidateQueries({
				queryKey: ["sidebar-org-flags", organizationId],
			});
			queryClient.invalidateQueries({
				queryKey: ["darkrisk-v2", organizationId],
			});
			queryClient.invalidateQueries({
				queryKey: ["org-services-hydrate", organizationId, groupId],
			});
			// Also refresh the dashboard's `useServiceIntegrations` so the service tile
			// appears/disappears in realtime when toggled (no manual refresh required).
			queryClient.invalidateQueries({
				queryKey: ["service-integrations", organizationId, groupId],
			});
			toast.success("Configurazione aggiornata");
		},
		onError: (err: Error) => toast.error(`Errore: ${getErrorDetail(err)}`),
	});

	const updateDarkRiskTierMutation = useMutation({
		mutationFn: async (extended: boolean) => {
			if (!organizationId) throw new Error("Nessuna azienda selezionata");
			// Refetch to get fresh tenant-services after main toggle created the service
			const ts = await queryClient.fetchQuery({
				queryKey: ["tenant-services-client", organizationId],
				queryFn: () =>
					tenantServicesApi.listByOrganization(organizationId!, groupId),
			});
			let dr = ts.find((s) => s.service_type === "darkrisk");
			if (!dr) {
				dr = await tenantServicesApi.create(
					{
						tenant_id: organizationId,
						service_type: "darkrisk",
						status: "active",
						settings: {
							tier: extended ? "extended" : "standard",
							standard_monitor: true,
							extended_identity: extended,
						},
					},
					groupId,
				);
			}
			await tenantServicesApi.update(
				dr.id,
				{
					settings: {
						...((dr.settings as Record<string, unknown>) || {}),
						tier: extended ? "extended" : "standard",
						standard_monitor: true,
						extended_identity: extended,
						enabled: true,
					},
				},
				groupId,
			);
		},
		onSuccess: () => {
			refetchServices();
			queryClient.invalidateQueries({
				queryKey: ["darkrisk-esteso-profile", organizationId],
			});
			queryClient.invalidateQueries({
				queryKey: ["darkrisk-v2", organizationId],
			});
			queryClient.invalidateQueries({
				queryKey: ["org-services-hydrate", organizationId, groupId],
			});
			queryClient.invalidateQueries({
				queryKey: ["service-integrations", organizationId, groupId],
			});
			toast.success("Profilo DARKRISK_ESTESO aggiornato");
		},
		onError: (err: Error) =>
			toast.error(`Errore moduli DarkRisk360: ${getErrorDetail(err)}`),
	});

	const contractUpdateMutation = useMutation({
		mutationFn: async ({
			serviceId,
			serviceType,
			contractStart,
			duration,
		}: {
			serviceId: string;
			serviceType: string;
			contractStart: string;
			duration: string;
		}) => {
			if (!organizationId) throw new Error("Nessuna azienda selezionata");
			const ts = await queryClient.fetchQuery({
				queryKey: ["tenant-services-client", organizationId],
				queryFn: () =>
					tenantServicesApi.listByOrganization(organizationId!, groupId),
			});
			const svc = ts.find((s) => s.id === serviceId);
			if (!svc) throw new Error("Servizio non trovato");
			await tenantServicesApi.update(
				serviceId,
				{
					settings: {
						...((svc.settings as any) || {}),
						contract_start: contractStart,
						duration,
					},
				},
				groupId,
			);
		},
		onSuccess: () => {
			refetchServices();
			queryClient.invalidateQueries({
				queryKey: ["service-integrations", organizationId, groupId],
			});
			toast.success("Dettagli contratto aggiornati");
		},
		onError: (err: Error) =>
			toast.error(`Errore contratto: ${getErrorDetail(err)}`),
	});

	// Service catalog (hisolution_services equivalent)
	const { data: services = [] } = useQuery({
		queryKey: ["tenant-services-catalog"],
		queryFn: async () => {
			// /api/config/tenant-services is not yet on the Laravel backend.
			// Fall back to the static service catalog shipped with the frontend.
			let catalog: Record<string, { label?: string }>;
			try {
				catalog = await tenantServicesApi.catalog();
			} catch {
				catalog = Object.fromEntries(
					FALLBACK_SERVICE_CATALOG.map((s) => [
						s.code,
						{ label: s.name, description: s.description, icon: s.icon },
					]),
				);
			}
			return Object.entries(catalog).map(([code, entry]) => ({
				id: code,
				code,
				name: (entry as any).label || code,
			}));
		},
		enabled: open,
	});

	// Integrations = tenant-services list
	const integrations: Integration[] = tenantServices
		.filter((s) => s.status === "active" || !s.status)
		.map((s) => ({
			id: s.id,
			service_id: s.service_type,
			api_url: (s.settings as any)?.api_url || "",
			is_active: s.status === "active" || !s.status,
			service_code: s.service_type,
			service_name: s.service_type,
		}));

	const isLoading = false; // tenant-services query handles loading state

	const connectMutation = useMutation({
		mutationFn: async ({
			serviceId,
			apiUrl: url,
			apiKey: key,
		}: {
			serviceId: string;
			apiUrl: string;
			apiKey: string;
		}) => {
			await tenantServicesApi.create(
				{
					tenant_id: organizationId,
					service_type: serviceId,
					status: "active",
					settings: { api_url: url, api_key: key },
				},
				groupId,
			);
		},
		onSuccess: () => {
			refetchServices();
			queryClient.invalidateQueries({
				queryKey: ["service-integrations", organizationId, groupId],
			});
			toast.success("Servizio collegato con successo");
			setConnectingService(null);
			setApiUrl("");
			setApiKey("");
		},
		onError: (err: Error) => toast.error(`Errore: ${getErrorDetail(err)}`),
	});

	const disconnectMutation = useMutation({
		mutationFn: async (integrationId: string) => {
			await tenantServicesApi.delete(integrationId, groupId);
		},
		onSuccess: () => {
			refetchServices();
			queryClient.invalidateQueries({
				queryKey: ["service-integrations", organizationId, groupId],
			});
			toast.success("Servizio scollegato");
		},
		onError: (err: Error) => toast.error(`Errore: ${getErrorDetail(err)}`),
	});

	const getIntegration = (serviceId: string) =>
		integrations.find((i) => i.service_id === serviceId);

	// Helper: extract contract settings for a service type from tenantServices
	const getContractSettings = (serviceType: string) => {
		const svc = tenantServices.find(
			(s) =>
				s.service_type === serviceType && (s.status === "active" || !s.status),
		);
		if (!svc) return { id: "", contract_start: "", duration: "", endDate: "" };
		const settings = (svc.settings as any) || {};
		const start = settings.contract_start || "";
		const dur = settings.duration || "";
		return {
			id: svc.id,
			contract_start: start,
			duration: dur,
			endDate: calcEndDate(start, dur),
		};
	};

	// Renders the contract detail row for an enabled service
	const renderContractRow = (serviceType: string) => {
		const cs = getContractSettings(serviceType);
		const handleSave = (
			field: "contract_start" | "duration",
			value: string,
		) => {
			if (!cs.id) return;
			const payload =
				field === "contract_start"
					? { contractStart: value, duration: cs.duration }
					: { contractStart: cs.contract_start, duration: value };
			contractUpdateMutation.mutate({
				serviceId: cs.id,
				serviceType,
				...payload,
			});
		};
		return (
      <div className="rounded-md border p-2.5">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">
            Dettagli contratto
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">
              Inizio contratto
            </Label>
            <ContractDateInput
              value={cs.contract_start}
              onSave={(v) => handleSave("contract_start", v)}
              disabled={contractUpdateMutation.isPending}
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Durata</Label>
            <Select
              value={cs.duration || undefined}
              onValueChange={(v) => handleSave("duration", v)}
              disabled={contractUpdateMutation.isPending}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 anno</SelectItem>
                <SelectItem value="2">2 anni</SelectItem>
                <SelectItem value="3">3 anni</SelectItem>
                <SelectItem value="4">4 anni</SelectItem>
                <SelectItem value="5">5 anni</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">
              Fine contratto
            </Label>
            <Input className="h-7 text-xs" value={cs.endDate} disabled />
          </div>
        </div>
      </div>
    );
	};

	const handleConnect = () => {
		if (!connectingService || !apiUrl.trim() || !apiKey.trim()) return;
		connectMutation.mutate({
			serviceId: connectingService.id,
			apiUrl: apiUrl.trim(),
			apiKey: apiKey.trim(),
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Plug className="w-5 h-5" />
						Servizi API — {organizationName}
					</DialogTitle>
					<DialogDescription>
						Collega o scollega i servizi HiSolution per questo cliente
					</DialogDescription>
				</DialogHeader>

				{connectingService ? (
					<div className="space-y-4 py-2">
						<p className="text-sm font-medium">
							Collega {connectingService.name}
						</p>
						<div className="space-y-2">
							<Label htmlFor="client-api-url">URL API</Label>
							<Input
								id="client-api-url"
								placeholder="https://api.example.com/v1"
								value={apiUrl}
								onChange={(e) => setApiUrl(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="client-api-key">Chiave API</Label>
							<Input
								id="client-api-key"
								type="password"
								placeholder="sk-..."
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
							/>
						</div>
						<div className="flex gap-2 justify-end">
							<Button
								variant="outline"
								onClick={() => {
									setConnectingService(null);
									setApiUrl("");
									setApiKey("");
								}}
							>
								Annulla
							</Button>
							<Button
								onClick={handleConnect}
								disabled={
									connectMutation.isPending || !apiUrl.trim() || !apiKey.trim()
								}
							>
								{connectMutation.isPending && (
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								)}
								Collega
							</Button>
						</div>
					</div>
				) : (
					<ScrollArea className="max-h-[500px] pr-2">
						{/* Top-level feature flags */}
						<div className="space-y-3 mb-4">
							{/* HiCompliance */}
							<div className="flex items-center justify-between rounded-md border p-3">
								<div className="flex items-center gap-3">
									<div
										className={`p-1.5 rounded-md ${orgFlags?.hicompliance_enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
									>
										<ShieldCheck className="w-4 h-4" />
									</div>
									<div>
										<p className="text-sm font-medium">HiCompliance</p>
										<p className="text-xs text-muted-foreground">
											Assessment, Analisi, Remediation, Incident
										</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Select
										value={orgFlags?.hicompliance_license || "standard"}
										onValueChange={(value) => {
											updateFlagsMutation.mutate({
												hicompliance_license: value,
											});
										}}
										disabled={
											updateFlagsMutation.isPending ||
											!orgFlags?.hicompliance_enabled
										}
									>
										<SelectTrigger className="h-8 w-[140px]">
											<SelectValue placeholder="Licenza" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="standard">Standard</SelectItem>
											<SelectItem value="extended">Estesa</SelectItem>
										</SelectContent>
									</Select>
									<Switch
										checked={!!orgFlags?.hicompliance_enabled}
										disabled={updateFlagsMutation.isPending}
										onCheckedChange={(v) => {
											const patch: any = { hicompliance_enabled: v };
											if (!v) {
												patch.irp_extended = false;
											}
											updateFlagsMutation.mutate(patch);
										}}
									/>
								</div>
							</div>

							{orgFlags?.hicompliance_enabled && (
								<div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-3">
									{renderContractRow("hicompliance")}
									<div className="flex items-center justify-between rounded-md border p-2.5">
										<div className="flex items-center gap-3">
											<FileCheck className="w-4 h-4 text-muted-foreground" />
											<div>
												<p className="text-sm font-medium">IRP Esteso</p>
												<p className="text-xs text-muted-foreground">
													Playbook avanzati e documento esteso
												</p>
											</div>
										</div>
										<Switch
											checked={!!orgFlags?.irp_extended}
											disabled={updateFlagsMutation.isPending}
											onCheckedChange={(v) =>
												updateFlagsMutation.mutate({ irp_extended: v })
											}
										/>
									</div>
								</div>
							)}

							{/* SurfaceScan360 — independent */}
							<div className="flex items-center justify-between rounded-md border p-3">
								<div className="flex items-center gap-3">
									<div
										className={`p-1.5 rounded-md ${orgFlags?.surface_scan360_enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
									>
										<Radar className="w-4 h-4" />
									</div>
									<div>
										<p className="text-sm font-medium">SurfaceScan360</p>
										<p className="text-xs text-muted-foreground">
											Scansione attack surface esterna
										</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Select
										value={
											orgFlags?.surface_scan_extended ? "extended" : "standard"
										}
										onValueChange={(value) => {
											updateFlagsMutation.mutate({
												surface_scan_extended: value === "extended",
											});
										}}
										disabled={
											updateFlagsMutation.isPending ||
											!orgFlags?.surface_scan360_enabled
										}
									>
										<SelectTrigger className="h-8 w-[140px]">
											<SelectValue placeholder="Livello" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="standard">Standard</SelectItem>
											<SelectItem value="extended">Estesa</SelectItem>
										</SelectContent>
									</Select>
									<Switch
										checked={!!orgFlags?.surface_scan360_enabled}
										disabled={updateFlagsMutation.isPending}
										onCheckedChange={(v) => {
											const patch: any = { surface_scan360_enabled: v };
											if (!v) {
												patch.surface_scan_extended = false;
											}
											updateFlagsMutation.mutate(patch);
										}}
									/>
								</div>
							</div>

							{orgFlags?.surface_scan360_enabled && (
								<div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-3">
									{renderContractRow("surfacescan")}
									<div className="flex items-center justify-between rounded-md border p-2.5">
										<div className="flex items-center gap-3">
											<Radar className="w-4 h-4 text-muted-foreground" />
											<div>
												<p className="text-sm font-medium">
													Livello SurfaceScan360
												</p>
												<p className="text-xs text-muted-foreground">
													{orgFlags?.surface_scan_extended
														? "Estesa: scope principale definito dal cliente, fino a 10 sottodomini orchestrati"
														: "Standard: massimo 4 domini/IP e fino a 10 sottodomini orchestrati"}
												</p>
											</div>
										</div>
										<Badge variant="outline" className="text-xs">
											{orgFlags?.surface_scan_extended ? "Estesa" : "Standard"}
										</Badge>
									</div>

									<div className="flex items-center justify-between rounded-md border p-2.5">
										<div className="flex items-center gap-3">
											<ShieldCheck className="w-4 h-4 text-muted-foreground" />
											<div>
												<p className="text-sm font-medium">
													Validazione attiva CVE
												</p>
												<p className="text-xs text-muted-foreground">
													Sempre attiva di default su tutti i clienti abilitati
													SurfaceScan360
												</p>
											</div>
										</div>
										<Badge
											variant="outline"
											className="text-xs border-green-500/30 text-green-500"
										>
											Sempre attiva
										</Badge>
									</div>
								</div>
							)}

							{/* DarkRisk360 Standard — incluso con HiCompliance o standalone */}
							<div className="flex items-center justify-between rounded-md border p-3">
								<div className="flex items-center gap-3">
									<div
										className={`p-1.5 rounded-md ${orgFlags?.dark_risk360_enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
									>
										<Eye className="w-4 h-4" />
									</div>
									<div>
										<p className="text-sm font-medium">DarkRisk360</p>
										<p className="text-xs text-muted-foreground">
											Monitoraggio settimanale count-only e report mensile
										</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									{orgFlags?.hicompliance_enabled && (
										<Badge variant="outline" className="text-xs">
											Incluso da HiCompliance
										</Badge>
									)}
									{!orgFlags?.hicompliance_enabled &&
										darkRiskEntitlement.extended && (
											<Badge variant="outline" className="text-xs">
												Incluso da Esteso
											</Badge>
										)}
									<Switch
										checked={!!orgFlags?.dark_risk360_enabled}
										disabled={
											updateFlagsMutation.isPending ||
											darkRiskEntitlement.extended ||
											orgFlags?.hicompliance_enabled
										}
										onCheckedChange={async (v) => {
											await updateFlagsMutation.mutateAsync({
												dark_risk360_enabled: v,
												dark_risk_tier: "standard",
											});
										}}
									/>
								</div>
							</div>

							{darkRiskEntitlement.enabled && (
								<div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-3">
									{renderContractRow("darkrisk")}
									<div className="flex items-center justify-between rounded-md border p-2.5">
										<div className="flex items-center gap-3">
											<Calendar className="w-4 h-4 text-muted-foreground" />
											<div>
												<p className="text-sm font-medium">
													Automazione Standard
												</p>
												<p className="text-xs text-muted-foreground">
													Scansione settimanale e report mensile
												</p>
											</div>
										</div>
										<Badge variant="outline" className="text-xs">
											Attiva
										</Badge>
									</div>
								</div>
							)}

							{/* DarkRisk360 Esteso — modulo spot separato; include sempre Standard */}
							<div className="flex items-center justify-between rounded-md border border-violet-500/20 p-3">
								<div className="flex items-center gap-3">
									<div
										className={`p-1.5 rounded-md ${darkRiskEntitlement.extended ? "bg-violet-500/10 text-violet-400" : "bg-muted text-muted-foreground"}`}
									>
										<ShieldAlert className="w-4 h-4" />
									</div>
									<div>
										<p className="text-sm font-medium">DarkRisk360 Esteso</p>
										<p className="text-xs text-muted-foreground">
											Identity spot con evidenze e password; include DarkRisk360
											Standard
										</p>
									</div>
								</div>
								<Switch
									checked={darkRiskEntitlement.extended}
									disabled={updateDarkRiskTierMutation.isPending}
									onCheckedChange={(enabled) =>
										updateDarkRiskTierMutation.mutate(enabled)
									}
								/>
							</div>

							{darkRiskEntitlement.extended && (
								<div className="ml-4 flex items-center justify-between rounded-md border border-violet-500/15 p-2.5">
									<div>
										<p className="text-sm font-medium">Modalità operativa</p>
										<p className="text-xs text-muted-foreground">
											Solo scansioni spot avviate da admin o superadmin; nessun
											cron Esteso
										</p>
									</div>
									<Badge className="bg-violet-500/15 text-violet-300">
										Identity attiva
									</Badge>
								</div>
							)}

							{/* Hipatch — independent */}
							<div className="flex items-center justify-between rounded-md border p-3">
								<div className="flex items-center gap-3">
									<div
										className={`p-1.5 rounded-md ${orgFlags?.hipatch_enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
									>
										<Shield className="w-4 h-4" />
									</div>
									<div>
										<p className="text-sm font-medium">HiPatch</p>
										<p className="text-xs text-muted-foreground">
											Patch management e vulnerability remediation
										</p>
									</div>
								</div>
								<Switch
									checked={!!orgFlags?.hipatch_enabled}
									disabled={updateFlagsMutation.isPending}
									onCheckedChange={(v) => {
										updateFlagsMutation.mutate({ hipatch_enabled: v });
									}}
								/>
							</div>

							{orgFlags?.hipatch_enabled && (
								<div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-3">
									{renderContractRow("hipatch")}
								</div>
							)}

							<div className="flex items-center justify-between rounded-md border p-3">
								<div className="flex items-center gap-3">
									<div
										className={`p-1.5 rounded-md ${orgFlags?.hitrack_enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
									>
										<Activity className="w-4 h-4" />
									</div>
									<div>
										<p className="text-sm font-medium">HiTrack</p>
										<p className="text-xs text-muted-foreground">
											Servizio gestito HiSolution connesso con Domotz
										</p>
									</div>
								</div>
								<Switch
									checked={!!orgFlags?.hitrack_enabled}
									disabled={updateFlagsMutation.isPending}
									onCheckedChange={(v) => {
										updateFlagsMutation.mutate({ hitrack_enabled: v });
									}}
								/>
							</div>

							{orgFlags?.hitrack_enabled && (
								<div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-3">
									{renderContractRow("hitrack")}
									<div className="flex items-center justify-between rounded-md border p-2.5">
										<div className="flex items-center gap-3">
											<Activity className="w-4 h-4 text-muted-foreground" />
											<div>
												<p className="text-sm font-medium">Sincronizzazione runtime</p>
												<p className="text-xs text-muted-foreground">
													Discovery collector + ingest metriche Domotz ogni 15 minuti
												</p>
											</div>
										</div>
										<Badge variant="outline" className="text-xs">
											15 minuti
										</Badge>
									</div>
									<div className="flex items-center justify-between rounded-md border p-2.5">
										<div className="flex items-center gap-3">
											<Database className="w-4 h-4 text-muted-foreground" />
											<div>
												<p className="text-sm font-medium">Data Coverage</p>
												<p className="text-xs text-muted-foreground">
													RAM e dischi sono mostrati solo quando la Public API espone metriche quantitative verificate
												</p>
											</div>
										</div>
										<Badge variant="outline" className="text-xs">
											Domotz Public API
										</Badge>
									</div>
								</div>
							)}
						</div>
					</ScrollArea>
				)}
			</DialogContent>
		</Dialog>
	);
};

export default ClientServicesDialog;
