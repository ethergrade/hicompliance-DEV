// @ts-nocheck -- type drift vs API contract, da riallineare
import type { ReactNode } from "react";
import {
	Activity,
	CalendarClock,
	DatabaseZap,
	Gauge,
	KeyRound,
	RefreshCw,
	Target,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAuth } from "@/components/auth/AuthProvider";
import { DarkRiskNotificationConfigCard } from "@/components/dark-risk/DarkRiskNotificationConfigCard";
import { toast } from "sonner";
import { darkRiskGateway } from "../api/darkRiskGateway";
import { darkRiskQueryKeys } from "../api/queryKeys";
import { DarkRiskAssetBreakdown } from "../components/DarkRiskAssetBreakdown";
import { DarkRiskCalendarHeatmap } from "../components/DarkRiskCalendarHeatmap";
import { DarkRiskFiletypePieChart } from "../components/DarkRiskFiletypePieChart";
import { DarkRiskSourcePieChart } from "../components/DarkRiskSourcePieChart";
import { ReportList } from "../shared/ReportList";
import { DarkRiskFindingsList } from "../components/DarkRiskFindingsList";
import { DarkRiskMonitoringCoverage } from "../components/DarkRiskMonitoringCoverage";
import { ScopeEditor } from "../shared/ScopeEditor";
import { useDarkRiskEntitlements } from "../shared/useDarkRiskEntitlements";
import { DarkRiskEvidenceSheet } from "../components/DarkRiskEvidenceSheet";
import { DarkRiskTodo } from "../components/DarkRiskTodo";

// Stesse quattro viste di SurfaceScan360, con la vista nell'URL (?vista=…).
const VIEWS = [
	{ key: "panoramica", label: "Panoramica" },
	{ key: "azioni", label: "Azioni" },
	{ key: "perimetro", label: "Perimetro" },
	{ key: "report", label: "Report" },
] as const;
type DarkRiskView = (typeof VIEWS)[number]["key"];

const formatDate = (value: string | null) =>
	value
		? new Intl.DateTimeFormat("it-IT", {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(new Date(value))
		: "Mai eseguita";

export default function StandardDarkRiskPage() {
	const { organizationId, groupId, selectedOrganization } = useClientOrganization();
	const { isSuperAdmin } = useUserRoles();
	const { userProfile } = useAuth();
	const {
		standardEnabled,
		extendedEnabled,
		isLoading: entitlementsLoading,
		isError: isEntitlementError,
	} = useDarkRiskEntitlements(organizationId, groupId);
	const canManage = isSuperAdmin || userProfile?.user_type === "admin";
	const queryClient = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const requested = searchParams.get("vista");
	const view: DarkRiskView = VIEWS.some((v) => v.key === requested) ? (requested as DarkRiskView) : "panoramica";
	const setView = (next: DarkRiskView) => {
		const params = new URLSearchParams(searchParams);
		params.set("vista", next);
		setSearchParams(params);
		window.scrollTo({ top: 0 });
	};

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

	const handleDownloadReport = async (report: { id: string }) => {
		if (!organizationId) return;
		try {
			await darkRiskGateway.downloadReport(organizationId, report.id, groupId);
		} catch {
			toast.error("Impossibile scaricare il report.");
		}
	};
	// «Non disponibile» quando il dato non c'è: zero vuol dire «valutato e
	// niente trovato», e prima le due cose si confondevano.
	const ND = "Non disponibile";
	const weekLabel = overview?.snapshotWeekStart
		? `Settimana dal ${new Date(overview.snapshotWeekStart).toLocaleDateString("it-IT")}`
		: null;
	const cards: Array<{ label: string; value: ReactNode; hint?: string | null; icon: typeof Gauge }> = [
		{
			label: "Record raccolti",
			value: overview
				? overview.totalLeaks === null
					? ND
					: `${overview.isMinimum ? "Almeno " : ""}${overview.totalLeaks}`
				: "—",
			hint: "Record della fonte che citano il perimetro",
			icon: DatabaseZap,
		},
		{
			label: "Nuovi nella settimana",
			value: overview ? (overview.newLeaks ?? ND) : "—",
			hint: weekLabel,
			icon: Activity,
		},
		{
			label: "Indice di esposizione",
			value: overview ? (overview.riskScore === null ? ND : `${overview.riskScore}/100`) : "—",
			// Il verso va detto: in questa pagina l'indice cresce con il rischio.
			hint: overview?.riskScore != null
				? `${overview.riskLevel ? `Fascia ${overview.riskLevel} · ` : ""}0 = nessuna esposizione, 100 = massima`
				: null,
			icon: Gauge,
		},
		{
			label: "Voci di perimetro",
			value: overview
				? (overview.monitoredTargets ?? scopeQuery.data?.targets.length ?? ND)
				: (scopeQuery.data?.targets.length ?? "—"),
			hint: "Domini, IP ed email nello scope DarkRisk",
			icon: Target,
		},
		{
			// Solo il conteggio: account e password sono riservati al profilo Esteso.
			label: "Credenziali esposte",
			value: overview?.credentialLeaks ?? "—",
			icon: KeyRound,
		},
	];

	const snapshot = overview?.snapshot ?? null;
	const severityEntries = Object.entries(snapshot?.severityDistribution ?? {}).filter(
		([, count]) => count > 0,
	);

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
					<>
						<nav aria-label="Sezioni DarkRisk360" className="flex min-w-0 gap-1 overflow-x-auto rounded-md bg-muted p-1">
							{VIEWS.map((v) => (
								<Button
									key={v.key}
									variant="ghost"
									size="sm"
									aria-current={view === v.key ? "page" : undefined}
									className={`h-9 shrink-0 px-3 text-xs font-semibold ${view === v.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
									onClick={() => setView(v.key)}
								>
									{v.label}
								</Button>
							))}
						</nav>

						{view === "panoramica" && organizationId && (
							<DarkRiskTodo companyId={organizationId} groupId={groupId} onShowAll={() => setView("azioni")} />
						)}
						{view === "panoramica" && (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
							{cards.map(({ label, value, hint, icon: Icon }) => (
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
											{hint ? (
												<p className="mt-1 text-xs text-muted-foreground">{hint}</p>
											) : null}
										</div>
									</CardContent>
								</Card>
							))}
						</div>
						)}
						{view === "panoramica" && <DarkRiskMonitoringCoverage coverage={overview?.monitoringCoverage} />}

						{view === "perimetro" && (
						<>
						<p className="text-sm text-muted-foreground">
							Lo scope è condiviso con SurfaceScan360: una modifica qui vale anche per la superficie esposta.
						</p>
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
										{overview?.riskLevel ? `Esposizione ${overview.riskLevel}` : "In attesa di dati"}
									</Badge>
								</CardContent>
							</Card>
						</div>
						<DarkRiskNotificationConfigCard />
						</>
						)}

						{view === "report" && (
						<>
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
						{/*
						  Analisi aggregata dallo snapshot settimanale. Tutto quello
						  che compare qui è conteggio e distribuzione: nessun account,
						  nessuna riga di leak, nessuna password.
						*/}
						{snapshot ? (
							<>
								<div className="grid gap-6 lg:grid-cols-2">
									<DarkRiskSourcePieChart
										data={snapshot.resultsBySource}
										title="Risultati per sorgente"
									/>
									<DarkRiskFiletypePieChart
										data={snapshot.resultsByFiletype}
										title="Risultati per tipo di file"
									/>
								</div>

								{severityEntries.length ? (
									<Card>
										<CardHeader>
											<CardTitle className="text-base">Severità aggregate</CardTitle>
										</CardHeader>
										<CardContent className="flex flex-wrap gap-2">
											{severityEntries.map(([severity, count]) => (
												<Badge key={severity} variant="outline" className="capitalize">
													{severity}: {count}
												</Badge>
											))}
										</CardContent>
									</Card>
								) : null}

								<DarkRiskCalendarHeatmap
									data={snapshot.resultsByDay}
									title="Evidenze per data di leak"
								/>

								{Object.keys(snapshot.resultsByAsset).length ? (
									<DarkRiskAssetBreakdown data={snapshot.resultsByAsset} />
								) : null}
							</>
						) : (
							<Card>
								<CardContent className="p-8 text-center">
									<h2 className="font-semibold">Analisi non ancora disponibile</h2>
									<p className="mt-2 text-sm text-muted-foreground">
										I grafici aggregati compaiono dopo la prima scansione settimanale
										completata.
									</p>
								</CardContent>
							</Card>
						)}

						<ReportList
							title="Report mensili"
							reports={reportsQuery.data ?? []}
							isLoading={reportsQuery.isLoading}
							onDownload={handleDownloadReport}
						/>
						</>
						)}

						{view === "azioni" && organizationId && (
							<DarkRiskFindingsList companyId={organizationId} groupId={groupId} scope="standard" />
						)}

						{organizationId && <DarkRiskEvidenceSheet companyId={organizationId} groupId={groupId} scope="standard" />}
					</>
				)}
			</div>
		</DashboardLayout>
	);
}
