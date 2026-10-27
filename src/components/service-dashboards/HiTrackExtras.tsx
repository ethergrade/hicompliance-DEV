// Pezzi della vista HiTrack portati dal prototipo di ottobre 2026: sparkline di
// RAM e dischi su scala fissa, grafico grande, pannello del punteggio, filtri dei
// riquadri. Il punteggio e le sue voci arrivano dal backend: qui non si ricalcola.
import React, { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatPercent } from "@/lib/hitrack/formatters";
import { THRESHOLDS, usageSeverity, worstHosts, type HostHealth, type Severity } from "@/lib/hitrack/hostHealth";
import type { HiTrackHealthComponent, HiTrackHealthHistory, HiTrackOverview, HiTrackTrendWindow } from "@/lib/hitrack/types";
import { useHiTrackHealthHistory } from "@/hooks/useHiTrackDashboard";

export const severityClass: Record<Severity, string> = {
	ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
	warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
	crit: "border-red-500/30 bg-red-500/10 text-red-300",
};

/** Salute di un host (0-100): verde da 80, ambra da 50, rosso sotto. */
export const scoreSeverity = (s: number): Severity => (s < 50 ? "crit" : s < 80 ? "warn" : "ok");

const USAGE_COLOR: Record<Severity, string> = { ok: "#10b981", warn: "#f59e0b", crit: "#ef4444" };
const WINDOW_LABEL: Record<HiTrackTrendWindow, string> = { "24h": "ultime 24 ore", "7d": "ultimi 7 giorni", "30d": "ultimi 30 giorni" };

/**
 * Andamento di un uso percentuale su scala fissa 0-100. Prima la scala era il
 * massimo della serie: una RAM stabile al 40% disegnava una linea in cima al
 * riquadro, come se fosse piena. La linea tratteggiata è la soglia di attenzione.
 */
export const UsageSparkline: React.FC<{ values: number[]; window: HiTrackTrendWindow; onOpen?: () => void }> = ({ values, window, onOpen }) => {
	if (values.length < 2) return <span className="text-xs text-muted-foreground">Storico non disponibile</span>;

	const last = values[values.length - 1];
	const min = Math.min(...values);
	const max = Math.max(...values);
	const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${100 - Math.max(0, Math.min(100, v))}`).join(" ");

	return (
		<button
			type="button"
			onClick={onOpen}
			className="flex items-center gap-2 rounded text-left hover:bg-muted/40"
			title={`${WINDOW_LABEL[window]}: ultimo ${last.toFixed(1)}%, minimo ${min.toFixed(1)}%, massimo ${max.toFixed(1)}%. Clic per il grafico.`}
		>
			<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-28">
				<line
					x1="0" x2="100" y1={100 - THRESHOLDS.usageWarn} y2={100 - THRESHOLDS.usageWarn}
					stroke="currentColor" className="text-muted-foreground/40" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke"
				/>
				<polyline fill="none" stroke={USAGE_COLOR[usageSeverity(last)]} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={points} />
			</svg>
			<span className="text-[10px] leading-tight text-muted-foreground">
				<span className="block font-medium text-foreground">{last.toFixed(1)}%</span>
				{min.toFixed(0)}–{max.toFixed(0)}%
			</span>
		</button>
	);
};

/** Il grafico grande di una sparkline, con le soglie di attenzione e critico. */
export const UsageTrendDialog: React.FC<{
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	values: number[];
	window: HiTrackTrendWindow;
}> = ({ open, onOpenChange, title, values, window }) => {
	const rows = values.map((v, i) => ({ i: i + 1, uso: Number(v.toFixed(1)) }));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>{title} · {WINDOW_LABEL[window]}</DialogTitle>
				</DialogHeader>
				{rows.length < 2 ? (
					<p className="text-sm text-muted-foreground">Storico non disponibile.</p>
				) : (
					<div className="h-72">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={rows}>
								<CartesianGrid strokeDasharray="3 3" className="stroke-border" />
								<XAxis dataKey="i" tick={{ fontSize: 11 }} />
								<YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
								<Tooltip formatter={(v: number) => [`${v}%`, "Uso"]} labelFormatter={() => ""} />
								<ReferenceLine y={THRESHOLDS.usageWarn} stroke={USAGE_COLOR.warn} strokeDasharray="4 4" />
								<ReferenceLine y={THRESHOLDS.usageCrit} stroke={USAGE_COLOR.crit} strokeDasharray="4 4" />
								<Line type="monotone" dataKey="uso" stroke="#38bdf8" dot={false} strokeWidth={2} isAnimationActive={false} />
							</LineChart>
						</ResponsiveContainer>
					</div>
				)}
				<p className="text-xs text-muted-foreground">
					Dal più vecchio al più recente; ogni punto è la media del periodo. Linee tratteggiate: attenzione {THRESHOLDS.usageWarn}%, critico {THRESHOLDS.usageCrit}%.
				</p>
			</DialogContent>
		</Dialog>
	);
};

const COMPONENTS: Array<{ key: HiTrackHealthComponent; label: string; detail: (o: HiTrackOverview) => string }> = [
	{ key: "availability", label: "Disponibilità", detail: () => "Quota di dispositivi gestiti online" },
	{ key: "alerts", label: "Alert aperti", detail: () => "Un punto in meno per ogni alert aperto" },
	{
		key: "packetLoss",
		label: "Perdita di pacchetti",
		detail: (o) =>
			o.avgPacketLossPercent === null || o.avgPacketLossPercent === undefined
				? "Misura non disponibile: la voce vale zero"
				: `Media ${o.avgPacketLossPercent.toFixed(2)}%: un punto in meno per ogni punto percentuale`,
	},
	{ key: "coverage", label: "Copertura dati", detail: (o) => `${o.dataCoveragePercent.toFixed(1)}% dei dati attesi su RAM e dischi` },
	{ key: "freshness", label: "Freschezza", detail: () => "Dati dell'ultimo giro di raccolta" },
];

/** Perché il punteggio è quello: le voci, i 5 host peggiori, le soglie e l'andamento. */
export const HealthSheet: React.FC<{
	open: boolean;
	onOpenChange: (open: boolean) => void;
	overview: HiTrackOverview;
	hosts: HostHealth[];
}> = ({ open, onOpenChange, overview, hosts }) => {
	const [days, setDays] = useState<HiTrackHealthHistory["days"]>(30);
	const history = useHiTrackHealthHistory(days, open);
	const worst = worstHosts(hosts);
	const breakdown = overview.healthBreakdown;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>Health Score {formatPercent(overview.healthScore)}</SheetTitle>
				</SheetHeader>

				<section className="mt-4 space-y-3">
					<p className="text-sm font-medium">Composizione del punteggio</p>
					{!breakdown && <p className="text-sm text-muted-foreground">Composizione non disponibile.</p>}
					{breakdown &&
						COMPONENTS.map(({ key, label, detail }) => (
							<div key={key} className="rounded-lg border border-border p-3">
								<div className="flex justify-between text-sm">
									<span>{label}</span>
									<span className="font-medium">
										{breakdown[key].points.toFixed(1)} / {breakdown[key].max}
									</span>
								</div>
								<Progress value={(breakdown[key].points / breakdown[key].max) * 100} className="mt-2" />
								<p className="mt-1 text-xs text-muted-foreground">{detail(overview)}</p>
							</div>
						))}
					{breakdown && <p className="text-xs text-muted-foreground">La somma delle voci è il punteggio; con più reti è la media delle reti.</p>}
				</section>

				<section className="mt-6 space-y-2">
					<div className="flex items-center justify-between">
						<p className="text-sm font-medium">Andamento</p>
						<div className="flex gap-1">
							{([30, 90, 365] as const).map((d) => (
								<Button key={d} size="sm" className="h-7" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
									{d === 365 ? "1 anno" : `${d} giorni`}
								</Button>
							))}
						</div>
					</div>
					<HealthHistoryChart points={history.data?.points ?? []} loading={history.isLoading} />
				</section>

				<section className="mt-6 space-y-3">
					<p className="text-sm font-medium">I 5 host con più problemi</p>
					{worst.length === 0 && <p className="text-sm text-muted-foreground">Nessun host con problemi di disponibilità, RAM, disco o rete.</p>}
					{worst.map((h) => (
						<div key={h.device.id} className="rounded-lg border border-border p-3">
							<div className="flex items-center justify-between gap-2">
								<div>
									<p className="font-medium">{h.device.deviceName}</p>
									<p className="text-xs text-muted-foreground">{h.device.ipAddress ?? "IP non disponibile"} · {h.device.type}</p>
								</div>
								{h.score !== null && <Badge className={severityClass[scoreSeverity(h.score)]}>{h.score}/100</Badge>}
							</div>
							<div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
								<span>Disponibilità {fmt(h.availability)}</span>
								<span>RAM {fmt(h.ram)}</span>
								<span>Disco {fmt(h.disk)}</span>
								<span>Rete {fmt(h.network)}</span>
							</div>
							<ul className="mt-2 space-y-1">
								{h.reasons.map((r) => (
									<li key={r.kind} className="flex items-center gap-2 text-sm">
										<Badge className={severityClass[r.severity]}>{r.severity === "crit" ? "Critico" : "Attenzione"}</Badge>
										{r.text}
									</li>
								))}
							</ul>
						</div>
					))}
				</section>

				<section className="mt-6 space-y-1 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
					<p className="font-medium text-foreground">Soglie</p>
					<p>RAM e disco: attenzione dal {THRESHOLDS.usageWarn}%, critico dal {THRESHOLDS.usageCrit}%.</p>
					<p>Rete: la qualità rete del dispositivo (latenza e perdita di pacchetti verso il dispositivo), attenzione sotto 80, critico sotto 50.</p>
					<p>Salute di un host: media di disponibilità, RAM, disco e rete; le voci senza dato non pesano.</p>
				</section>
			</SheetContent>
		</Sheet>
	);
};

const fmt = (v: number | null) => (v === null ? "N/D" : v.toFixed(0));

function HealthHistoryChart({ points, loading }: { points: Array<{ t: string; v: number }>; loading: boolean }) {
	if (loading) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
	if (points.length < 2) return <p className="text-sm text-muted-foreground">Storico non disponibile.</p>;

	const rows = points.map((p) => ({ ...p, giorno: new Date(`${p.t}T00:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) }));

	return (
		<div className="h-48">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={rows}>
					<CartesianGrid strokeDasharray="3 3" className="stroke-border" />
					<XAxis dataKey="giorno" tick={{ fontSize: 11 }} minTickGap={16} />
					<YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={32} />
					<Tooltip formatter={(v: number) => [v.toFixed(1), "Health Score"]} />
					<Line type="monotone" dataKey="v" stroke="#38bdf8" dot={false} strokeWidth={2} isAnimationActive={false} />
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}

/** Filtro per nome e livello, e ordinamento, dei riquadri dischi e RAM. */
export function useCardFilter<T>(rows: T[], name: (r: T) => string, usage: (r: T) => number | null) {
	const [q, setQ] = useState("");
	const [level, setLevel] = useState<"all" | Severity>("all");
	const [sort, setSort] = useState<"worst" | "best" | "az" | "za">("worst");

	const out = useMemo(() => {
		const filtered = rows.filter((r) => {
			if (q && !name(r).toLowerCase().includes(q.toLowerCase())) return false;
			if (level === "all") return true;
			const u = usage(r);
			return u !== null && usageSeverity(u) === level;
		});
		// Senza percentuale in fondo, in tutti gli ordinamenti per uso.
		const byUsage = (dir: 1 | -1) => (a: T, b: T) => {
			const x = usage(a), y = usage(b);
			if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
			return (x - y) * dir;
		};
		const compare = {
			worst: byUsage(-1),
			best: byUsage(1),
			az: (a: T, b: T) => name(a).localeCompare(name(b), "it"),
			za: (a: T, b: T) => name(b).localeCompare(name(a), "it"),
		}[sort];
		return [...filtered].sort(compare);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [rows, q, level, sort]);

	const controls = (
		<div className="flex flex-wrap gap-2">
			<Input className="h-8 w-40" placeholder="Filtra per nome" value={q} onChange={(e) => setQ(e.target.value)} />
			<Select value={level} onValueChange={(v) => setLevel(v as typeof level)}>
				<SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
				<SelectContent>
					<SelectItem value="all">Tutti i livelli</SelectItem>
					<SelectItem value="crit">Critico</SelectItem>
					<SelectItem value="warn">Attenzione</SelectItem>
					<SelectItem value="ok">OK</SelectItem>
				</SelectContent>
			</Select>
			<Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
				<SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
				<SelectContent>
					<SelectItem value="worst">Dal peggiore al migliore</SelectItem>
					<SelectItem value="best">Dal migliore al peggiore</SelectItem>
					<SelectItem value="az">Nome A-Z</SelectItem>
					<SelectItem value="za">Nome Z-A</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);

	return { rows: out, controls };
}
