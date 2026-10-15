// Dettaglio di un device HiTrack: andamento della qualità rete, interfacce di
// rete con stato, traffico e storico (riassunti orari e giornalieri del
// backend), e per i vCenter host, datastore e macchine virtuali.
import React, { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Loader2, Search } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHiTrackDeviceDetail, useHiTrackInterfaceHistory, useHiTrackNetworkQualityHistory } from "@/hooks/useHiTrackDashboard";
import { formatBps, formatMillis, formatPercent } from "@/lib/hitrack/formatters";
import type { HiTrackHistoryRange, HiTrackInterface, HiTrackInventoryItem, HiTrackMonitoredDevice } from "@/lib/hitrack/types";

const RANGES: Array<[HiTrackHistoryRange, string]> = [
	["24h", "24 ore"],
	["7d", "7 giorni"],
	["30d", "30 giorni"],
];

const fmtDateTime = (v: string | null) => {
	if (!v) return null;
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? null : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
};

const fmtPct = (v: number | null) => (v === null ? "" : ` · ${v.toFixed(1)}%`);

function statusOf(i: HiTrackInterface): { label: string; className: string } {
	if (i.adminStatus && i.adminStatus !== "up") return { label: "Disattivata", className: "border-slate-500/30 bg-slate-500/10 text-slate-300" };
	if (i.operStatus === "up") return { label: "Attiva", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" };
	if (i.operStatus === "down") return { label: "Giù", className: "border-red-500/30 bg-red-500/10 text-red-300" };
	return { label: i.operStatus ?? "Sconosciuto", className: "border-amber-500/30 bg-amber-500/10 text-amber-300" };
}

export function HiTrackDeviceDetailSheet({
	device,
	onOpenChange,
}: {
	device: HiTrackMonitoredDevice | null;
	onOpenChange: (open: boolean) => void;
}) {
	const query = useHiTrackDeviceDetail(device?.id ?? null);
	const detail = query.data;
	const inventory = detail?.inventory;
	const hasInventory = !!inventory && inventory.hosts.length + inventory.datastores.length + inventory.vms.length > 0;
	const hasInterfaces = (detail?.interfaces.length ?? 0) > 0;

	return (
		<Sheet open={!!device} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
				<SheetHeader>
					<SheetTitle>{device?.deviceName}</SheetTitle>
					<SheetDescription>
						{[device?.type, device?.ipAddress, [device?.vendor, device?.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
					</SheetDescription>
				</SheetHeader>

				<div className="mt-4 space-y-6">
					{device && <NetworkQualityTrend deviceId={device.id} />}
					{query.isLoading && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" /> Caricamento del dettaglio…
						</div>
					)}
					{query.isError && <p className="text-sm text-muted-foreground">Dettaglio non disponibile.</p>}
					{detail && !hasInterfaces && !hasInventory && (
						<p className="text-sm text-muted-foreground">Nessuna interfaccia o inventario di virtualizzazione per questo device.</p>
					)}
					{detail && (hasInterfaces || hasInventory) && (
						<Tabs defaultValue={hasInterfaces ? "interfaces" : "inventory"}>
							<TabsList>
								{hasInterfaces && <TabsTrigger value="interfaces">Interfacce ({detail.interfaces.length})</TabsTrigger>}
								{hasInventory && <TabsTrigger value="inventory">Virtualizzazione</TabsTrigger>}
							</TabsList>
							{hasInterfaces && (
								<TabsContent value="interfaces">
									<InterfacesPanel deviceId={detail.deviceId} interfaces={detail.interfaces} />
								</TabsContent>
							)}
							{hasInventory && inventory && (
								<TabsContent value="inventory" className="space-y-6">
									<InventoryTable title="Host" items={inventory.hosts} />
									<InventoryTable title="Datastore" items={inventory.datastores} />
									{inventory.hosts.length > 0 || inventory.vms.length > 0 ? (
										inventory.vms.length > 0 ? (
											<InventoryTable title="Macchine virtuali" items={inventory.vms} />
										) : (
											<p className="text-sm text-muted-foreground">
												Elenco delle macchine virtuali non disponibile: la raccolta delle VM non è attiva per questo device.
											</p>
										)
									) : null}
								</TabsContent>
							)}
						</Tabs>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

function InterfacesPanel({ deviceId, interfaces }: { deviceId: string; interfaces: HiTrackInterface[] }) {
	const anyPhysical = interfaces.some((i) => i.physical);
	const [showVirtual, setShowVirtual] = useState(!anyPhysical);
	const [onlyActive, setOnlyActive] = useState(false);
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<string | null>(null);

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase();
		return interfaces.filter((i) => {
			if (!showVirtual && !i.physical) return false;
			if (onlyActive && !(i.adminStatus !== "down" && i.operStatus === "up")) return false;
			if (q && ![i.name, i.alias, i.macAddress].some((v) => (v ?? "").toLowerCase().includes(q))) return false;
			return true;
		});
	}, [interfaces, showVirtual, onlyActive, search]);

	const counts = useMemo(() => {
		const c = { up: 0, down: 0, disabled: 0 };
		for (const i of interfaces) {
			if (i.adminStatus && i.adminStatus !== "up") c.disabled += 1;
			else if (i.operStatus === "up") c.up += 1;
			else c.down += 1;
		}
		return c;
	}, [interfaces]);

	const stale = interfaces.every((i) => i.stale);
	const lastSample = fmtDateTime(interfaces.map((i) => i.sampledAt).filter(Boolean).sort().pop() ?? null);
	const selectedInterface = interfaces.find((i) => i.id === selected) ?? null;

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2 text-xs">
				<Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{counts.up} attive</Badge>
				<Badge className="border-red-500/30 bg-red-500/10 text-red-300">{counts.down} giù</Badge>
				<Badge className="border-slate-500/30 bg-slate-500/10 text-slate-300">{counts.disabled} disattivate</Badge>
				<span className="text-muted-foreground">Ultima lettura: {lastSample ?? "non disponibile"}</span>
			</div>
			{stale && (
				<div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
					I dati delle interfacce non sono aggiornati: l'ultima lettura risale a oltre 30 minuti fa.
				</div>
			)}

			<div className="flex flex-wrap items-center gap-4">
				<div className="relative min-w-[200px] flex-1">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca interfaccia, alias, MAC…" className="pl-8" />
				</div>
				<label className="flex items-center gap-2 text-sm">
					<Switch checked={onlyActive} onCheckedChange={setOnlyActive} /> Solo attive
				</label>
				{anyPhysical && (
					<label className="flex items-center gap-2 text-sm">
						<Switch checked={showVirtual} onCheckedChange={setShowVirtual} /> Anche virtuali (VLAN, tunnel…)
					</label>
				)}
			</div>

			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Interfaccia</TableHead>
							<TableHead>Stato</TableHead>
							<TableHead>Velocità</TableHead>
							<TableHead>Entrata</TableHead>
							<TableHead>Uscita</TableHead>
							<TableHead>Errori /s</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{visible.map((i) => {
							const st = statusOf(i);
							const since = fmtDateTime(i.operStatusSince);
							const errors = (i.inErrors ?? 0) + (i.outErrors ?? 0);
							return (
								<TableRow
									key={i.id}
									className={`cursor-pointer ${selected === i.id ? "bg-muted/50" : ""}`}
									onClick={() => setSelected(selected === i.id ? null : i.id)}
								>
									<TableCell>
										<p className="font-medium">{i.name}</p>
										{i.alias && i.alias !== i.name && <p className="text-xs text-muted-foreground">{i.alias}</p>}
									</TableCell>
									<TableCell>
										<Badge className={st.className}>{st.label}</Badge>
										{since && <p className="mt-1 text-[10px] text-muted-foreground">dal {since}</p>}
									</TableCell>
									<TableCell>{i.speedBps ? formatBps(i.speedBps) : "—"}</TableCell>
									<TableCell className="whitespace-nowrap">
										{formatBps(i.inBps)}
										<span className="text-xs text-muted-foreground">{fmtPct(i.inUsagePercent)}</span>
									</TableCell>
									<TableCell className="whitespace-nowrap">
										{formatBps(i.outBps)}
										<span className="text-xs text-muted-foreground">{fmtPct(i.outUsagePercent)}</span>
									</TableCell>
									<TableCell className={errors > 0 ? "text-red-400" : ""}>
										{i.inErrors === null && i.outErrors === null ? "—" : errors}
									</TableCell>
								</TableRow>
							);
						})}
						{visible.length === 0 && (
							<TableRow>
								<TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
									Nessuna interfaccia corrisponde ai filtri.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<p className="text-xs text-muted-foreground">Seleziona un'interfaccia per vederne l'andamento.</p>

			{selectedInterface && <InterfaceHistory deviceId={deviceId} iface={selectedInterface} />}
		</div>
	);
}

function InterfaceHistory({ deviceId, iface }: { deviceId: string; iface: HiTrackInterface }) {
	const [range, setRange] = useState<HiTrackHistoryRange>("24h");
	const query = useHiTrackInterfaceHistory(deviceId, iface.id, range);
	const points = query.data?.points ?? [];
	const daily = query.data?.granularity === "day";

	const data = points.map((p) => ({
		label: new Date(p.at).toLocaleString("it-IT", daily ? { day: "2-digit", month: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
		inAvg: p.inBpsAvg,
		outAvg: p.outBpsAvg,
		inMax: p.inBpsMax,
		outMax: p.outBpsMax,
		down: p.downMinutes,
	}));
	const downTotal = points.reduce((s, p) => s + p.downMinutes, 0);

	return (
		<div className="space-y-2 rounded-md border p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-sm font-medium">{iface.name}: traffico medio e di picco</p>
				<div className="flex gap-1">
					{RANGES.map(([key, label]) => (
						<Button key={key} size="sm" variant={range === key ? "default" : "outline"} className="h-7 px-2" onClick={() => setRange(key)}>
							{label}
						</Button>
					))}
				</div>
			</div>
			{query.isLoading ? (
				<div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Caricamento…
				</div>
			) : data.length === 0 ? (
				<p className="py-8 text-center text-sm text-muted-foreground">
					Nessuno storico ancora disponibile per questo periodo: i dati si accumulano a ogni lettura.
				</p>
			) : (
				<div className="h-56">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
							<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
							<XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={24} />
							<YAxis tick={{ fontSize: 10 }} width={64} tickFormatter={(v) => formatBps(v)} />
							<ChartTooltip
								formatter={(v: number, name: string) => [formatBps(v), name]}
								contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
							/>
							<Line type="monotone" dataKey="inAvg" name="Entrata media" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
							<Line type="monotone" dataKey="outAvg" name="Uscita media" stroke="#10b981" strokeWidth={2} dot={false} />
							<Line type="monotone" dataKey="inMax" name="Entrata picco" stroke="hsl(var(--primary))" strokeDasharray="4 3" strokeWidth={1} dot={false} />
							<Line type="monotone" dataKey="outMax" name="Uscita picco" stroke="#10b981" strokeDasharray="4 3" strokeWidth={1} dot={false} />
						</LineChart>
					</ResponsiveContainer>
				</div>
			)}
			{data.length > 0 && (
				<p className="text-xs text-muted-foreground">
					Linee continue: media {daily ? "giornaliera" : "oraria"}. Tratteggio: picco. Inattiva nel periodo: {downTotal} minuti.
				</p>
			)}
		</div>
	);
}

const HEALTH_LABEL: Record<string, string> = { green: "Verde", amber: "Attenzione", red: "Critico", unknown: "Dato non disponibile" };

function NetworkQualityTrend({ deviceId }: { deviceId: string }) {
	const [range, setRange] = useState<HiTrackHistoryRange>("24h");
	const query = useHiTrackNetworkQualityHistory(deviceId, range);
	const points = query.data?.points ?? [];

	const data = points.map((p) => ({
		label: new Date(p.at).toLocaleString("it-IT", range === "24h" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
		score: p.score,
		point: p,
	}));

	return (
		<div className="space-y-2 rounded-md border p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-sm font-medium">Qualità rete nel tempo</p>
				<div className="flex gap-1">
					{RANGES.map(([key, label]) => (
						<Button key={key} size="sm" variant={range === key ? "default" : "outline"} className="h-7 px-2" onClick={() => setRange(key)}>
							{label}
						</Button>
					))}
				</div>
			</div>
			{query.isLoading ? (
				<div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Caricamento…
				</div>
			) : data.length === 0 ? (
				<p className="py-8 text-center text-sm text-muted-foreground">
					Nessuna misura ancora disponibile per questo periodo: se ne aggiunge una ogni 30 minuti circa.
				</p>
			) : (
				<div className="h-48">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
							<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
							<XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={24} />
							<YAxis domain={[0, 100]} ticks={[0, 50, 80, 100]} tick={{ fontSize: 10 }} width={32} />
							<ReferenceLine y={80} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.6} />
							<ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.6} />
							<ChartTooltip
								contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
								content={({ active, payload }) => {
									const p = active ? payload?.[0]?.payload?.point : null;
									if (!p) return null;
									return (
										<div className="space-y-0.5 rounded-md border bg-popover p-2 text-xs">
											<p className="font-medium">{fmtDateTime(p.at)}</p>
											<p>
												{p.score !== null ? `${p.score}/100` : "Dato non disponibile"} · {HEALTH_LABEL[p.health] ?? p.health}
											</p>
											<p className="text-muted-foreground">
												RTD mediana {formatMillis(p.medianMs)} · picco {formatMillis(p.worstMs)} · perdita {formatPercent(p.lossPercent)}
											</p>
										</div>
									);
								}}
							/>
							<Line type="monotone" dataKey="score" name="Qualità rete" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} connectNulls={false} />
						</LineChart>
					</ResponsiveContainer>
				</div>
			)}
			{data.length > 0 && (
				<p className="text-xs text-muted-foreground">
					Una misura ogni 30 minuti circa. Sopra 80 la rete è buona, sotto 50 è critica. Non misura la banda.
				</p>
			)}
		</div>
	);
}

function InventoryTable({ title, items }: { title: string; items: HiTrackInventoryItem[] }) {
	const columns = useMemo(() => {
		const seen: string[] = [];
		for (const item of items) {
			for (const a of item.attributes) {
				if (a.label.toLowerCase() !== "name" && !seen.includes(a.label)) seen.push(a.label);
			}
		}
		return seen;
	}, [items]);

	if (items.length === 0) return null;

	return (
		<div className="space-y-2">
			<h4 className="text-sm font-semibold">
				{title} ({items.length})
			</h4>
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Nome</TableHead>
							{columns.map((c) => (
								<TableHead key={c} className="whitespace-nowrap">
									{c}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item) => {
							const values = Object.fromEntries(item.attributes.map((a) => [a.label, a.value]));
							return (
								<TableRow key={item.id}>
									<TableCell className="font-medium">{item.name}</TableCell>
									{columns.map((c) => (
										<TableCell key={c} className="whitespace-nowrap text-sm">
											{values[c] && values[c] !== "N/A" ? values[c] : "—"}
										</TableCell>
									))}
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
