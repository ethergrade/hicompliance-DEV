import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
	Shield,
	Smartphone,
	ShieldBan,
	Download,
	FileText,
	Key,
	Mail,
	Plus,
	Settings,
	Trash2,
	AlertTriangle,
} from "lucide-react";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { ClientSelectionGuard } from "@/components/guards/ClientSelectionGuard";
import { IntegrationAuditLog } from "@/components/integrations/IntegrationAuditLog";
import { useUserRoles } from "@/hooks/useUserRoles";
import { integrationsApi, tenantServicesApi } from "@/lib/api";
import type { IntegrationResource, ServiceCatalogItem } from "@/types/api";

interface IntegrationFormData {
	service_id: string;
	api_url: string;
	api_key: string;
	api_methods: string;
	is_active: boolean;
}

type IconComponent = React.FC<React.SVGProps<SVGSVGElement>>;
const iconMap: Record<string, IconComponent> = {
	shield: Shield,
	smartphone: Smartphone,
	"shield-ban": ShieldBan,
	download: Download,
	"file-text": FileText,
	key: Key,
	mail: Mail,
};

const Integrations = () => {
	const [selectedIntegration, setSelectedIntegration] =
		useState<IntegrationResource | null>(null);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const {
		organizationId,
		groupId,
		needsClientSelection,
		selectedOrganization,
	} = useClientOrganization();
	const { isSuperAdmin, loading: rolesLoading } = useUserRoles();

	// HiPatch-specific form state
	const [hipatchFields, setHipatchFields] = useState({
		connectsecure_company_id: "",
		connectsecure_client_auth_token: "",
		connectsecure_pod: "",
		ninjaone_organization_id: "",
		ninjaone_organization_id_client: "",
		ninjaone_organization_secret: "",
	});

	// HiTrack: l'unica cosa da configurare è quale collector Domotz guardare.
	// Il numero si trova con `hitrack:discover`, o sulla dashboard Domotz.
	const [hitrackFields, setHitrackFields] = useState({
		domotz_agent_id: "",
	});

	// Inizio e durata del contratto, comuni ai servizi configurabili da qui:
	// stesse chiavi che il dialog dei servizi usa per gli altri moduli, e che il
	// backend promuove a colonna per calcolare la scadenza.
	const [contractFields, setContractFields] = useState({
		contract_start: "",
		duration: "",
	});

	const form = useForm<IntegrationFormData>({
		defaultValues: {
			service_id: "",
			api_url: "",
			api_key: "",
			api_methods: "{}",
			is_active: true,
		},
	});

	const watchedServiceId = form.watch("service_id");

	const { data: services = [] } = useQuery({
		queryKey: ["hisolution-services"],
		queryFn: integrationsApi.catalog,
	});

	// Derive service code from selected service_id for conditional rendering
	const selectedServiceCode = useMemo(() => {
		if (!watchedServiceId) return null;
		const fromCatalog = services.find((s) => s.id === watchedServiceId)?.code;
		if (fromCatalog) return fromCatalog;
		// When editing, the service_id is a UUID that may not be in the fallback catalog.
		// Fall back to the selected integration's own service_code.
		if (
			selectedIntegration &&
			selectedIntegration.service_id === watchedServiceId
		) {
			return selectedIntegration.service_code;
		}
		return null;
	}, [watchedServiceId, services, selectedIntegration]);

	const isHipatch = selectedServiceCode === "hipatch";
	const isHitrack = selectedServiceCode === "hitrack";
	// Entrambi vivono in tenant_services, non in organization_integrations: non
	// hanno una chiave API propria, ma la configurazione di un servizio.
	const isTenantService = isHipatch || isHitrack;

	const { data: integrations = [] } = useQuery({
		queryKey: ["organization-integrations", organizationId, groupId],
		queryFn: async () => {
			if (!organizationId) return [];
			return integrationsApi.listByOrganization(organizationId, groupId);
		},
		enabled: !!organizationId,
	});

	// Fetch HiPatch tenant-service for scenario detection (exists vs not)
	const { data: hipatchServices = [] } = useQuery({
		queryKey: ["tenant-services-hipatch", organizationId, groupId],
		enabled: !!organizationId,
		queryFn: async () => {
			if (!organizationId) return [];
			const all = await tenantServicesApi.listByOrganization(
				organizationId,
				groupId,
			);
			return all.filter(
				(s) => s.service_type === "hipatch" && s.tenant_id === organizationId,
			);
		},
	});

	const existingHipatch =
		hipatchServices.length > 0 ? hipatchServices[0] : null;

	const { data: hitrackServices = [] } = useQuery({
		queryKey: ["tenant-services-hitrack", organizationId, groupId],
		enabled: !!organizationId,
		queryFn: async () => {
			if (!organizationId) return [];
			const all = await tenantServicesApi.listByOrganization(
				organizationId,
				groupId,
			);
			return all.filter(
				(s) => s.service_type === "hitrack" && s.tenant_id === organizationId,
			);
		},
	});

	const existingHitrack =
		hitrackServices.length > 0 ? hitrackServices[0] : null;

	// La card "Nessuna integrazione configurata" si mostra SOLO se non esiste
	// nessuna integrazione (né attiva né inattiva). Se c'è almeno un record,
	// le card sopra sono già visibili e quella vuota è ridondante.
	const hasAnyIntegration = useMemo(() => {
		return (
			integrations.length > 0 ||
			hipatchServices.length > 0 ||
			hitrackServices.length > 0
		);
	}, [integrations, hipatchServices, hitrackServices]);

	const createOrUpdateMutation = useMutation({
		mutationFn: async (data: IntegrationFormData) => {
			if (!organizationId)
				throw new Error("Nessuna organizzazione selezionata");

			if (isTenantService) {
				// Il contratto viaggia dentro settings: il backend promuove
				// contract_start e duration a colonna, ed è da lì che si calcola
				// se il servizio è ancora attivo.
				const contratto = {
					...(contractFields.contract_start
						? { contract_start: contractFields.contract_start }
						: {}),
					...(contractFields.duration
						? { duration: contractFields.duration }
						: {}),
				};

				const settings = isHipatch
					? {
							connectsecure_company_id: hipatchFields.connectsecure_company_id,
							connectsecure_client_auth_token:
								hipatchFields.connectsecure_client_auth_token,
							connectsecure_pod: hipatchFields.connectsecure_pod,
							ninjaone_organization_id: hipatchFields.ninjaone_organization_id,
							ninjaone_organization_id_client:
								hipatchFields.ninjaone_organization_id_client,
							ninjaone_organization_secret:
								hipatchFields.ninjaone_organization_secret,
							...contratto,
						}
					: {
							// Le altre chiavi le scrive il dialog dei servizi; qui si
							// dichiara solo il collector, che è ciò che manca al backend
							// per sapere quale rete guardare.
							...((existingHitrack?.settings as Record<string, unknown>) ?? {}),
							domotz_agent_id: Number(hitrackFields.domotz_agent_id) || null,
							...contratto,
						};

				const esistente = isHipatch ? existingHipatch : existingHitrack;

				if (esistente) {
					return tenantServicesApi.patch(esistente.id, { settings }, groupId);
				}

				return tenantServicesApi.create(
					{
						tenant_id: organizationId,
						service_type: isHipatch ? "hipatch" : "hitrack",
						status: "active",
						settings,
					},
					groupId,
				);
			}

			const api_methods: Record<string, unknown> = JSON.parse(
				data.api_methods || "[]",
			);
			const api_url = data.api_url;

			const payload = {
				service_id: data.service_id,
				api_url,
				api_key: data.api_key,
				api_methods,
				is_active: data.is_active,
			};
			if (selectedIntegration) {
				return integrationsApi.update(
					organizationId,
					selectedIntegration.id,
					payload,
					groupId,
				);
			}
			return integrationsApi.create(organizationId, payload, groupId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["organization-integrations", organizationId],
			});
			queryClient.invalidateQueries({
				queryKey: ["tenant-services-hipatch", organizationId, groupId],
			});
			queryClient.invalidateQueries({
				queryKey: ["tenant-services-hitrack", organizationId, groupId],
			});
			setIsDialogOpen(false);
			setSelectedIntegration(null);
			form.reset();
			toast({
				title: "Successo",
				description: selectedIntegration
					? "Integrazione aggiornata con successo"
					: "Integrazione creata con successo",
			});
		},
		onError: (error) => {
			toast({
				title: "Errore",
				description:
					error instanceof Error ? error.message : "Operazione non riuscita",
				variant: "destructive",
			});
		},
	});

	const deleteIntegrationMutation = useMutation({
		mutationFn: async (integrationId: string) => {
			if (!organizationId)
				throw new Error("Nessuna organizzazione selezionata");
			if (isHipatch && existingHipatch) {
				await tenantServicesApi.delete(existingHipatch.id, groupId);
			} else if (isHitrack && existingHitrack) {
				await tenantServicesApi.delete(existingHitrack.id, groupId);
			} else {
				await integrationsApi.delete(organizationId, integrationId, groupId);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["organization-integrations", organizationId],
			});
			queryClient.invalidateQueries({
				queryKey: ["tenant-services-hipatch", organizationId, groupId],
			});
			queryClient.invalidateQueries({
				queryKey: ["tenant-services-hitrack", organizationId, groupId],
			});
			toast({
				title: "Successo",
				description: "Integrazione eliminata con successo",
			});
		},
		onError: (error) => {
			toast({
				title: "Errore",
				description:
					error instanceof Error ? error.message : "Operazione non riuscita",
				variant: "destructive",
			});
		},
	});

	const openHipatchDialog = () => {
		const hpCatalog = services.find((s) => s.code === "hipatch");
		const integrationLike = {
			id: existingHipatch?.id ?? "",
			organization_id: organizationId ?? "",
			service_id: hpCatalog?.id ?? "hipatch",
			service_code: "hipatch",
			service_name: "hipatch",
			api_url: "",
			is_active: existingHipatch?.status === "active",
		} as IntegrationResource;
		openDialog(integrationLike);
	};

	const openHitrackDialog = () => {
		const htCatalog = services.find((s) => s.code === "hitrack");
		openDialog({
			id: existingHitrack?.id ?? "",
			organization_id: organizationId ?? "",
			service_id: htCatalog?.id ?? "hitrack",
			service_code: "hitrack",
			service_name: "hitrack",
			api_url: "",
			is_active: existingHitrack?.status === "active",
		} as IntegrationResource);
	};

	const openDialog = (integration?: IntegrationResource) => {
		if (integration) {
			setSelectedIntegration(integration);
			form.reset({
				service_id: integration.service_id,
				api_url: integration.api_url,
				api_key: "",
				api_methods: JSON.stringify(integration.api_methods ?? [], null, 2),
				is_active: integration.is_active,
			});
			// Populate HiPatch fields from tenant-service settings (not integrations api_methods)
			if (integration.service_code === "hipatch" || existingHipatch) {
				const settings = existingHipatch?.settings ?? {};
				const s = settings as Record<string, unknown>;
				setHipatchFields({
					connectsecure_company_id: String(s.connectsecure_company_id ?? ""),
					connectsecure_client_auth_token: String(
						s.connectsecure_client_auth_token ?? "",
					),
					connectsecure_pod: String(s.connectsecure_pod ?? ""),
					ninjaone_organization_id: String(s.ninjaone_organization_id ?? ""),
					ninjaone_organization_id_client: String(
						s.ninjaone_organization_id_client ?? "",
					),
					ninjaone_organization_secret: String(
						s.ninjaone_organization_secret ?? "",
					),
				});
			} else {
				setHipatchFields({
					connectsecure_company_id: "",
					connectsecure_client_auth_token: "",
					connectsecure_pod: "",
					ninjaone_organization_id: "",
					ninjaone_organization_id_client: "",
					ninjaone_organization_secret: "",
				});
			}

			const servizio =
				integration.service_code === "hitrack"
					? existingHitrack
					: integration.service_code === "hipatch"
						? existingHipatch
						: null;
			const s = (servizio?.settings ?? {}) as Record<string, unknown>;

			setHitrackFields({
				domotz_agent_id:
					integration.service_code === "hitrack" && s.domotz_agent_id
						? String(s.domotz_agent_id)
						: "",
			});
			setContractFields({
				contract_start: String(s.contract_start ?? ""),
				duration: String(s.duration ?? ""),
			});
		} else {
			setSelectedIntegration(null);
			form.reset({
				service_id: "",
				api_url: "",
				api_key: "",
				api_methods: "[]",
				is_active: true,
			});
			setHipatchFields({
				connectsecure_company_id: "",
				connectsecure_client_auth_token: "",
				connectsecure_pod: "",
				ninjaone_organization_id: "",
				ninjaone_organization_id_client: "",
				ninjaone_organization_secret: "",
			});
			setHitrackFields({ domotz_agent_id: "" });
			setContractFields({ contract_start: "", duration: "" });
		}
		setIsDialogOpen(true);
	};

	const onSubmit = (data: IntegrationFormData) => {
		createOrUpdateMutation.mutate(data);
	};

	// Trello #41.4.8: only hipatch is currently offered to clients.
	// Other services remain visible/editable in the integrations list below
	// (so existing records can be deleted) but are excluded from the "add new"
	// dropdown until they are officially supported.
	const availableServices = services.filter(
		(service) =>
			(service.code === "hipatch" || service.code === "hitrack") &&
			!integrations.some(
				(integration) =>
					integration.service_id === service.id ||
					integration.service_code === service.code,
			) &&
			!(service.code === "hipatch" && existingHipatch) &&
			!(service.code === "hitrack" && existingHitrack),
	);

	const getServiceMeta = (
		integration: IntegrationResource,
	): ServiceCatalogItem | undefined =>
		services.find((service) => service.id === integration.service_id) ||
		services.find((service) => service.code === integration.service_code) ||
		(integration.service_name
			? {
					id: integration.service_id,
					code: integration.service_code,
					name: integration.service_name,
					description: undefined,
					icon: undefined,
				}
			: undefined);

	if (!rolesLoading && !isSuperAdmin) {
		return (
			<DashboardLayout>
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-12">
						<AlertTriangle className="w-12 h-12 text-destructive mb-4" />
						<h3 className="text-lg font-semibold mb-2">
							Accesso non autorizzato
						</h3>
						<p className="text-muted-foreground text-center">
							Solo gli utenti Super Admin possono accedere alla configurazione
							delle integrazioni API.
						</p>
					</CardContent>
				</Card>
			</DashboardLayout>
		);
	}

	if (needsClientSelection) {
		return (
			<DashboardLayout>
				<ClientSelectionGuard>
					<div />
				</ClientSelectionGuard>
			</DashboardLayout>
		);
	}

	return (
		<DashboardLayout>
			<div className="space-y-6">
				<div className="flex justify-between items-center">
					<div>
						<h1 className="text-3xl font-bold tracking-tight">
							Integrazioni HiConsole
						</h1>
						<p className="text-muted-foreground mt-2">
							Configura le integrazioni backend per il cliente selezionato
						</p>
					</div>
					<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
						<DialogTrigger asChild>
							<Button onClick={() => openDialog()}>
								<Plus className="w-4 h-4 mr-2" />
								Nuova Integrazione
							</Button>
						</DialogTrigger>
						<DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
							<DialogHeader className="flex-shrink-0">
								<DialogTitle>
									{selectedIntegration
										? "Modifica Integrazione"
										: "Nuova Integrazione"}
								</DialogTitle>
								<DialogDescription>
									Configura i dettagli per l&apos;integrazione con il servizio
									HiSolution
								</DialogDescription>
							</DialogHeader>
							<Form {...form}>
								<form
									onSubmit={form.handleSubmit(onSubmit)}
									className="space-y-4 overflow-y-auto flex-1 pr-1"
								>
									<FormField
										control={form.control}
										name="service_id"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Servizio</FormLabel>
												<FormControl>
													<select
														{...field}
														className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
														disabled={!!selectedIntegration}
													>
														<option value="">Seleziona un servizio</option>
														{(selectedIntegration
															? services
															: availableServices
														).map((service) => (
															<option key={service.id} value={service.id}>
																{service.name}{" "}
																{service.description
																	? `- ${service.description}`
																	: ""}
															</option>
														))}
													</select>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									{(watchedServiceId || selectedIntegration) && (
										<>
											<FormField
												control={form.control}
												name="api_url"
												render={({ field }) =>
													isTenantService ? null : (
														<FormItem>
															<FormLabel>URL API</FormLabel>
															<FormControl>
																<Input
																	{...field}
																	placeholder="https://api.hisolution.com/v1"
																	type="url"
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)
												}
											/>
											<FormField
												control={form.control}
												name="api_key"
												render={({ field }) =>
													isTenantService ? null : (
														<FormItem>
															<FormLabel>Chiave API</FormLabel>
															<FormControl>
																<Input
																	{...field}
																	placeholder="Inserisci la chiave API"
																	type="password"
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)
												}
											/>
											<FormField
												control={form.control}
												name="api_methods"
												render={({ field }) =>
													isTenantService ? null : (
														<FormItem>
															<FormLabel>
																Metodi API (JSON array/object)
															</FormLabel>
															<FormControl>
																<Textarea
																	{...field}
																	placeholder='["GET /status", "POST /alerts"]'
																	rows={4}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)
												}
											/>

											{/* HiTrack: quale collector Domotz guardare */}
											{isHitrack && (
												<FormItem>
													<FormLabel>Collector Domotz (agent ID)</FormLabel>
													<FormControl>
														<Input
															value={hitrackFields.domotz_agent_id}
															onChange={(e) =>
																setHitrackFields({
																	domotz_agent_id: e.target.value.replace(
																		/\D/g,
																		"",
																	),
																})
															}
															placeholder="es. 323061"
															inputMode="numeric"
														/>
													</FormControl>
													<p className="text-xs text-muted-foreground">
														È la sonda installata nella rete del cliente. Il
														numero si trova sulla dashboard Domotz, o con{" "}
														<code>hitrack:discover</code>. Lo stesso collector
														non può essere assegnato a due clienti.
													</p>
												</FormItem>
											)}

											{/* HiPatch-specific fields */}
											{isHipatch && (
												<>
													<FormItem>
														<FormLabel>ConnectSecure Company ID</FormLabel>
														<FormControl>
															<Input
																value={hipatchFields.connectsecure_company_id}
																onChange={(e) =>
																	setHipatchFields((prev) => ({
																		...prev,
																		connectsecure_company_id: e.target.value,
																	}))
																}
																placeholder="ID cliente su ConnectSecure"
															/>
														</FormControl>
													</FormItem>
													<FormItem>
														<FormLabel>
															ConnectSecure Client Auth Token
														</FormLabel>
														<FormControl>
															<Input
																value={
																	hipatchFields.connectsecure_client_auth_token
																}
																onChange={(e) =>
																	setHipatchFields((prev) => ({
																		...prev,
																		connectsecure_client_auth_token:
																			e.target.value,
																	}))
																}
																placeholder="Token di autenticazione client ConnectSecure (opzionale)"
																type="password"
															/>
														</FormControl>
													</FormItem>
													<FormItem>
														<FormLabel>ConnectSecure Pod (URL)</FormLabel>
														<FormControl>
															<Input
																value={hipatchFields.connectsecure_pod}
																onChange={(e) =>
																	setHipatchFields((prev) => ({
																		...prev,
																		connectsecure_pod: e.target.value,
																	}))
																}
																placeholder="URL del pod ConnectSecure (opzionale)"
															/>
														</FormControl>
													</FormItem>
													<FormItem>
														<FormLabel>NinjaOne Organization ID</FormLabel>
														<FormControl>
															<Input
																value={hipatchFields.ninjaone_organization_id}
																onChange={(e) =>
																	setHipatchFields((prev) => ({
																		...prev,
																		ninjaone_organization_id: e.target.value,
																	}))
																}
																placeholder="ID cliente su NinjaOne"
															/>
														</FormControl>
													</FormItem>
													<FormItem>
														<FormLabel>NinjaOne Client ID (API)</FormLabel>
														<FormControl>
															<Input
																value={
																	hipatchFields.ninjaone_organization_id_client
																}
																onChange={(e) =>
																	setHipatchFields((prev) => ({
																		...prev,
																		ninjaone_organization_id_client:
																			e.target.value,
																	}))
																}
																placeholder="ID client API NinjaOne"
																type="password"
															/>
														</FormControl>
													</FormItem>
													<FormItem>
														<FormLabel>NinjaOne Secret (API)</FormLabel>
														<FormControl>
															<Input
																value={
																	hipatchFields.ninjaone_organization_secret
																}
																onChange={(e) =>
																	setHipatchFields((prev) => ({
																		...prev,
																		ninjaone_organization_secret:
																			e.target.value,
																	}))
																}
																placeholder="Secret API NinjaOne"
																type="password"
															/>
														</FormControl>
													</FormItem>
												</>
											)}
											{/* Contratto: stesse chiavi degli altri servizi, da cui
											    il backend ricava se il servizio è ancora attivo. */}
											{isTenantService && (
												<div className="grid grid-cols-2 gap-4">
													<FormItem>
														<FormLabel>Inizio contratto</FormLabel>
														<FormControl>
															<Input
																type="date"
																value={contractFields.contract_start}
																onChange={(e) =>
																	setContractFields((prev) => ({
																		...prev,
																		contract_start: e.target.value,
																	}))
																}
															/>
														</FormControl>
													</FormItem>
													<FormItem>
														<FormLabel>Durata (anni)</FormLabel>
														<FormControl>
															<Input
																type="number"
																min={1}
																value={contractFields.duration}
																onChange={(e) =>
																	setContractFields((prev) => ({
																		...prev,
																		duration: e.target.value,
																	}))
																}
																placeholder="es. 3"
															/>
														</FormControl>
														<p className="text-xs text-muted-foreground">
															Senza durata il servizio non scade mai.
														</p>
													</FormItem>
												</div>
											)}

											<FormField
												control={form.control}
												name="is_active"
												render={({ field }) => (
													<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
														<div className="space-y-0.5">
															<FormLabel className="text-base">
																Attiva
															</FormLabel>
															<div className="text-sm text-muted-foreground">
																Abilita questa integrazione
															</div>
														</div>
														<FormControl>
															<Switch
																checked={field.value}
																onCheckedChange={field.onChange}
															/>
														</FormControl>
													</FormItem>
												)}
											/>
										</>
									)}
									<DialogFooter className="flex-shrink-0 pt-2">
										<Button
											type="submit"
											disabled={createOrUpdateMutation.isPending}
										>
											{createOrUpdateMutation.isPending
												? "Salvando..."
												: "Salva"}
										</Button>
									</DialogFooter>
								</form>
							</Form>
						</DialogContent>
					</Dialog>
				</div>

				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{/* HiPatch integrations live in tenant_services (not organization_integrations).
              Render them here so users see + can edit/delete their saved hipatch config. */}
					{hipatchServices.map((hp) => {
						const hpSettings = (hp.settings ?? {}) as Record<string, unknown>;
						const tokenSet = !!hpSettings.connectsecure_client_auth_token;
						const podSet = !!hpSettings.connectsecure_pod;
						return (
							<Card key={`hipatch-${hp.id}`} className="relative">
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
									<CardTitle className="text-sm font-medium flex items-center gap-2">
										<Shield className="w-4 h-4" />
										HiPatch
									</CardTitle>
									<Badge
										variant={hp.status === "active" ? "default" : "secondary"}
									>
										{hp.status === "active" ? "Attiva" : "Inattiva"}
									</Badge>
								</CardHeader>
								<CardContent>
									{selectedOrganization?.name && (
										<p className="text-xs text-muted-foreground mb-2 font-medium">
											{selectedOrganization.name}
										</p>
									)}
									<CardDescription className="mb-3">
										Configurazione servizio HiPatch (tenant-service)
									</CardDescription>
									<div className="space-y-2 text-sm">
										<div>
											<Label className="text-xs text-muted-foreground">
												ConnectSecure Company ID
											</Label>
											<p className="font-mono text-xs bg-muted p-1 rounded truncate">
												{hpSettings.connectsecure_company_id || (
													<span className="text-muted-foreground italic">
														non impostato
													</span>
												)}
											</p>
										</div>
										<div>
											<Label className="text-xs text-muted-foreground">
												ConnectSecure Client Auth Token
											</Label>
											<p className="font-mono text-xs bg-muted p-1 rounded truncate">
												{tokenSet ? (
													"••••••••"
												) : (
													<span className="text-muted-foreground italic">
														non impostato
													</span>
												)}
											</p>
										</div>
										<div>
											<Label className="text-xs text-muted-foreground">
												ConnectSecure Pod
											</Label>
											<p className="font-mono text-xs bg-muted p-1 rounded truncate">
												{podSet ? (
													hpSettings.connectsecure_pod
												) : (
													<span className="text-muted-foreground italic">
														non impostato
													</span>
												)}
											</p>
										</div>
									</div>
									<div className="flex gap-2 mt-4">
										<Button
											variant="outline"
											size="sm"
											className="flex-1"
											onClick={openHipatchDialog}
										>
											<Settings className="w-4 h-4 mr-2" /> Configura
										</Button>
									</div>
								</CardContent>
							</Card>
						);
					})}

					{/* Anche HiTrack vive in tenant_services: il collector Domotz è la
					    sola cosa da dichiarare, il resto lo scopre la sincronizzazione. */}
					{hitrackServices.map((ht) => {
						const htSettings = (ht.settings ?? {}) as Record<string, unknown>;
						return (
							<Card key={`hitrack-${ht.id}`} className="relative">
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
									<CardTitle className="text-sm font-medium flex items-center gap-2">
										<Shield className="w-4 h-4" />
										HiTrack
									</CardTitle>
									<Badge
										variant={ht.status === "active" ? "default" : "secondary"}
									>
										{ht.status === "active" ? "Attiva" : "Inattiva"}
									</Badge>
								</CardHeader>
								<CardContent>
									{selectedOrganization?.name && (
										<p className="text-xs text-muted-foreground mb-2 font-medium">
											{selectedOrganization.name}
										</p>
									)}
									<CardDescription className="mb-3">
										Configurazione servizio HiTrack (tenant-service)
									</CardDescription>
									<div className="space-y-2 text-sm">
										<div>
											<Label className="text-xs text-muted-foreground">
												Collector Domotz (agent ID)
											</Label>
											<p className="font-mono text-xs bg-muted p-1 rounded truncate">
												{htSettings.domotz_agent_id ? (
													String(htSettings.domotz_agent_id)
												) : (
													<span className="text-muted-foreground italic">
														non impostato
													</span>
												)}
											</p>
										</div>
										<div>
											<Label className="text-xs text-muted-foreground">
												Contratto
											</Label>
											<p className="font-mono text-xs bg-muted p-1 rounded truncate">
												{htSettings.contract_start ? (
													<>
														{String(htSettings.contract_start)}
														{htSettings.duration
															? ` · ${htSettings.duration} anni`
															: " · senza scadenza"}
													</>
												) : (
													<span className="text-muted-foreground italic">
														non impostato
													</span>
												)}
											</p>
										</div>
									</div>
									<div className="flex gap-2 mt-4">
										<Button
											variant="outline"
											size="sm"
											className="flex-1"
											onClick={openHitrackDialog}
										>
											<Settings className="w-4 h-4 mr-2" /> Configura
										</Button>
									</div>
								</CardContent>
							</Card>
						);
					})}

					{integrations.map((integration) => {
						const service = getServiceMeta(integration);
						const IconComponent = iconMap[service?.icon || ""] || Settings;
						return (
							<Card key={integration.id} className="relative">
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
									<CardTitle className="text-sm font-medium flex items-center gap-2">
										<IconComponent className="w-4 h-4" />
										{service?.name ||
											integration.service_name ||
											integration.service_id}
									</CardTitle>
									<Badge
										variant={integration.is_active ? "default" : "secondary"}
									>
										{integration.is_active ? "Attiva" : "Inattiva"}
									</Badge>
								</CardHeader>
								<CardContent>
									{selectedOrganization?.name && (
										<p className="text-xs text-muted-foreground mb-2 font-medium">
											{selectedOrganization.name}
										</p>
									)}
									<CardDescription className="mb-3">
										{service?.description ||
											"Configurazione integrazione backend"}
									</CardDescription>
									<div className="space-y-2 text-sm">
										<div>
											<Label className="text-xs text-muted-foreground">
												URL API
											</Label>
											<p className="font-mono text-xs bg-muted p-1 rounded truncate">
												{integration.api_url}
											</p>
										</div>
										<div>
											<Label className="text-xs text-muted-foreground">
												Metodi configurati
											</Label>
											<p className="text-xs">
												{Array.isArray(integration.api_methods)
													? integration.api_methods.length
													: Object.keys(integration.api_methods || {})
															.length}{" "}
												metodi
											</p>
										</div>
									</div>
									<div className="flex gap-2 mt-4">
										<Button
											variant="outline"
											size="sm"
											className="flex-1"
											onClick={() => openDialog(integration)}
										>
											<Settings className="w-4 h-4 mr-2" /> Configura
										</Button>
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													variant="outline"
													size="sm"
													className="text-destructive hover:text-destructive hover:bg-destructive/10"
												>
													<Trash2 className="w-4 h-4" />
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>
														Elimina integrazione
													</AlertDialogTitle>
													<AlertDialogDescription>
														Sei sicuro di voler eliminare l&apos;integrazione
														con{" "}
														<strong>
															{service?.name ||
																integration.service_name ||
																integration.service_id}
														</strong>
														?<br />
														Questa azione non può essere annullata.
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>Annulla</AlertDialogCancel>
													<AlertDialogAction
														onClick={() =>
															deleteIntegrationMutation.mutate(integration.id)
														}
														className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
													>
														{deleteIntegrationMutation.isPending
															? "Eliminando..."
															: "Elimina"}
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									</div>
								</CardContent>
							</Card>
						);
					})}
				</div>

				{!hasAnyIntegration && (
					<Card>
						<CardContent className="flex flex-col items-center justify-center py-12">
							<Settings className="w-12 h-12 text-muted-foreground mb-4" />
							<h3 className="text-lg font-semibold mb-2">
								Nessuna integrazione configurata
							</h3>
							<p className="text-muted-foreground text-center mb-4">
								Inizia configurando la tua prima integrazione con i servizi
								HiSolution
							</p>
							<Button onClick={() => openDialog()}>
								<Plus className="w-4 h-4 mr-2" />
								Configura prima integrazione
							</Button>
						</CardContent>
					</Card>
				)}

				<IntegrationAuditLog
					organizationId={organizationId}
					groupId={groupId}
				/>
			</div>
		</DashboardLayout>
	);
};

export default Integrations;
