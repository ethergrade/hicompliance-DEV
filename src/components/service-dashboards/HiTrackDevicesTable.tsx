// Elenco dei device HiTrack: ricerca, filtri per colonna, paginazione
// 10/30/50/100 con i comandi sopra e sotto la lista, e la qualità rete di
// ogni device (network-quality, calcolata dal backend).
import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, Search } from "lucide-react";
import { HiTrackDeviceDetailSheet } from "./HiTrackDeviceDetailSheet";
import { formatMillis, formatPercent } from "@/lib/hitrack/formatters";
import { useUserRoles } from "@/hooks/useUserRoles";
import type { HiTrackMonitoredDevice, HiTrackNetworkQuality } from "@/lib/hitrack/types";

const PAGE_SIZES = [10, 30, 50, 100];

const statusBadgeClassName: Record<HiTrackMonitoredDevice["statusType"], string> = {
	success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
	warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
	error: "border-red-500/30 bg-red-500/10 text-red-300",
	muted: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

const HEALTH: Record<HiTrackNetworkQuality["health"], { label: string; className: string; bar: string }> = {
	green: { label: "Verde", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", bar: "bg-emerald-500" },
	amber: { label: "Attenzione", className: "border-amber-500/30 bg-amber-500/10 text-amber-300", bar: "bg-amber-500" },
	red: { label: "Critico", className: "border-red-500/30 bg-red-500/10 text-red-300", bar: "bg-red-500" },
	unknown: { label: "Dato non disponibile", className: "border-slate-500/30 bg-slate-500/10 text-slate-300", bar: "bg-slate-500" },
};

const REASON: Record<string, string> = {
	packet_loss_ge_5pct: "Perdita di pacchetti ≥ 5%",
	packet_loss_ge_1pct: "Perdita di pacchetti ≥ 1%",
	rtd_median_ge_300ms: "RTD mediana ≥ 300 ms",
	rtd_median_ge_150ms: "RTD mediana ≥ 150 ms",
	rtd_spike_ge_150ms: "Picco RTD (worst − mediana) ≥ 150 ms",
	quality_lt_50: "Qualità sotto 50",
	quality_lt_80: "Qualità sotto 80",
	total_packet_loss: "Tutti i probe persi",
	missing_metrics: "Metriche mancanti",
	invalid_metrics: "Metriche non coerenti",
	stale_metrics: "Misura non aggiornata",
	insufficient_samples: "Troppi pochi probe per valutare",
	few_samples: "Pochi probe: valore provvisorio",
	no_probe_counts: "Numero di probe non disponibile",
	no_observed_at: "Ora della misura non disponibile",
	mixed_window: "RTD e perdita da finestre diverse",
	icmp_rate_limited: "Il device limita le risposte ai ping: perdita non considerata",
};

// Motivi sull'affidabilità del dato, non sulla rete: li vede solo il super-admin,
// insieme alla versione dell'algoritmo. Al cliente porterebbero domande sulla
// sorgente dei dati senza dirgli niente della sua rete. L'etichetta "Provvisorio"
// non c'è più per nessuno (richiesta del 15 ottobre 2026).
const DATA_QUALITY_REASONS = new Set(["mixed_window", "no_observed_at", "few_samples", "no_probe_counts"]);

type Filters = { device: string; ip: string; status: string; health: string; os: string };
const EMPTY_FILTERS: Filters = { device: "", ip: "", status: "all", health: "all", os: "" };

const includes = (value: string | null | undefined, needle: string) =>
	!needle || (value ?? "").toLowerCase().includes(needle.toLowerCase());

export function HiTrackDevicesTable({ devices }: { devices: HiTrackMonitoredDevice[] }) {
	const [search, setSearch] = useState("");
	const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [opened, setOpened] = useState<HiTrackMonitoredDevice | null>(null);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return devices.filter((d) => {
			if (
				q &&
				![d.deviceName, d.ipAddress, d.type, d.vendor, d.model, d.osName, d.osVersion, d.location].some((v) =>
					(v ?? "").toLowerCase().includes(q),
				)
			) {
				return false;
			}
			if (!includes(`${d.deviceName} ${d.type} ${d.vendor ?? ""} ${d.model ?? ""}`, filters.device)) return false;
			if (!includes(d.ipAddress, filters.ip)) return false;
			if (filters.status !== "all" && d.status !== filters.status) return false;
			if (filters.health !== "all" && (d.networkQuality?.health ?? "unknown") !== filters.health) return false;
			if (!includes([d.osName, d.osVersion].filter(Boolean).join(" "), filters.os)) return false;
			return true;
		});
	}, [devices, search, filters]);

	useEffect(() => setPage(1), [search, filters, pageSize]);

	const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
	const current = Math.min(page, lastPage);
	const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

	const setFilter = (key: keyof Filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));

	const pager = (
		<div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
			<div className="flex items-center gap-2">
				<span>Mostra</span>
				{PAGE_SIZES.map((size) => (
					<Button key={size} size="sm" variant={pageSize === size ? "default" : "outline"} className="h-7 px-2" onClick={() => setPageSize(size)}>
						{size}
					</Button>
				))}
			</div>
			<div className="flex items-center gap-2">
				<span>
					{filtered.length} device · pagina {current} di {lastPage}
				</span>
				<Button size="sm" variant="outline" className="h-7" disabled={current <= 1} onClick={() => setPage(current - 1)}>
					Precedenti
				</Button>
				<Button size="sm" variant="outline" className="h-7" disabled={current >= lastPage} onClick={() => setPage(current + 1)}>
					Successivi
				</Button>
			</div>
		</div>
	);

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<div className="relative min-w-[240px] flex-1">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca device, IP, vendor, modello, OS…" className="pl-8" />
				</div>
				{(search || JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)) && (
					<Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilters(EMPTY_FILTERS); }}>
						Azzera filtri
					</Button>
				)}
			</div>

			{pager}

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Device</TableHead>
						<TableHead>IP</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Qualità rete</TableHead>
						<TableHead>RTD Worst</TableHead>
						<TableHead>RTD Median</TableHead>
						<TableHead>Packet Loss</TableHead>
						<TableHead>OS</TableHead>
					</TableRow>
					<TableRow className="hover:bg-transparent">
						<TableHead className="py-1">
							<Input value={filters.device} onChange={(e) => setFilter("device", e.target.value)} placeholder="Filtra" className="h-7 text-xs" />
						</TableHead>
						<TableHead className="py-1">
							<Input value={filters.ip} onChange={(e) => setFilter("ip", e.target.value)} placeholder="Filtra" className="h-7 text-xs" />
						</TableHead>
						<TableHead className="py-1">
							<Select value={filters.status} onValueChange={(v) => setFilter("status", v)}>
								<SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Tutti</SelectItem>
									<SelectItem value="online">Online</SelectItem>
									<SelectItem value="offline">Offline</SelectItem>
									<SelectItem value="unknown">Non disponibile</SelectItem>
								</SelectContent>
							</Select>
						</TableHead>
						<TableHead className="py-1">
							<Select value={filters.health} onValueChange={(v) => setFilter("health", v)}>
								<SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Tutte</SelectItem>
									{(Object.keys(HEALTH) as Array<keyof typeof HEALTH>).map((k) => (
										<SelectItem key={k} value={k}>{HEALTH[k].label}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</TableHead>
						<TableHead className="py-1" />
						<TableHead className="py-1" />
						<TableHead className="py-1" />
						<TableHead className="py-1">
							<Input value={filters.os} onChange={(e) => setFilter("os", e.target.value)} placeholder="Filtra" className="h-7 text-xs" />
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{visible.map((device) => (
						<TableRow key={device.id}>
							<TableCell>
								{/* Ogni device si apre (c'è almeno l'andamento della qualità rete), ma
								    il viola resta il segno dei dati SNMP: interfacce o inventario. */}
								<button
									type="button"
									className={`flex items-center gap-1 text-left font-medium hover:underline ${
										(device.interfaceCount ?? 0) + (device.inventoryCount ?? 0) > 0 ? "text-primary" : "text-foreground"
									}`}
									onClick={() => setOpened(device)}
									title={(device.interfaceCount ?? 0) + (device.inventoryCount ?? 0) > 0 ? "Apri interfacce e dettaglio" : "Apri il dettaglio"}
								>
									{device.deviceName}
									<ChevronRight className="h-3.5 w-3.5" />
								</button>
								<p className="text-xs text-muted-foreground">
									{device.type} · {[device.vendor, device.model].filter(Boolean).join(" ") || "Vendor N/D"}
									{(device.interfaceCount ?? 0) > 0 && ` · ${device.interfaceCount} interfacce`}
								</p>
							</TableCell>
							<TableCell>{device.ipAddress || "Dato non disponibile"}</TableCell>
							<TableCell>
								<DeviceStatusBadge device={device} />
							</TableCell>
							<TableCell className="min-w-[170px]">
								<NetworkQualityCell quality={device.networkQuality} />
							</TableCell>
							<TableCell>{formatMillis(device.rtdWorstMs)}</TableCell>
							<TableCell>{formatMillis(device.rtdMedianMs)}</TableCell>
							<TableCell>{formatPercent(device.packetLossPercent)}</TableCell>
							<TableCell>{[device.osName, device.osVersion].filter(Boolean).join(" ") || "Dato non disponibile"}</TableCell>
						</TableRow>
					))}
					{visible.length === 0 && (
						<TableRow>
							<TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
								{devices.length === 0 ? "Nessun dispositivo gestito disponibile." : "Nessun dispositivo corrisponde ai filtri."}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>

			{filtered.length > pageSize && pager}

			<HiTrackDeviceDetailSheet device={opened} onOpenChange={(open) => !open && setOpened(null)} />
		</div>
	);
}

function NetworkQualityCell({ quality }: { quality?: HiTrackNetworkQuality }) {
	const { isSuperAdmin } = useUserRoles();
	const q = quality ?? { algorithmVersion: "network-quality-v1", score: null, health: "unknown" as const, dataQuality: "provisional" as const, reasons: ["missing_metrics"], observedAt: null };
	const h = HEALTH[q.health] ?? HEALTH.unknown;
	const reasons = isSuperAdmin ? q.reasons : q.reasons.filter((r) => !DATA_QUALITY_REASONS.has(r));

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="cursor-help space-y-1">
					<div className="flex items-center gap-2">
						<Badge className={h.className}>{h.label}</Badge>
					</div>
					{q.score !== null && (
						<div className="flex items-center gap-2">
							<div className="h-1.5 w-20 rounded-full bg-muted">
								<div className={`h-1.5 rounded-full ${h.bar}`} style={{ width: `${q.score}%` }} />
							</div>
							<span className="text-xs">{q.score}/100</span>
						</div>
					)}
					<Sparkline values={q.trend ?? []} />
				</div>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs space-y-1 text-xs">
				<p className="font-medium">Qualità rete dal collector al device</p>
				<p>Indice da RTD mediana, picco RTD e perdita di pacchetti: non misura la banda.</p>
				{(q.trend?.length ?? 0) > 1 && <p className="text-muted-foreground">Linea: andamento delle ultime 24 ore (0–100).</p>}
				{reasons.length > 0 && (
					<ul className="list-disc pl-4">
						{reasons.map((r) => (
							<li key={r}>{REASON[r] ?? r}</li>
						))}
					</ul>
				)}
				{/* L'ora dell'ultima misura per ora non si mostra: la misura arriva ogni
				    30 minuti e finché non c'è un dato più vicino al tempo reale l'ora
				    fa sembrare il dato vecchio. Resta nel grafico del dettaglio. */}
				{isSuperAdmin && <p className="text-muted-foreground">{q.algorithmVersion}</p>}
			</TooltipContent>
		</Tooltip>
	);
}

/** Colore di un tratto: le stesse soglie del grafico nel dettaglio (80 e 50). */
const bandColor = (v: number) => (v >= 80 ? "#10b981" : v >= 50 ? "#f59e0b" : "#ef4444");

/**
 * Andamento delle ultime 24 ore. La scala si adatta ai valori del device (almeno
 * 20 punti di ampiezza, centrata): una linea stabile sta a metà riquadro invece
 * che incollata al bordo, e un calo occupa tutta l'altezza. Il livello assoluto
 * lo dice il colore: ogni tratto prende la soglia del punto più basso (verde da
 * 80, ambra da 50, rosso sotto). Una misura che manca spezza la linea.
 */
function Sparkline({ values }: { values: Array<number | null> }) {
	const present = values.filter((v): v is number => v !== null);
	if (present.length < 2) return null;

	const w = 96;
	const hgt = 20;
	const lo = Math.min(...present);
	const hi = Math.max(...present);
	const span = Math.max(hi - lo, 20);
	const mid = (hi + lo) / 2;
	const dLo = mid - span / 2 - 2;
	const dHi = mid + span / 2 + 2;
	const x = (i: number) => (i * w) / Math.max(values.length - 1, 1);
	const y = (v: number) => hgt - ((v - dLo) / (dHi - dLo)) * hgt;

	const segments: Array<{ d: string; color: string }> = [];
	values.forEach((v, i) => {
		const prev = i > 0 ? values[i - 1] : null;
		if (v === null || prev === null || prev === undefined) return;
		segments.push({ d: `M${x(i - 1).toFixed(1)},${y(prev).toFixed(1)} L${x(i).toFixed(1)},${y(v).toFixed(1)}`, color: bandColor(Math.min(prev, v)) });
	});
	const last = values[values.length - 1];

	return (
		<div className="flex items-center gap-1.5" title={`Ultime 24 ore: minimo ${lo}, massimo ${hi}`}>
			<svg width={w} height={hgt} viewBox={`0 0 ${w} ${hgt}`} className="overflow-visible" aria-label="Andamento delle ultime 24 ore">
				{segments.map((s) => (
					<path key={s.d} d={s.d} stroke={s.color} strokeWidth={1.75} fill="none" strokeLinecap="round" />
				))}
				{last !== null && last !== undefined && <circle cx={x(values.length - 1)} cy={y(last)} r={2} fill={bandColor(last)} />}
			</svg>
			<span className="text-[10px] leading-none text-muted-foreground">24h</span>
		</div>
	);
}

const STATUS_LABEL: Record<string, string> = { online: "Online", offline: "Offline", unknown: "Non disponibile" };

/** Online/offline del device; nel tooltip da quando è in quello stato. */
function DeviceStatusBadge({ device }: { device: HiTrackMonitoredDevice }) {
	const label = STATUS_LABEL[device.status] ?? device.status;
	const since = device.lastStatusChangeAt ? new Date(device.lastStatusChangeAt) : null;
	const badge = <Badge className={statusBadgeClassName[device.statusType]}>{label}</Badge>;

	if (!since || Number.isNaN(since.getTime()) || device.status === "unknown") return badge;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="cursor-help">{badge}</span>
			</TooltipTrigger>
			<TooltipContent className="text-xs">
				{label} dal {since.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
			</TooltipContent>
		</Tooltip>
	);
}
