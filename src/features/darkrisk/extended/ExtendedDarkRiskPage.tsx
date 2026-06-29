import { useState } from "react";
import { Eye, Play, RefreshCw, ShieldAlert } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAuth } from "@/components/auth/AuthProvider";
import { darkRiskGateway } from "../api/darkRiskGateway";
import { darkRiskQueryKeys } from "../api/queryKeys";
import { ReportList } from "../shared/ReportList";
import { ScopeEditor } from "../shared/ScopeEditor";
import { useDarkRiskEntitlements } from "../shared/useDarkRiskEntitlements";

export default function ExtendedDarkRiskPage() {
	const { organizationId, selectedOrganization } = useClientOrganization();
	const { isSuperAdmin } = useUserRoles();
	const { userProfile } = useAuth();
	const {
		extendedEnabled,
		isLoading: entitlementsLoading,
		isError: isEntitlementError,
	} = useDarkRiskEntitlements(organizationId);
	const canOperate = isSuperAdmin || userProfile?.user_type === "admin";
	const queryClient = useQueryClient();
	const [activeRunId, setActiveRunId] = useState<string | null>(null);

	const scopeQuery = useQuery({
		queryKey: darkRiskQueryKeys.scope(organizationId),
		queryFn: () => darkRiskGateway.getScope(organizationId!),
		enabled: Boolean(organizationId && extendedEnabled),
		staleTime: 60_000,
	});
	const reportsQuery = useQuery({
		queryKey: darkRiskQueryKeys.reports(organizationId, "extended"),
		queryFn: () => darkRiskGateway.getReports(organizationId!, "extended"),
		enabled: Boolean(organizationId && extendedEnabled),
		staleTime: 30_000,
	});
	const resultsQuery = useQuery({
		queryKey: darkRiskQueryKeys.extendedResult(organizationId, activeRunId),
		queryFn: () =>
			darkRiskGateway.getExtendedResults(organizationId!, activeRunId!),
		enabled: Boolean(organizationId && activeRunId && extendedEnabled),
		staleTime: 0,
		gcTime: 0,
		refetchInterval: (query) =>
			["queued", "running"].includes(query.state.data?.run?.status ?? "")
				? 5_000
				: false,
	});
	const saveScope = useMutation({
		mutationFn: (scope: Parameters<typeof darkRiskGateway.updateScope>[1]) =>
			darkRiskGateway.updateScope(organizationId!, scope),
		onSuccess: (scope) =>
			queryClient.setQueryData(darkRiskQueryKeys.scope(organizationId), scope),
	});
	const startRun = useMutation({
		mutationFn: () => darkRiskGateway.createExtendedRun(organizationId!),
		onSuccess: (run) => {
			setActiveRunId(run.id);
			toast.success("Scansione DarkRisk360 Esteso accodata");
			void queryClient.invalidateQueries({
				queryKey: darkRiskQueryKeys.reports(organizationId, "extended"),
			});
		},
		onError: (error) =>
			toast.error(
				error instanceof Error
					? error.message
					: "Impossibile avviare la scansione",
			),
	});

	const records = resultsQuery.data?.records ?? [];

	return (
		<DashboardLayout>
			<div className="mx-auto max-w-7xl space-y-6">
				<header className="flex flex-col gap-4 border-b border-violet-500/20 pb-5 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<div className="mb-2 flex items-center gap-2">
							<Badge className="bg-violet-500/15 text-violet-300">ESTESO</Badge>
							<Badge variant="outline">Identity · spot</Badge>
						</div>
						<h1 className="text-2xl font-semibold tracking-tight">
							DarkRisk360 Esteso
						</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							{selectedOrganization?.name} · evidenze Identity complete dal solo
							bucket Private Leaks.
						</p>
					</div>
					<div className="flex gap-2">
						<Button variant="outline" asChild>
							<Link to="/dark-risk">Torna a Standard</Link>
						</Button>
						{canOperate && extendedEnabled ? (
							<Button
								onClick={() => startRun.mutate()}
								disabled={
									startRun.isPending || !scopeQuery.data?.targets.length
								}
							>
								<Play className="mr-2 h-4 w-4" />
								{startRun.isPending ? "Avvio…" : "Avvia scansione spot"}
							</Button>
						) : null}
					</div>
				</header>

				{entitlementsLoading ? (
					<Card>
						<CardContent className="p-8 text-center">
							<ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
							<h2 className="mt-3 font-semibold">
								Verifica attivazione DarkRisk360 Esteso…
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
							<ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
							<h2 className="mt-3 font-semibold">
								Errore verifica attivazione
							</h2>
							<p className="mt-2 text-sm text-muted-foreground">
								Impossibile verificare lo stato del servizio.
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
				) : !extendedEnabled ? (
					<Card>
						<CardContent className="p-8 text-center">
							<ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
							<h2 className="mt-3 font-semibold">
								DarkRisk360 Esteso non attivo
							</h2>
							<p className="mt-2 text-sm text-muted-foreground">
								Attiva il modulo Esteso per accedere alle scansioni Identity
								spot.
							</p>
						</CardContent>
					</Card>
				) : (
					<>
						<div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100">
							<strong>Dati altamente sensibili.</strong> Le visualizzazioni e i
							download sono sottoposti ad audit. I risultati provengono
							esclusivamente da <code>leaks.private.general</code>.
						</div>
						<ScopeEditor
							scope={scopeQuery.data ?? { targets: [] }}
							canManage={canOperate}
							isLoading={scopeQuery.isLoading}
							isSaving={saveScope.isPending}
							onSave={(scope) => saveScope.mutateAsync(scope)}
						/>
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between">
									<CardTitle className="flex items-center gap-2 text-base">
										<Eye className="h-4 w-4 text-violet-400" />
										Risultati del run
									</CardTitle>
									{activeRunId ? (
										<Button
											size="sm"
											variant="outline"
											onClick={() => resultsQuery.refetch()}
										>
											<RefreshCw className="mr-2 h-4 w-4" />
											Aggiorna
										</Button>
									) : null}
								</div>
							</CardHeader>
							<CardContent>
								{activeRunId ? (
									<div className="mb-4 flex flex-wrap gap-2 text-xs">
										<Badge variant="outline">
											Run {activeRunId.slice(0, 12)}
										</Badge>
										<Badge variant="outline">
											{resultsQuery.data?.run?.status ??
												(resultsQuery.isLoading
													? "caricamento"
													: "disponibile")}
										</Badge>
										<Badge variant="outline">{records.length} record</Badge>
									</div>
								) : null}
								{resultsQuery.data?.discardedBucketRecords ? (
									<p className="mb-3 text-xs text-amber-300">
										{resultsQuery.data.discardedBucketRecords} record scartati
										perché appartenenti a bucket non autorizzati.
									</p>
								) : null}
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Selector</TableHead>
												<TableHead>Account</TableHead>
												<TableHead>Password</TableHead>
												<TableHead>Fonte</TableHead>
												<TableHead>Data</TableHead>
												<TableHead>Match</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{records.map((record) => (
												<TableRow key={record.id}>
													<TableCell className="font-mono text-xs">
														{record.selector || "—"}
													</TableCell>
													<TableCell>{record.user || "—"}</TableCell>
													<TableCell>
														<code className="rounded bg-red-500/10 px-2 py-1 text-red-200">
															{record.password || "—"}
														</code>
														{record.passwordType ? (
															<p className="mt-1 text-[10px] text-muted-foreground">
																{record.passwordType}
															</p>
														) : null}
													</TableCell>
													<TableCell title={record.sourceLong}>
														{record.sourceShort || record.sourceLong || "—"}
													</TableCell>
													<TableCell>{record.date || "—"}</TableCell>
													<TableCell>
														<Badge
															variant={
																record.matchType === "direct"
																	? "default"
																	: "outline"
															}
														>
															{record.matchType === "direct"
																? "Diretto"
																: "Correlato da IP"}
														</Badge>
													</TableCell>
												</TableRow>
											))}
											{!resultsQuery.isLoading && records.length === 0 ? (
												<TableRow>
													<TableCell
														colSpan={6}
														className="h-24 text-center text-muted-foreground"
													>
														{activeRunId
															? "Nessun record disponibile per questo run."
															: "Avvia una scansione o apri un run dai report."}
													</TableCell>
												</TableRow>
											) : null}
										</TableBody>
									</Table>
								</div>
							</CardContent>
						</Card>
						<ReportList
							title="Report per scansione"
							reports={reportsQuery.data ?? []}
							isLoading={reportsQuery.isLoading}
							onSelectRun={setActiveRunId}
						/>
					</>
				)}
			</div>
		</DashboardLayout>
	);
}
