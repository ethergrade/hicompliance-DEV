// Elenco dei device HiTrack: ricerca, filtri e ordinamento per colonna,
// paginazione 10/30/50/100 con i comandi sopra e sotto la lista, la qualità rete
// di ogni device (network-quality, calcolata dal backend), la salute dell'host,
// gruppi personali e tag condivisi.
import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, FolderPlus, Search, Tag, Trash2, X } from "lucide-react";
import { HiTrackDeviceDetailSheet } from "./HiTrackDeviceDetailSheet";
import { scoreSeverity, severityClass } from "./HiTrackExtras";
import { formatMillis, formatPercent } from "@/lib/hitrack/formatters";
import { hitrackOrganizeApi } from "@/lib/hitrack/client";
import type { HostHealth } from "@/lib/hitrack/hostHealth";
import { useHiTrackOrganize } from "@/hooks/useHiTrackDashboard";
import { usePermissions } from "@/hooks/usePermissions";
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

type Filters = {
	device: string;
	ip: string;
	status: string;
	health: string;
	os: string;
	maxScore: string;
	minLoss: string;
	group: string;
	tag: string;
};
const EMPTY_FILTERS: Filters = { device: "", ip: "", status: "all", health: "all", os: "", maxScore: "", minLoss: "", group: "all", tag: "all" };

const includes = (value: string | null | undefined, needle: string) =>
	!needle || (value ?? "").toLowerCase().includes(needle.toLowerCase());

type SortKey = "device" | "ip" | "status" | "score" | "quality" | "rtdWorst" | "rtdMedian" | "loss" | "os";
type SortDir = "asc" | "desc";

/** 10.0.0.9 prima di 10.0.0.10: l'IP si confronta ottetto per ottetto, non come testo. */
const ipKey = (ip: string | null) => {
	const parts = (ip ?? "").split(".").map(Number);
	return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
		? parts.reduce((acc, n) => acc * 256 + n, 0)
		: null;
};

const STATUS_ORDER: Record<string, number> = { offline: 0, unknown: 1, online: 2 };

function sortValue(d: HiTrackMonitoredDevice, h: HostHealth | undefined, key: SortKey): string | number | null {
	switch (key) {
		case "device": return d.deviceName;
		case "ip": return ipKey(d.ipAddress) ?? d.ipAddress;
		case "status": return STATUS_ORDER[d.status] ?? 1;
		case "score": return h?.score ?? null;
		case "quality": return d.networkQuality?.score ?? null;
		case "rtdWorst": return d.rtdWorstMs;
		case "rtdMedian": return d.rtdMedianMs;
		case "loss": return d.packetLossPercent;
		case "os": return [d.osName, d.osVersion].filter(Boolean).join(" ") || null;
	}
}

export function HiTrackDevicesTable({ devices, hosts }: { devices: HiTrackMonitoredDevice[]; hosts: HostHealth[] }) {
	const [search, setSearch] = useState("");
	const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
	// Di default in cima l'host messo peggio: è quello da guardare per primo.
	const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>({ key: "score", dir: "asc" });
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [opened, setOpened] = useState<HiTrackMonitoredDevice | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [groupBy, setGroupBy] = useState(false);
	const [newGroup, setNewGroup] = useState("");
	const [newTag, setNewTag] = useState("");

	const { data: organize, change } = useHiTrackOrganize();
	const { hasCapability } = usePermissions();
	const canTag = hasCapability("hitrack.organize");

	const healthById = useMemo(() => new Map(hosts.map((h) => [h.device.id, h])), [hosts]);
	const tagsOf = useMemo(() => {
		const m = new Map<string, string[]>();
		organize.tags.forEach((t) => m.set(t.deviceId, [...(m.get(t.deviceId) ?? []), t.tag]));
		return (id: string) => m.get(id) ?? [];
	}, [organize.tags]);
	const groupsOf = useMemo(() => {
		const m = new Map<string, string[]>();
		organize.groups.forEach((g) => g.deviceIds.forEach((id) => m.set(id, [...(m.get(id) ?? []), g.id])));
		return (id: string) => m.get(id) ?? [];
	}, [organize.groups]);
	const allTags = useMemo(() => [...new Set(organize.tags.map((t) => t.tag))].sort((a, b) => a.localeCompare(b, "it")), [organize.tags]);

	// Un filtro su un gruppo cancellato non deve lasciare la tabella vuota.
	useEffect(() => {
		if (filters.group !== "all" && !organize.groups.some((g) => g.id === filters.group)) {
			setFilters((f) => ({ ...f, group: "all" }));
		}
	}, [organize.groups, filters.group]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		const rows = devices.filter((d) => {
			if (
				q &&
				![d.deviceName, d.ipAddress, d.type, d.vendor, d.model, d.osName, d.osVersion, d.location, ...tagsOf(d.id)].some((v) =>
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
			const score = healthById.get(d.id)?.score ?? null;
			if (filters.maxScore !== "" && (score === null || score > Number(filters.maxScore))) return false;
			if (filters.minLoss !== "" && (d.packetLossPercent ?? -1) < Number(filters.minLoss)) return false;
			if (filters.group !== "all" && !groupsOf(d.id).includes(filters.group)) return false;
			if (filters.tag !== "all" && !tagsOf(d.id).includes(filters.tag)) return false;
			return true;
		});
		if (!sort) return rows;

		// Un valore che manca va in fondo in entrambe le direzioni: in cima
		// sembrerebbe il migliore, o il peggiore, senza esserlo.
		return [...rows].sort((a, b) => {
			const x = sortValue(a, healthById.get(a.id), sort.key);
			const y = sortValue(b, healthById.get(b.id), sort.key);
			if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
			const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "it", { numeric: true });
			return sort.dir === "asc" ? c : -c;
		});
	}, [devices, search, filters, sort, healthById, tagsOf, groupsOf]);

	useEffect(() => setPage(1), [search, filters, pageSize, sort]);

	const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
	const current = Math.min(page, lastPage);
	const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

	const setFilter = (key: keyof Filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));

	// Crescente → decrescente → nessun ordinamento.
	const clickSort = (key: SortKey) =>
		setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

	const head = (key: SortKey, label: string) => (
		<button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => clickSort(key)}>
			{label}
			{sort?.key !== key ? <ArrowUpDown className="h-3 w-3 opacity-50" /> : sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
		</button>
	);

	const toggle = (id: string) =>
		setSelected((s) => {
			const n = new Set(s);
			n.has(id) ? n.delete(id) : n.add(id);
			return n;
		});
	const selectedIds = [...selected];
	const groupFiltered = organize.groups.find((g) => g.id === filters.group);

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

	const renderRow = (device: HiTrackMonitoredDevice) => {
		const health = healthById.get(device.id);
		return (
			<TableRow key={device.id} data-state={selected.has(device.id) ? "selected" : undefined}>
				<TableCell className="w-8">
					<Checkbox checked={selected.has(device.id)} onCheckedChange={() => toggle(device.id)} aria-label={`Seleziona ${device.deviceName}`} />
				</TableCell>
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
					{(groupsOf(device.id).length > 0 || tagsOf(device.id).length > 0) && (
						<div className="mt-1 flex flex-wrap gap-1">
							{groupsOf(device.id).map((g) => (
								<Badge key={g} variant="secondary" className="text-[10px]">
									{organize.groups.find((x) => x.id === g)?.name}
								</Badge>
							))}
							{tagsOf(device.id).map((t) => (
								<Badge key={t} variant="outline" className="gap-1 text-[10px]">
									#{t}
									{canTag && (
										<button
											type="button"
											aria-label={`Rimuovi il tag ${t}`}
											onClick={() =>
												change.mutate({ run: (org, grp) => hitrackOrganizeApi.removeTag(org, device.id, t, grp), done: "Tag rimosso" })
											}
										>
											<X className="h-2.5 w-2.5" />
										</button>
									)}
								</Badge>
							))}
						</div>
					)}
				</TableCell>
				<TableCell>{device.ipAddress || "Dato non disponibile"}</TableCell>
				<TableCell>
					<DeviceStatusBadge device={device} />
				</TableCell>
				<TableCell>
					<HostHealthBadge health={health} />
				</TableCell>
				<TableCell className="min-w-[170px]">
					<NetworkQualityCell quality={device.networkQuality} />
				</TableCell>
				<TableCell>{formatMillis(device.rtdWorstMs)}</TableCell>
				<TableCell>{formatMillis(device.rtdMedianMs)}</TableCell>
				<TableCell>{formatPercent(device.packetLossPercent)}</TableCell>
				<TableCell>{[device.osName, device.osVersion].filter(Boolean).join(" ") || "-"}</TableCell>
			</TableRow>
		);
	};

	// "Raggruppa per gruppo": una sezione per gruppo, con quanti host e la salute
	// media, più "Senza gruppo". Senza paginazione: si vuole vedere tutto il gruppo.
	const sections = groupBy
		? [
				...organize.groups.map((g) => ({ id: g.id, name: g.name, rows: filtered.filter((d) => groupsOf(d.id).includes(g.id)) })),
				{ id: "none", name: "Senza gruppo", rows: filtered.filter((d) => groupsOf(d.id).length === 0) },
			].filter((s) => s.rows.length > 0)
		: null;

	const averageScore = (rows: HiTrackMonitoredDevice[]) => {
		const scores = rows.map((d) => healthById.get(d.id)?.score).filter((x): x is number => x !== null && x !== undefined);
		return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
	};

	const COLUMNS = 10;
	const isFiltered = search !== "" || JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<div className="relative min-w-[240px] flex-1">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca device, IP, vendor, modello, OS, tag…" className="pl-8" />
				</div>
				<Button size="sm" variant={sort?.key === "score" && sort.dir === "asc" ? "default" : "outline"} onClick={() => setSort({ key: "score", dir: "asc" })}>
					Dal peggiore al migliore
				</Button>
				<Button size="sm" variant={sort?.key === "score" && sort.dir === "desc" ? "default" : "outline"} onClick={() => setSort({ key: "score", dir: "desc" })}>
					Dal migliore al peggiore
				</Button>
				<Select value={filters.group} onValueChange={(v) => setFilter("group", v)}>
					<SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Tutti i gruppi</SelectItem>
						{organize.groups.map((g) => (
							<SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={filters.tag} onValueChange={(v) => setFilter("tag", v)}>
					<SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Tutti i tag</SelectItem>
						{allTags.map((t) => (
							<SelectItem key={t} value={t}>#{t}</SelectItem>
						))}
					</SelectContent>
				</Select>
				<label className="flex items-center gap-2 text-sm">
					<Checkbox checked={groupBy} onCheckedChange={(v) => setGroupBy(!!v)} />
					Raggruppa per gruppo
				</label>
				{isFiltered && (
					<Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilters(EMPTY_FILTERS); }}>
						Azzera filtri
					</Button>
				)}
			</div>

			<div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
				<Input placeholder="Nuovo gruppo" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} className="h-8 w-40" maxLength={80} />
				<Button
					size="sm"
					variant="outline"
					disabled={!newGroup.trim()}
					onClick={() =>
						change.mutate(
							{ run: (org, grp) => hitrackOrganizeApi.createGroup(org, newGroup.trim(), grp), done: "Gruppo creato" },
							{ onSuccess: () => setNewGroup("") },
						)
					}
				>
					<FolderPlus className="mr-1 h-4 w-4" />
					Crea gruppo
				</Button>
				{groupFiltered && (
					<Button
						size="sm"
						variant="ghost"
						onClick={() =>
							window.confirm(`Eliminare il gruppo "${groupFiltered.name}"? I dispositivi restano.`) &&
							change.mutate({ run: (org, grp) => hitrackOrganizeApi.deleteGroup(org, groupFiltered.id, grp), done: "Gruppo eliminato" })
						}
					>
						<Trash2 className="mr-1 h-4 w-4" />
						Elimina "{groupFiltered.name}"
					</Button>
				)}
				<span className="mx-1 text-xs text-muted-foreground">{selectedIds.length} selezionati</span>
				{selectedIds.length > 0 && (
					<>
						{organize.groups.length > 0 && (
							<Select
								value=""
								onValueChange={(id) =>
									change.mutate(
										{
											run: (org, grp) => hitrackOrganizeApi.updateGroupDevices(org, id, { add: selectedIds }, grp),
											done: `Aggiunti a ${organize.groups.find((g) => g.id === id)?.name}`,
										},
										{ onSuccess: () => setSelected(new Set()) },
									)
								}
							>
								<SelectTrigger className="h-8 w-44"><SelectValue placeholder="Aggiungi al gruppo…" /></SelectTrigger>
								<SelectContent>
									{organize.groups.map((g) => (
										<SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
						{groupFiltered && (
							<Button
								size="sm"
								variant="outline"
								onClick={() =>
									change.mutate(
										{ run: (org, grp) => hitrackOrganizeApi.updateGroupDevices(org, groupFiltered.id, { remove: selectedIds }, grp), done: "Tolti dal gruppo" },
										{ onSuccess: () => setSelected(new Set()) },
									)
								}
							>
								Togli da "{groupFiltered.name}"
							</Button>
						)}
						{canTag && (
							<>
								<Input placeholder="Tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} className="h-8 w-28" maxLength={40} />
								<Button
									size="sm"
									variant="outline"
									disabled={!newTag.trim()}
									onClick={() =>
										change.mutate(
											{ run: (org, grp) => hitrackOrganizeApi.addTag(org, selectedIds, newTag.trim(), grp), done: "Tag aggiunto" },
											{ onSuccess: () => { setNewTag(""); setSelected(new Set()); } },
										)
									}
								>
									<Tag className="mr-1 h-4 w-4" />
									Aggiungi tag
								</Button>
							</>
						)}
						<Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
							Deseleziona
						</Button>
					</>
				)}
			</div>

			{!sections && pager}

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-8">
							<Checkbox
								checked={visible.length > 0 && visible.every((d) => selected.has(d.id))}
								onCheckedChange={(v) =>
									setSelected((s) => {
										const n = new Set(s);
										(sections ? filtered : visible).forEach((d) => (v ? n.add(d.id) : n.delete(d.id)));
										return n;
									})
								}
								aria-label="Seleziona la pagina"
							/>
						</TableHead>
						<TableHead>{head("device", "Device")}</TableHead>
						<TableHead>{head("ip", "IP")}</TableHead>
						<TableHead>{head("status", "Status")}</TableHead>
						<TableHead>{head("score", "Salute")}</TableHead>
						<TableHead>{head("quality", "Qualità rete")}</TableHead>
						<TableHead>{head("rtdWorst", "RTD Worst")}</TableHead>
						<TableHead>{head("rtdMedian", "RTD Median")}</TableHead>
						<TableHead>{head("loss", "Packet Loss")}</TableHead>
						<TableHead>{head("os", "OS")}</TableHead>
					</TableRow>
					<TableRow className="hover:bg-transparent">
						<TableHead className="py-1" />
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
							<Input value={filters.maxScore} onChange={(e) => setFilter("maxScore", e.target.value)} placeholder="max" type="number" min={0} max={100} className="h-7 w-16 text-xs" title="Solo gli host con salute fino a questo valore" />
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
						<TableHead className="py-1">
							<Input value={filters.minLoss} onChange={(e) => setFilter("minLoss", e.target.value)} placeholder="min %" type="number" min={0} className="h-7 w-16 text-xs" title="Solo i device con almeno questa perdita" />
						</TableHead>
						<TableHead className="py-1">
							<Input value={filters.os} onChange={(e) => setFilter("os", e.target.value)} placeholder="Filtra" className="h-7 text-xs" />
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{sections
						? sections.map((section) => (
								<React.Fragment key={section.id}>
									<TableRow className="bg-muted/40 hover:bg-muted/40">
										<TableCell colSpan={COLUMNS} className="text-sm font-medium">
											{section.name} · {section.rows.length} host
											{averageScore(section.rows) !== null && ` · salute media ${averageScore(section.rows)}`}
										</TableCell>
									</TableRow>
									{section.rows.map(renderRow)}
								</React.Fragment>
							))
						: visible.map(renderRow)}
					{filtered.length === 0 && (
						<TableRow>
							<TableCell colSpan={COLUMNS} className="text-center text-sm text-muted-foreground">
								{devices.length === 0 ? "Nessun dispositivo gestito disponibile." : "Nessun dispositivo corrisponde ai filtri."}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>

			{!sections && filtered.length > pageSize && pager}

			<HiTrackDeviceDetailSheet device={opened} onOpenChange={(open) => !open && setOpened(null)} />
		</div>
	);
}

/** Salute dell'host (0-100) con i motivi nel tooltip; N/D se nessuna voce ha un dato. */
function HostHealthBadge({ health }: { health?: HostHealth }) {
	if (!health || health.score === null) return <span className="text-xs text-muted-foreground">N/D</span>;

	const fmt = (v: number | null) => (v === null ? "N/D" : Math.round(v));
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Badge className={`cursor-help ${severityClass[scoreSeverity(health.score)]}`}>{health.score}</Badge>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs space-y-1 text-xs">
				<p className="font-medium">Salute dell'host</p>
				<p>
					Disponibilità {fmt(health.availability)} · RAM {fmt(health.ram)} · Disco {fmt(health.disk)} · Rete {fmt(health.network)}
				</p>
				{health.reasons.length > 0 ? (
					<ul className="list-disc pl-4">
						{health.reasons.map((r) => (
							<li key={r.kind}>{r.text}</li>
						))}
					</ul>
				) : (
					<p className="text-muted-foreground">Nessun problema.</p>
				)}
				<p className="text-muted-foreground">Media delle voci con un dato; quelle senza dato non pesano.</p>
			</TooltipContent>
		</Tooltip>
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
