import {
	Activity,
	CalendarClock,
	DatabaseZap,
	Gauge,
	RefreshCw,
	Target,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAuth } from "@/components/auth/AuthProvider";
import { darkRiskGateway } from "../api/darkRiskGateway";
import { darkRiskQueryKeys } from "../api/queryKeys";
import { ReportList } from "../shared/ReportList";
import { ScopeEditor } from "../shared/ScopeEditor";
import { useDarkRiskEntitlements } from "../shared/useDarkRiskEntitlements";
import { SurfaceScanExposureSection } from "@/components/surface-scan/SurfaceScanExposureSection";

const formatDate = (value: string | null) =>
	value
		? new Intl.DateTimeFormat("it-IT", {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(new Date(value))
		: "Mai eseguita";

export default function StandardDarkRiskPage() {
	const [activeTab, setActiveTab] = useState<"overview" | "exposure">("overview");
	const { organizationId, groupId, selectedOrganization } = useClientOrganization();
	const { isSuperAdmin } = useUserRoles();
	const { user } = useAuth();
	const {
		standardEnabled,
		extendedEnabled,
		isLoading: entitlementsLoading,
		isError: isEntitlementError,
	} = useDarkRiskEntitlements(organizationId, groupId);
	const canManage = isSuperAdmin || user?.user_type === "admin";
	const queryClient = useQueryClient();

	const scopeQuery = useQuery({
		queryKey: darkRiskQueryKeys.scope(organizationId),
		queryFn: () => darkRiskGateway.getScope(organizationId!, groupId),
		enabled: Boolean(organizationId && standardEnabled),
		staleTime: 60_000,
	});
	const overviewQuery = useQuery({
		queryKey: darkRiskQueryKeys.overview(organizationId),
		queryFn: () => darkRiskGateway.getStandardOverview(organizationId!, groupId),
		enabled: Boolean(organizationId && standardEnabled),
		staleTime: 60_000,
		refetchInterval: 90_000,
	});
	const reportsQuery = useQuery({
		queryKey: darkRiskQueryKeys.reports(organizationId, "standard"),
		queryFn: () => darkRiskGateway.getReports(organizationId!, "standard", groupId),
		enabled: Boolean(organizationId && standardEnabled),
		staleTime: 60_000,
	});
	const saveScope = useMutation({
		mutationFn: (scope: Parameters<typeof darkRiskGateway.updateScope>[1]) =>
			darkRiskGateway.updateScope(organizationId!, scope, groupId),
		onSuccess: (scope) =>
			queryClient.setQueryData(darkRiskQueryKeys.scope(organizationId), scope),
	});

	const overview = overviewQuery.data;
	const cards = [
		{
			label: "Leak rilevati",
			value: overview
				? `${overview.isMinimum ? "Almeno " : ""}${overview.totalLeaks}`
				: "—",
			icon: DatabaseZap,
		},
		{
			label: "Nuovi nel periodo",
			value: overview?.newLeaks ?? "—",
			icon: Activity,
		},
		{
			label: "Indice di rischio",
			value: overview ? `${overview.riskScore}/100` : "—",
			icon: Gauge,
		},
		{
			label: "Target monitorati",
			value:
				overview?.monitoredTargets ?? scopeQuery.data?.targets.length ?? "—",
			icon: Target,
		},
	];

	return (
		<DashboardLayout>
			<div className="mx-auto max-w-7xl space-y-6">
				<header className="flex flex-col gap-4 border-b border-cyan-500/15 pb-5 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<div className="mb-2 flex items-center gap-2">
							<Badge className="bg-cyan-500/15 text-cyan-300">STANDARD</Badge>
							<Badge variant="outline">Monitoraggio settimanale</Badge>
						</div>
						<h1 className="text-2xl font-semibold tracking-tight">
							DarkRisk360
						</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							{selectedOrganization?.name} · quantità, trend e rischio aggregato
							senza esporre contenuti sensibili.
						</p>
					</div>
					<div className="flex gap-2">
						<Button
							variant="outline"
							onClick={() =>
								void Promise.all([
									overviewQuery.refetch(),
									reportsQuery.refetch(),
								])
							}
						>
							<RefreshCw className="mr-2 h-4 w-4" />
							Aggiorna
						</Button>
						{extendedEnabled ? (
							<Button asChild>
								<Link to="/dark-risk-esteso">Apri Esteso</Link>
							</Button>
						) : null}
					</div>
				</header>

				{entitlementsLoading ? (
					<Card>
						<CardContent className="p-8 text-center">
							<h2 className="font-semibold">
								Verifica attivazione DarkRisk360…
							</h2>
							<p className="mt-2 text-sm text-muted-foreground">
								Sto allineando l’entitlement del cliente con HiCompliance e i
								servizi disponibili.
							</p>
						</CardContent>
					</Card>
				) : isEntitlementError ? (
					<Card>
						<CardContent className="p-8 text-center">
							<h2 className="font-semibold">Errore verifica attivazione</h2>
							<p className="mt-2 text-sm text-muted-foreground">
								Impossibile verificare lo stato del servizio. Il backend o il
								database potrebbero non rispondere.
							</p>
							<Button
								variant="outline"
								className="mt-4"
								onClick={() =>
									void queryClient.invalidateQueries({
										queryKey: darkRiskQueryKeys.entitlements(organizationId),
									})
								}
							>
								Riprova
							</Button>
						</CardContent>
					</Card>
				) : !standardEnabled ? (
					<Card>
						<CardContent className="p-8 text-center">
							<h2 className="font-semibold">DarkRisk360 non attivo</h2>
							<p className="mt-2 text-sm text-muted-foreground">
								Il modulo viene incluso con HiCompliance oppure può essere
								attivato standalone.
							</p>
						</CardContent>
					</Card>
				) : (
					<Tabs
						value={activeTab}
						onValueChange={(v) => setActiveTab(v as "overview" | "exposure")}
					>
						<TabsList>
							<TabsTrigger value="overview">Panoramica</TabsTrigger>
							<TabsTrigger value="exposure">Porte & CVE</TabsTrigger>
						</TabsList>

						<TabsContent value="overview" className="space-y-6 mt-4">
							<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
								{cards.map(({ label, value, icon: Icon }) => (
									<Card key={label} className="border-cyan-500/10">
										<CardContent className="flex items-center gap-4 p-5">
											<div className="rounded-md bg-cyan-500/10 p-2 text-cyan-400">
												<Icon className="h-5 w-5" />
											</div>
											<div>
												<p className="text-xs uppercase tracking-wider text-muted-foreground">
													{label}
												</p>
												<p className="mt-1 text-2xl font-semibold">{value}</p>
											</div>
										</CardContent>
									</Card>
								))}
							</div>
							<div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
								<ScopeEditor
									scope={scopeQuery.data ?? { targets: [] }}
									canManage={canManage}
									isLoading={scopeQuery.isLoading}
									isSaving={saveScope.isPending}
									onSave={(scope) => saveScope.mutateAsync(scope)}
								/>
								<Card>
									<CardHeader>
										<CardTitle className="flex items-center gap-2 text-base">
											<CalendarClock className="h-4 w-4 text-cyan-400" />
											Automazione
										</CardTitle>
									</CardHeader>
									<CardContent className="space-y-4 text-sm">
										<div>
											<p className="text-muted-foreground">Prossima scansione</p>
											<p className="font-medium">Lunedì, ore 02:00 Europe/Rome</p>
										</div>
										<div>
											<p className="text-muted-foreground">Report mensile</p>
											<p className="font-medium">
												Giorno 1, ore 03:00 sul mese precedente
											</p>
										</div>
										<div>
											<p className="text-muted-foreground">Ultima scansione</p>
											<p className="font-medium">
												{formatDate(overview?.lastScanAt ?? null)}
											</p>
										</div>
										<Badge variant="outline">
											{overview?.riskLevel ?? "In attesa di dati"}
										</Badge>
									</CardContent>
								</Card>
							</div>
							<Card>
								<CardHeader>
									<CardTitle className="text-base">Trend settimanale</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="grid gap-2">
										{overview?.weeklyTrend.map((point) => (
											<div
												key={point.period}
												className="grid grid-cols-[100px_1fr_auto] items-center gap-3 text-sm"
											>
												<span className="font-mono text-xs text-muted-foreground">
													{point.period}
												</span>
												<div className="h-2 overflow-hidden rounded-full bg-muted">
													<div
														className="h-full bg-cyan-500"
														style={{
															width: `${Math.min(100, overview.totalLeaks ? (point.total / overview.totalLeaks) * 100 : 0)}%`,
														}}
													/>
												</div>
												<span>
													{point.total}{" "}
													<span className="text-xs text-muted-foreground">
														(+{point.newLeaks})
													</span>
												</span>
											</div>
										))}
										{!overview?.weeklyTrend.length ? (
											<p className="text-sm text-muted-foreground">
												Il trend sarà disponibile dopo le prime scansioni
												settimanali.
											</p>
										) : null}
									</div>
								</CardContent>
							</Card>
							<ReportList
								title="Report mensili"
								reports={reportsQuery.data ?? []}
								isLoading={reportsQuery.isLoading}
							/>
						</TabsContent>

						<TabsContent value="exposure" className="mt-4">
							<SurfaceScanExposureSection isAdmin={canManage} />
						</TabsContent>
					</Tabs>
				)}
			</div>
		</DashboardLayout>
	);
}
