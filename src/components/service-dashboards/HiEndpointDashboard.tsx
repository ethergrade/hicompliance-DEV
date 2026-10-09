// HiEndpoint: dispositivi, minacce e aggiornamenti del cliente, dall'ultimo dato
// letto dal backend. Punteggi e regole sono calcolati sui dati reali: la formula
// è nei tooltip e nel backend (EndpointDashboard).
import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
	AlertTriangle,
	CheckCircle,
	Clock,
	Cpu,
	Info,
	Laptop,
	Monitor,
	Search,
	Server,
	ShieldAlert,
	ShieldCheck,
	Smartphone,
	XCircle,
} from "lucide-react";
import { RiskScoreCard } from "./RiskScoreCard";
import { TablePager as Pager, usePager } from "./TablePager";
import { DemoDataBadge } from "./DemoDataBadge";
import { ServiceNotConnected } from "./ServiceNotConnected";
import { useEndpointDashboard } from "@/hooks/useEndpoints";
import type { EndpointDevice, EndpointProtection } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

const typeIcons: Record<EndpointDevice["type"], React.ComponentType<{ className?: string }>> = {
	Computer: Monitor,
	Workstation: Monitor,
	Laptop: Laptop,
	Server: Server,
	Mobile: Smartphone,
};

const protectionLabel: Record<EndpointProtection, string> = {
	Protected: "Protetto",
	"At Risk": "A rischio",
	Outdated: "Da aggiornare",
	Unknown: "Sconosciuto",
};

const protectionColors: Record<EndpointProtection, string> = {
	Protected: "bg-green-500/20 text-green-500",
	"At Risk": "bg-red-500/20 text-red-500",
	Outdated: "bg-yellow-500/20 text-yellow-500",
	Unknown: "bg-muted text-muted-foreground",
};

const severityColors = {
	Low: "bg-green-500/20 text-green-500",
	Medium: "bg-yellow-500/20 text-yellow-500",
	High: "bg-orange-500/20 text-orange-500",
	Critical: "bg-red-500/20 text-red-500",
};

const severityLabel = {
	Low: "Bassa",
	Medium: "Media",
	High: "Alta",
	Critical: "Critica",
};

const fmtDate = (v: string | null | undefined) => {
	if (!v) return "—";
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? v : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
};

const scoreLevel = (score: number) =>
	score >= 90
		? { level: "Buono", color: "green" as const, ring: "#10b981" }
		: score >= 70
			? { level: "Moderato", color: "yellow" as const, ring: "#eab308" }
			: { level: "Critico", color: "red" as const, ring: "#ef4444" };

export const HiEndpointDashboard: React.FC = () => {
	const { data, loading, isMock, error } = useEndpointDashboard();

	const [search, setSearch] = useState("");
	const [protection, setProtection] = useState("all");
	const [status, setStatus] = useState("all");
	const [type, setType] = useState("all");

	const endpoints = useMemo(() => data?.endpoints ?? [], [data]);
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return endpoints.filter((e) => {
			if (q && ![e.name, e.os].some((v) => (v ?? "").toLowerCase().includes(q))) return false;
			if (protection !== "all" && e.protection !== protection) return false;
			if (status !== "all" && e.status !== status) return false;
			if (type !== "all" && e.type !== type) return false;
			return true;
		});
	}, [endpoints, search, protection, status, type]);

	const devicePager = usePager(filtered, `${search}|${protection}|${status}|${type}`);

	// Filtri delle minacce e degli aggiornamenti, anche per dispositivo.
	const [threatSearch, setThreatSearch] = useState("");
	const [threatType, setThreatType] = useState("all");
	const [threatSeverity, setThreatSeverity] = useState("all");
	const [updateSearch, setUpdateSearch] = useState("");
	const threats = useMemo(() => data?.detectedThreats ?? [], [data]);
	const filteredThreats = useMemo(() => {
		const q = threatSearch.trim().toLowerCase();
		return threats.filter(
			(t) =>
				(!q || [t.endpoint, t.threatName].some((v) => (v ?? "").toLowerCase().includes(q))) &&
				(threatType === "all" || t.type === threatType) &&
				(threatSeverity === "all" || t.severity === threatSeverity),
		);
	}, [threats, threatSearch, threatType, threatSeverity]);
	const threatPager = usePager(filteredThreats, `${data?.fetchedAt}|${threatSearch}|${threatType}|${threatSeverity}`);
	const filteredUpdates = useMemo(() => {
		const q = updateSearch.trim().toLowerCase();
		return (data?.pendingUpdates ?? []).filter(
			(u) => !q || [u.endpoint, u.reason, u.currentVersion].some((v) => (v ?? "").toLowerCase().includes(q)),
		);
	}, [data, updateSearch]);
	const updatePager = usePager(filteredUpdates, `${data?.fetchedAt}|${updateSearch}`);

	// Dal numero di minacce di un dispositivo all'elenco filtrato su quel dispositivo.
	const showThreatsOf = (name: string) => {
		setThreatSearch(name);
		setThreatType("all");
		setThreatSeverity("all");
		document.getElementById("hiendpoint-threats")?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	if (!data) return <ServiceNotConnected service="HiEndpoint" loading={loading} detail={error} />;

	const { stats, detectedThreats, pendingUpdates } = data;
	const threatTypes = Array.from(new Set(detectedThreats.map((t) => t.type))).sort();
	const protectionScore = stats.totalEndpoints > 0 ? Math.round((stats.protectedEndpoints / stats.totalEndpoints) * 100) : 0;
	const complianceScore = endpoints.length > 0 ? Math.round(endpoints.reduce((s, e) => s + e.compliance, 0) / endpoints.length) : 0;
	const p = scoreLevel(protectionScore);
	const c = scoreLevel(complianceScore);
	const types = Array.from(new Set(endpoints.map((e) => e.type)));

	const kpis = [
		{
			icon: Cpu,
			value: stats.totalEndpoints,
			label: "Totale endpoint",
			tone: "text-primary",
			valueTone: "",
		},
		{
			icon: ShieldCheck,
			value: stats.protectedEndpoints,
			label: "Protetti",
			tone: "text-green-500",
			valueTone: "text-green-500",
		},
		{
			icon: ShieldAlert,
			value: stats.atRiskEndpoints,
			label: "A rischio",
			tone: "text-red-500",
			valueTone: "text-red-500",
		},
		{
			icon: CheckCircle,
			value: stats.onlineEndpoints,
			label: "Online",
			tone: "text-green-500",
			valueTone: "text-green-500",
		},
		{
			icon: XCircle,
			value: stats.offlineEndpoints,
			label: "Offline",
			tone: "text-muted-foreground",
			valueTone: "text-muted-foreground",
		},
		{
			icon: Clock,
			value: stats.pendingUpdates,
			label: "Da aggiornare",
			tone: "text-yellow-500",
			valueTone: "text-yellow-500",
		},
	];

	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="text-2xl font-bold">Endpoint Overview</h2>
					<DemoDataBadge show={isMock} />
					{data.fetchedAt && <span className="text-sm text-muted-foreground">Aggiornato alle {fmtDate(data.fetchedAt)}</span>}
				</div>
				{(data.stale || data.lastError) && (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
						{data.lastError
							? `Ultima lettura non riuscita (${fmtDate(data.lastError.at)}): ${data.lastError.message} Sono mostrati gli ultimi dati validi.`
							: "I dati non sono aggiornati: l'ultima lettura riuscita risale a oltre 30 minuti fa."}
					</div>
				)}

				<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
					{kpis.map((k) => (
						<Card key={k.label} className="border-border">
							<CardContent className="pb-4 pt-4">
								<div className="flex flex-col items-center text-center">
									<k.icon className={cn("mb-2 h-6 w-6", k.tone)} />
									<p className={cn("text-2xl font-bold", k.valueTone)}>{k.value}</p>
									<p className="text-xs text-muted-foreground">{k.label}</p>
								</div>
							</CardContent>
						</Card>
					))}
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="relative">
						<RiskScoreCard
							title="Endpoint Protection Score"
							level={p.level}
							levelColor={p.color}
							score={protectionScore}
							ringColor={p.ring}
						/>
						<ScoreInfo text="Quota dei dispositivi protetti: stato di salute buono e protezione aggiornata, sul totale dei dispositivi." />
					</div>
					<div className="relative">
						<RiskScoreCard title="Compliance Score" level={c.level} levelColor={c.color} score={complianceScore} ringColor={c.ring} />
						<ScoreInfo text="Media della conformità dei dispositivi. Ognuno parte da 100 e perde: salute compromessa 40 (sospetta 25, sconosciuta 15), protezione anti-manomissione spenta 20, protezione non supportata 25 o da aggiornare 10, nessun contatto da oltre 7 giorni 15, 10 per minaccia aperta fino a 30." />
					</div>
				</div>
			</section>

			<section className="space-y-4">
				<h2 className="text-2xl font-bold">Elenco Endpoint</h2>
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-lg">
							<Laptop className="h-5 w-5 text-primary" />
							Endpoint monitorati
						</CardTitle>
						<p className="text-sm text-muted-foreground">Stato e protezione di tutti gli endpoint, dal meno conforme.</p>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex flex-wrap items-center gap-2">
							<div className="relative min-w-[220px] flex-1">
								<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Cerca nome o sistema operativo…"
									className="pl-8"
								/>
							</div>
							<FilterSelect value={protection} onChange={setProtection} all="Ogni protezione" options={Object.entries(protectionLabel)} />
							<FilterSelect
								value={status}
								onChange={setStatus}
								all="Online e offline"
								options={[
									["Online", "Online"],
									["Offline", "Offline"],
								]}
							/>
							{types.length > 1 && <FilterSelect value={type} onChange={setType} all="Ogni tipo" options={types.map((t) => [t, t])} />}
						</div>
						<Pager p={devicePager} />
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Tipo</TableHead>
										<TableHead>Nome</TableHead>
										<TableHead>Sistema operativo</TableHead>
										<TableHead>Ultimo contatto</TableHead>
										<TableHead>Stato</TableHead>
										<TableHead>Protezione</TableHead>
										<TableHead>Minacce</TableHead>
										<TableHead>Conformità</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{devicePager.visible.map((e) => {
										const TypeIcon = typeIcons[e.type] ?? Monitor;
										return (
											<TableRow key={e.id}>
												<TableCell>
													<Tooltip>
														<TooltipTrigger asChild>
															<span className="inline-flex cursor-help">
																<TypeIcon className="h-4 w-4 text-muted-foreground" />
															</span>
														</TooltipTrigger>
														<TooltipContent>{e.type}</TooltipContent>
													</Tooltip>
												</TableCell>
												<TableCell className="font-medium">
													{e.name}
													{e.isolated && <Badge className="ml-2 bg-red-500/20 text-red-500">Isolato</Badge>}
												</TableCell>
												<TableCell className="text-sm">{e.os ?? "—"}</TableCell>
												<TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(e.lastSeen)}</TableCell>
												<TableCell>
													<Badge className={e.status === "Online" ? "bg-green-500/20 text-green-500" : "bg-muted text-muted-foreground"}>
														{e.status}
													</Badge>
												</TableCell>
												<TableCell>
													<Badge className={protectionColors[e.protection]}>{protectionLabel[e.protection]}</Badge>
													{e.tamperProtection === false && <p className="mt-1 text-[10px] text-amber-500">Anti-manomissione spenta</p>}
												</TableCell>
												<TableCell>
													{e.threats > 0 ? (
														<button
															type="button"
															className="font-semibold text-red-500 underline-offset-2 hover:underline"
															onClick={() => showThreatsOf(e.name)}
															title="Mostra le minacce di questo endpoint"
														>
															{e.threats}
														</button>
													) : (
														<span className="text-green-500">0</span>
													)}
												</TableCell>
												<TableCell>
													<div className="flex items-center gap-2">
														<div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
															<div
																className={cn(
																	"h-full rounded-full",
																	e.compliance >= 90 ? "bg-green-500" : e.compliance >= 70 ? "bg-yellow-500" : "bg-red-500",
																)}
																style={{ width: `${e.compliance}%` }}
															/>
														</div>
														<span className="text-xs text-muted-foreground">{e.compliance}%</span>
													</div>
												</TableCell>
											</TableRow>
										);
									})}
									{devicePager.visible.length === 0 && (
										<TableRow>
											<TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
												Nessun endpoint corrisponde ai filtri.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
						{devicePager.total > devicePager.size && <Pager p={devicePager} />}
					</CardContent>
				</Card>
			</section>

			<section className="scroll-mt-24 space-y-4" id="hiendpoint-threats">
				<h2 className="text-2xl font-bold">Minacce Rilevate</h2>
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-lg">
							<AlertTriangle className="h-5 w-5 text-orange-500" />
							Minacce e problemi di protezione aperti
						</CardTitle>
						<p className="text-sm text-muted-foreground">Avvisi ancora aperti sugli endpoint, dal più recente.</p>
					</CardHeader>
					<CardContent className="space-y-3">
						{detectedThreats.length === 0 ? (
							<p className="text-sm text-muted-foreground">Nessuna minaccia aperta.</p>
						) : (
							<>
								<div className="flex flex-wrap items-center gap-2">
									<div className="relative min-w-[220px] flex-1">
										<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											value={threatSearch}
											onChange={(e) => setThreatSearch(e.target.value)}
											placeholder="Cerca endpoint o descrizione…"
											className="pl-8"
										/>
									</div>
									<FilterSelect value={threatType} onChange={setThreatType} all="Ogni tipo" options={threatTypes.map((t) => [t, t])} />
									<FilterSelect
										value={threatSeverity}
										onChange={setThreatSeverity}
										all="Ogni gravità"
										options={Object.entries(severityLabel)}
									/>
									{(threatSearch || threatType !== "all" || threatSeverity !== "all") && (
										<button
											type="button"
											className="text-sm text-muted-foreground hover:underline"
											onClick={() => {
												setThreatSearch("");
												setThreatType("all");
												setThreatSeverity("all");
											}}
										>
											Azzera filtri
										</button>
									)}
								</div>
								<Pager p={threatPager} />
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Endpoint</TableHead>
												<TableHead>Descrizione</TableHead>
												<TableHead>Tipo</TableHead>
												<TableHead>Rilevata</TableHead>
												<TableHead>Gravità</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{threatPager.visible.map((t) => (
												<TableRow key={t.id}>
													<TableCell className="font-medium">{t.endpoint ?? "—"}</TableCell>
													<TableCell className="text-sm">{t.threatName}</TableCell>
													<TableCell>{t.type}</TableCell>
													<TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(t.detectedAt)}</TableCell>
													<TableCell>
														<Badge className={severityColors[t.severity]}>{severityLabel[t.severity]}</Badge>
													</TableCell>
												</TableRow>
											))}
											{threatPager.visible.length === 0 && (
												<TableRow>
													<TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
														Nessuna minaccia corrisponde ai filtri.
													</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</div>
								{threatPager.total > threatPager.size && <Pager p={threatPager} />}
							</>
						)}
					</CardContent>
				</Card>
			</section>

			<section className="space-y-4">
				<h2 className="text-2xl font-bold">Aggiornamenti Pendenti</h2>
				<Card className="border-border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-lg">
							<Clock className="h-5 w-5 text-yellow-500" />
							Protezione da aggiornare
						</CardTitle>
						<p className="text-sm text-muted-foreground">Endpoint con il pacchetto di protezione non aggiornato o non più supportato.</p>
					</CardHeader>
					<CardContent className="space-y-3">
						{pendingUpdates.length === 0 ? (
							<p className="text-sm text-muted-foreground">Tutti gli endpoint hanno la protezione aggiornata.</p>
						) : (
							<>
								<div className="relative max-w-md">
									<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={updateSearch}
										onChange={(e) => setUpdateSearch(e.target.value)}
										placeholder="Cerca endpoint o versione…"
										className="pl-8"
									/>
								</div>
								{updatePager.total > 10 && <Pager p={updatePager} />}
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Endpoint</TableHead>
												<TableHead>Motivo</TableHead>
												<TableHead>Versione attuale</TableHead>
												<TableHead>Disponibile</TableHead>
												<TableHead>Priorità</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{updatePager.visible.map((u, i) => (
												<TableRow key={`${u.endpoint}-${i}`}>
													<TableCell className="font-medium">{u.endpoint ?? "—"}</TableCell>
													<TableCell>{u.reason ?? u.component}</TableCell>
													<TableCell className="font-mono text-sm">{u.currentVersion ?? "—"}</TableCell>
													<TableCell className="font-mono text-sm text-green-500">{u.latestVersion ?? "—"}</TableCell>
													<TableCell>
														<Badge className={severityColors[u.priority]}>{severityLabel[u.priority]}</Badge>
													</TableCell>
												</TableRow>
											))}
											{updatePager.visible.length === 0 && (
												<TableRow>
													<TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
														Nessun endpoint corrisponde alla ricerca.
													</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</div>
							</>
						)}
					</CardContent>
				</Card>
			</section>
		</div>
	);
};

function ScoreInfo({ text }: { text: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button type="button" className="absolute right-3 top-3 text-muted-foreground" aria-label="Come si calcola">
					<Info className="h-4 w-4" />
				</button>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
		</Tooltip>
	);
}

function FilterSelect({
	value,
	onChange,
	all,
	options,
}: {
	value: string;
	onChange: (v: string) => void;
	all: string;
	options: Array<[string, string]>;
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className="h-9 w-[170px] text-sm">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">{all}</SelectItem>
				{options.map(([v, label]) => (
					<SelectItem key={v} value={v}>
						{label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
