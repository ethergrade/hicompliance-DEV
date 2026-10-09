// Stato della piattaforma, solo per il super-admin: comandi pianificati, code e
// job falliti, integrazioni per cliente, configurazioni incomplete, contratti,
// MFA e controlli di sistema. I dati arrivano da GET /admin/status (cache 1 min).
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Cog, Database, KeyRound, Loader2, PlugZap, RefreshCw, Search, ServerCog, XCircle } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TablePager, usePager } from "@/components/service-dashboards/TablePager";
import { useUserRoles } from "@/hooks/useUserRoles";
import { complianceApiClient } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";

type Status = "ok" | "warn" | "error";

interface Row {
	tenantId: string;
	tenantName: string;
	service: string;
	detail: string | null;
	status: Status;
	lastUpdate: string | null;
	problems: string[];
}

interface StatusPayload {
	generatedAt: string;
	summary: { errors: number; warnings: number };
	system: { environment: string; php: string; laravel: string; timezone: string; checks: { key: string; label: string; status: Status; detail: string }[]; error?: string };
	scheduler: {
		status: Status;
		heartbeatAt: string | null;
		note: string | null;
		tasks: { task: string; expression: string; status: Status; lastStatus: string | null; lastStartedAt: string | null; lastDurationMs: number | null; lastSuccessAt: string | null; lastFailureAt: string | null; lastFailureMessage: string | null; consecutiveFailures: number; expectedAt: string | null; late: boolean }[];
		recentFailures: { task: string; failedAt: string; exitCode: number | null; message: string | null }[];
		error?: string;
	};
	queues: {
		queues: { name: string; pending: number | null; delayed: number | null; reserved: number | null; status: Status }[];
		failedJobs: { last24h: number; last7d: number; byJob: { job: string; count7d: number; count24h: number; lastAt: string; lastError: string; status: Status }[] };
		error?: string;
	};
	integrations: Row[] | { error: string };
	configuration: Row[] | { error: string };
	contracts: { tenantId: string; tenantName: string; service: string; endDate: string; status: Status; problem: string }[] | { error: string };
	security: { mfaRequired: boolean; superAdmins: number; groupAdmins: number; withoutMfa: { email: string; role: string; status: Status }[]; error?: string };
}

const STATUS: Record<Status, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
	ok: { label: "OK", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500", icon: CheckCircle2 },
	warn: { label: "Attenzione", className: "border-amber-500/30 bg-amber-500/10 text-amber-500", icon: AlertTriangle },
	error: { label: "Errore", className: "border-red-500/30 bg-red-500/10 text-red-500", icon: XCircle },
};

const fmt = (v: string | null | undefined) => {
	if (!v) return "—";
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? v : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
};
const ago = (v: string | null | undefined) => {
	if (!v) return "mai";
	const min = Math.round((Date.now() - new Date(v).getTime()) / 60000);
	if (min < 1) return "adesso";
	if (min < 60) return `${min} min fa`;
	if (min < 1440) return `${Math.round(min / 60)} h fa`;
	return `${Math.round(min / 1440)} g fa`;
};

function StatusBadge({ status }: { status: Status }) {
	const s = STATUS[status] ?? STATUS.warn;
	return (
		<Badge className={`gap-1 ${s.className}`}>
			<s.icon className="h-3 w-3" />
			{s.label}
		</Badge>
	);
}

const asRows = <T,>(v: T[] | { error: string } | undefined): { rows: T[]; error?: string } =>
	Array.isArray(v) ? { rows: v } : { rows: [], error: v?.error };

function SectionError({ error }: { error?: string }) {
	return error ? <p className="text-sm text-red-500">{error}</p> : null;
}

export default function SystemStatus() {
	const { isSuperAdmin, loading: rolesLoading } = useUserRoles();
	const queryClient = useQueryClient();
	const [refreshing, setRefreshing] = useState(false);

	const query = useQuery({
		queryKey: ["admin-system-status"],
		enabled: isSuperAdmin,
		refetchInterval: 60_000,
		queryFn: async () => (await complianceApiClient.get<ApiResponse<StatusPayload>>("/admin/status")).data,
	});

	const refresh = async () => {
		setRefreshing(true);
		try {
			const fresh = (await complianceApiClient.get<ApiResponse<StatusPayload>>("/admin/status", { refresh: 1 })).data;
			queryClient.setQueryData(["admin-system-status"], fresh);
		} finally {
			setRefreshing(false);
		}
	};

	if (!rolesLoading && !isSuperAdmin) {
		return (
			<DashboardLayout>
				<Card>
					<CardContent className="py-12 text-center text-muted-foreground">Pagina riservata al super-admin.</CardContent>
				</Card>
			</DashboardLayout>
		);
	}

	const data = query.data;

	return (
		<DashboardLayout>
			<div className="space-y-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="text-3xl font-bold tracking-tight">Stato della piattaforma</h1>
						<p className="text-muted-foreground">
							Comandi pianificati, code, integrazioni dei clienti, configurazioni e sicurezza.
							{data && ` Aggiornato alle ${fmt(data.generatedAt)}.`}
						</p>
					</div>
					<Button variant="outline" onClick={refresh} disabled={refreshing || query.isLoading} className="gap-2">
						<RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Ricalcola
					</Button>
				</div>

				{query.isLoading && (
					<div className="flex items-center gap-2 text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" /> Calcolo dello stato…
					</div>
				)}
				{query.isError && <p className="text-red-500">Stato non disponibile: {(query.error as Error)?.message}</p>}

				{data && (
					<>
						<Overview data={data} />
						<Tabs defaultValue="integrations">
							<TabsList className="flex-wrap">
								<TabsTrigger value="integrations">Integrazioni</TabsTrigger>
								<TabsTrigger value="configuration">Configurazioni incomplete</TabsTrigger>
								<TabsTrigger value="scheduler">Comandi pianificati</TabsTrigger>
								<TabsTrigger value="queues">Code e job</TabsTrigger>
								<TabsTrigger value="contracts">Contratti</TabsTrigger>
								<TabsTrigger value="security">Sicurezza</TabsTrigger>
								<TabsTrigger value="system">Sistema</TabsTrigger>
							</TabsList>
							<TabsContent value="integrations">
								<ClientRows title="Integrazioni per cliente" source={data.integrations} empty="Nessun servizio con integrazione attiva." />
							</TabsContent>
							<TabsContent value="configuration">
								<ClientRows title="Servizi attivi che non possono funzionare" source={data.configuration} empty="Nessuna configurazione incompleta." />
							</TabsContent>
							<TabsContent value="scheduler">
								<Scheduler data={data.scheduler} />
							</TabsContent>
							<TabsContent value="queues">
								<Queues data={data.queues} />
							</TabsContent>
							<TabsContent value="contracts">
								<Contracts source={data.contracts} />
							</TabsContent>
							<TabsContent value="security">
								<Security data={data.security} />
							</TabsContent>
							<TabsContent value="system">
								<SystemChecks data={data.system} />
							</TabsContent>
						</Tabs>
					</>
				)}
			</div>
		</DashboardLayout>
	);
}

function Overview({ data }: { data: StatusPayload }) {
	const integrations = asRows(data.integrations).rows;
	const configuration = asRows(data.configuration).rows;
	const tiles = [
		{ label: "Errori", value: data.summary.errors, icon: XCircle, tone: data.summary.errors > 0 ? "text-red-500" : "text-muted-foreground" },
		{ label: "Avvisi", value: data.summary.warnings, icon: AlertTriangle, tone: data.summary.warnings > 0 ? "text-amber-500" : "text-muted-foreground" },
		{ label: "Scheduler", value: data.scheduler.heartbeatAt ? ago(data.scheduler.heartbeatAt) : "—", icon: Clock, tone: data.scheduler.status === "ok" ? "text-emerald-500" : "text-red-500" },
		{ label: "Job falliti 24h", value: data.queues.failedJobs?.last24h ?? "—", icon: ServerCog, tone: (data.queues.failedJobs?.last24h ?? 0) > 0 ? "text-amber-500" : "text-muted-foreground" },
		{ label: "Integrazioni in errore", value: integrations.filter((r) => r.status === "error").length, icon: PlugZap, tone: "text-red-500" },
		{ label: "Clienti da configurare", value: configuration.length, icon: Cog, tone: configuration.length > 0 ? "text-amber-500" : "text-muted-foreground" },
	];
	const urgent = [...integrations, ...configuration].filter((r) => r.status === "error").slice(0, 8);

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
				{tiles.map((t) => (
					<Card key={t.label}>
						<CardContent className="flex flex-col items-center py-4 text-center">
							<t.icon className={`mb-2 h-6 w-6 ${t.tone}`} />
							<p className="text-2xl font-bold">{t.value}</p>
							<p className="text-xs text-muted-foreground">{t.label}</p>
						</CardContent>
					</Card>
				))}
			</div>
			{urgent.length > 0 && (
				<Card className="border-red-500/30">
					<CardHeader className="pb-2">
						<CardTitle className="text-base">Da guardare subito</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1 text-sm">
						{urgent.map((r, i) => (
							<div key={`${r.tenantId}-${r.service}-${i}`}>
								<span className="font-medium">{r.tenantName}</span> · {r.service}: {r.problems.join(" · ")}
							</div>
						))}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function ClientRows({ title, source, empty }: { title: string; source: Row[] | { error: string }; empty: string }) {
	const { rows, error } = asRows(source);
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState<Status | "all">("all");
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return rows.filter((r) => (status === "all" || r.status === status) && (!q || `${r.tenantName} ${r.service} ${r.detail ?? ""} ${r.problems.join(" ")}`.toLowerCase().includes(q)));
	}, [rows, search, status]);
	const pager = usePager(filtered, `${search}|${status}`);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">{title}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<SectionError error={error} />
				<div className="flex flex-wrap items-center gap-2">
					<div className="relative min-w-[220px] flex-1">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca cliente, servizio o problema…" className="pl-8" />
					</div>
					{(["all", "error", "warn", "ok"] as const).map((s) => (
						<Button key={s} size="sm" variant={status === s ? "default" : "outline"} className="h-8" onClick={() => setStatus(s)}>
							{s === "all" ? `Tutti (${rows.length})` : `${STATUS[s].label} (${rows.filter((r) => r.status === s).length})`}
						</Button>
					))}
				</div>
				{rows.length === 0 && !error ? (
					<p className="text-sm text-muted-foreground">{empty}</p>
				) : (
					<>
						<TablePager p={pager} />
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Stato</TableHead>
										<TableHead>Cliente</TableHead>
										<TableHead>Servizio</TableHead>
										<TableHead>Ultimo aggiornamento</TableHead>
										<TableHead>Problema</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{pager.visible.map((r, i) => (
										<TableRow key={`${r.tenantId}-${r.service}-${r.detail}-${i}`}>
											<TableCell>
												<StatusBadge status={r.status} />
											</TableCell>
											<TableCell className="font-medium">{r.tenantName}</TableCell>
											<TableCell>
												{r.service}
												{r.detail && <p className="text-xs text-muted-foreground">{r.detail}</p>}
											</TableCell>
											<TableCell className="whitespace-nowrap text-sm text-muted-foreground" title={fmt(r.lastUpdate)}>
												{r.lastUpdate ? ago(r.lastUpdate) : "—"}
											</TableCell>
											<TableCell className="text-sm">{r.problems.length ? r.problems.join(" · ") : <span className="text-muted-foreground">Nessun problema</span>}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
						{pager.total > pager.size && <TablePager p={pager} />}
					</>
				)}
			</CardContent>
		</Card>
	);
}

function Scheduler({ data }: { data: StatusPayload["scheduler"] }) {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						Comandi pianificati <StatusBadge status={data.status ?? "warn"} />
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						Ultima partenza di un comando: {data.heartbeatAt ? `${fmt(data.heartbeatAt)} (${ago(data.heartbeatAt)})` : "nessuna"}. Oltre 5 minuti senza partenze lo scheduler è fermo.
						{data.note && ` ${data.note}`}
					</p>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<SectionError error={data.error} />
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Stato</TableHead>
								<TableHead>Comando</TableHead>
								<TableHead>Pianificazione</TableHead>
								<TableHead>Ultima partenza</TableHead>
								<TableHead>Durata</TableHead>
								<TableHead>Ultimo successo</TableHead>
								<TableHead>Ultimo errore</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(data.tasks ?? []).map((t) => (
								<TableRow key={t.task}>
									<TableCell>
										<StatusBadge status={t.status} />
										{t.late && <p className="mt-1 text-[10px] text-amber-500">in ritardo (atteso {fmt(t.expectedAt)})</p>}
									</TableCell>
									<TableCell className="font-mono text-xs">{t.task}</TableCell>
									<TableCell className="font-mono text-xs">{t.expression}</TableCell>
									<TableCell className="whitespace-nowrap text-sm">
										{ago(t.lastStartedAt)}
										{t.lastStatus === "running" && <span className="text-xs text-muted-foreground"> · in corso</span>}
										{t.lastStatus === "skipped" && <span className="text-xs text-muted-foreground"> · saltato</span>}
									</TableCell>
									<TableCell className="text-sm">{t.lastDurationMs !== null ? `${(t.lastDurationMs / 1000).toFixed(1)} s` : "—"}</TableCell>
									<TableCell className="whitespace-nowrap text-sm">{ago(t.lastSuccessAt)}</TableCell>
									<TableCell className="max-w-xs text-xs">
										{t.lastFailureAt ? (
											<>
												{ago(t.lastFailureAt)}
												{t.consecutiveFailures > 0 && ` · ${t.consecutiveFailures} di fila`}
												{t.lastFailureMessage && <p className="text-muted-foreground">{t.lastFailureMessage}</p>}
											</>
										) : (
											"—"
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
			{(data.recentFailures ?? []).length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="text-lg">Fallimenti degli ultimi 7 giorni</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1 text-sm">
						{data.recentFailures.map((f, i) => (
							<div key={i}>
								<span className="font-mono text-xs">{fmt(f.failedAt)}</span> · <span className="font-medium">{f.task}</span> · {f.message}
							</div>
						))}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function Queues({ data }: { data: StatusPayload["queues"] }) {
	return (
		<div className="space-y-4">
			<SectionError error={data.error} />
			<div className="grid gap-4 md:grid-cols-3">
				{(data.queues ?? []).map((q) => (
					<Card key={q.name}>
						<CardHeader className="pb-2">
							<CardTitle className="flex items-center justify-between text-base">
								Coda {q.name} <StatusBadge status={q.status} />
							</CardTitle>
						</CardHeader>
						<CardContent className="grid grid-cols-3 text-center">
							<div>
								<p className="text-2xl font-bold">{q.pending ?? "—"}</p>
								<p className="text-xs text-muted-foreground">in attesa</p>
							</div>
							<div>
								<p className="text-2xl font-bold">{q.reserved ?? "—"}</p>
								<p className="text-xs text-muted-foreground">in esecuzione</p>
							</div>
							<div>
								<p className="text-2xl font-bold">{q.delayed ?? "—"}</p>
								<p className="text-xs text-muted-foreground">rimandati</p>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">
						Job falliti: {data.failedJobs?.last24h ?? 0} nelle ultime 24 ore, {data.failedJobs?.last7d ?? 0} in 7 giorni
					</CardTitle>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					{(data.failedJobs?.byJob ?? []).length === 0 ? (
						<p className="text-sm text-muted-foreground">Nessun job fallito negli ultimi 7 giorni.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Stato</TableHead>
									<TableHead>Job</TableHead>
									<TableHead>24 ore</TableHead>
									<TableHead>7 giorni</TableHead>
									<TableHead>Ultimo</TableHead>
									<TableHead>Ultimo errore</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.failedJobs.byJob.map((j) => (
									<TableRow key={j.job}>
										<TableCell>
											<StatusBadge status={j.status} />
										</TableCell>
										<TableCell className="font-mono text-xs">{j.job}</TableCell>
										<TableCell>{j.count24h}</TableCell>
										<TableCell>{j.count7d}</TableCell>
										<TableCell className="whitespace-nowrap text-sm">{ago(j.lastAt)}</TableCell>
										<TableCell className="max-w-md text-xs text-muted-foreground">{j.lastError}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function Contracts({ source }: { source: StatusPayload["contracts"] }) {
	const { rows, error } = asRows(source);
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">Contratti scaduti o in scadenza (30 giorni)</CardTitle>
				<p className="text-sm text-muted-foreground">Un contratto scaduto lascia il servizio "attivo" ma i comandi non lo eseguono più.</p>
			</CardHeader>
			<CardContent className="overflow-x-auto">
				<SectionError error={error} />
				{rows.length === 0 && !error ? (
					<p className="text-sm text-muted-foreground">Nessun contratto scaduto o in scadenza.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Stato</TableHead>
								<TableHead>Cliente</TableHead>
								<TableHead>Servizio</TableHead>
								<TableHead>Fine contratto</TableHead>
								<TableHead>Nota</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((r, i) => (
								<TableRow key={`${r.tenantId}-${r.service}-${i}`}>
									<TableCell>
										<StatusBadge status={r.status} />
									</TableCell>
									<TableCell className="font-medium">{r.tenantName}</TableCell>
									<TableCell>{r.service}</TableCell>
									<TableCell>{new Date(r.endDate).toLocaleDateString("it-IT")}</TableCell>
									<TableCell className="text-sm">{r.problem}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

function Security({ data }: { data: StatusPayload["security"] }) {
	const rows = data.withoutMfa ?? [];
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-lg">
					<KeyRound className="h-5 w-5" /> Autenticazione a due fattori
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					MFA obbligatoria: {data.mfaRequired ? "sì" : "no"} · super-admin: {data.superAdmins ?? "—"} · admin di gruppo: {data.groupAdmins ?? "—"}
				</p>
			</CardHeader>
			<CardContent className="overflow-x-auto">
				<SectionError error={data.error} />
				{rows.length === 0 && !data.error ? (
					<p className="text-sm text-muted-foreground">Tutti gli utenti privilegiati hanno l'MFA attiva.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Stato</TableHead>
								<TableHead>Utente</TableHead>
								<TableHead>Ruolo</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((u) => (
								<TableRow key={`${u.email}-${u.role}`}>
									<TableCell>
										<StatusBadge status={u.status} />
									</TableCell>
									<TableCell>{u.email}</TableCell>
									<TableCell>{u.role}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

function SystemChecks({ data }: { data: StatusPayload["system"] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-lg">
					<Database className="h-5 w-5" /> Sistema
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					Ambiente {data.environment ?? "—"} · PHP {data.php ?? "—"} · Laravel {data.laravel ?? "—"} · fuso {data.timezone ?? "—"}
				</p>
			</CardHeader>
			<CardContent className="overflow-x-auto">
				<SectionError error={data.error} />
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Stato</TableHead>
							<TableHead>Controllo</TableHead>
							<TableHead>Dettaglio</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{(data.checks ?? []).map((c) => (
							<TableRow key={c.key}>
								<TableCell>
									<StatusBadge status={c.status} />
								</TableCell>
								<TableCell className="font-medium">{c.label}</TableCell>
								<TableCell className="text-sm">{c.detail}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
