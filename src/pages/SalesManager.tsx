import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowLeft, ExternalLink, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useClientContext } from "@/contexts/ClientContext";
import { useToast } from "@/hooks/use-toast";
import { salesManagerApi } from "@/lib/api/salesManager";
import { COMMERCIAL_STATUSES, STATUS_LABELS, effectiveValue, eur, isWon, nextStatuses, summarize, type CommercialStatus, type SalesRow } from "@/lib/salesManager/value";
import { SalesDashboard } from "@/components/sales/SalesDashboard";
import { SalesKpiPanel } from "@/components/sales/SalesKpiPanel";
import { supabase } from "@/integrations/supabase/client";
import { exportCsv, exportExcel, exportPpt } from "@/lib/salesManager/export";

const statusVariant = (s: CommercialStatus): "default" | "destructive" | "secondary" => (isWon(s) ? "default" : s === "rifiutato" ? "destructive" : "secondary");

function ValueInput({ row, onSave }: { row: SalesRow; onSave: (v: number | null) => void }) {
	const [v, setV] = useState(row.proposedValue?.toString() ?? "");
	const t = useRef<number>();
	return (
		<Input type="number" min={0} className="h-8 w-28" placeholder="€" value={v}
			onChange={(e) => { const val = e.target.value; setV(val); window.clearTimeout(t.current);
				t.current = window.setTimeout(() => onSave(val === "" ? null : Number(val)), 1500); }} />
	);
}
function NotesInput({ row, onSave }: { row: SalesRow; onSave: (v: string) => void }) {
	const [v, setV] = useState(row.notes ?? "");
	const t = useRef<number>();
	return <Textarea rows={1} className="min-h-8 text-xs" placeholder="Note" value={v}
		onChange={(e) => { const val = e.target.value; setV(val); window.clearTimeout(t.current); t.current = window.setTimeout(() => onSave(val), 1500); }} />;
}

type Sort = { key: string; dir: 1 | -1 } | null;
function sortBy<T>(list: T[], sort: Sort, get: (x: T, k: string) => unknown): T[] {
	if (!sort) return list;
	return [...list].sort((a, b) => {
		const x = get(a, sort.key), y = get(b, sort.key);
		if (x == null || x === "") return 1; if (y == null || y === "") return -1;
		return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "it", { numeric: true })) * sort.dir;
	});
}
function SortHead({ k, sort, setSort, children, className }: { k: string; sort: Sort; setSort: (s: Sort) => void; children: React.ReactNode; className?: string }) {
	const on = sort?.key === k;
	const Icon = !on ? ArrowUpDown : sort!.dir === 1 ? ArrowUp : ArrowDown;
	return <TableHead className={className}><button type="button" className="inline-flex items-center gap-1 hover:text-foreground" title="Ordina A→Z / Z→A"
		onClick={() => setSort(!on ? { key: k, dir: 1 } : sort!.dir === 1 ? { key: k, dir: -1 } : null)}>{children}<Icon className="h-3 w-3" /></button></TableHead>;
}

export default function SalesManager() {
	const { isSuperAdmin, isSales, loading } = useUserRoles() as any;
	const { organizations, fetchOrganizations, hasFetchedOrganizations, setSelectedOrganization } = useClientContext();
	const navigate = useNavigate();
	const { toast } = useToast();
	const [rows, setRows] = useState<SalesRow[]>([]);
	const [busy, setBusy] = useState(true);
	const [search, setSearch] = useState("");
	const [onlyUnvalued, setOnlyUnvalued] = useState(false);
	const [statusFilter, setStatusFilter] = useState<CommercialStatus | null>(null);
	const [openOrg, setOpenOrg] = useState<string | null>(null);
	const allowed = isSuperAdmin || isSales;
	const [sortC, setSortC] = useState<Sort>(null);
	const [sortR, setSortR] = useState<Sort>(null);
	const [view, setView] = useState<"dashboard" | "clienti">("dashboard");
	const [clientSel, setClientSel] = useState<Set<string>>(new Set());
	const [fromStatus, setFromStatus] = useState<CommercialStatus | "all">("all");
	const [sel, setSel] = useState<Set<string>>(new Set());
	const [bulkValue, setBulkValue] = useState("");

	useEffect(() => { if (allowed && !hasFetchedOrganizations) fetchOrganizations(); }, [allowed, hasFetchedOrganizations, fetchOrganizations]);
	useEffect(() => {
		if (!allowed) return;
		salesManagerApi.listRows().then(setRows).catch((e) => toast({ title: "Errore caricamento", description: String(e.message ?? e), variant: "destructive" })).finally(() => setBusy(false));
	}, [allowed, toast]);
	useEffect(() => {
		if (!allowed) return;
		let t: number | undefined;
		const reload = () => { window.clearTimeout(t); t = window.setTimeout(() => salesManagerApi.listRows().then(setRows).catch(() => {}), 800); };
		const ch = supabase.channel(`sales-live-${Math.random().toString(36).slice(2)}`)
			.on("postgres_changes", { event: "*", schema: "public", table: "remediation_commercial" }, reload)
			.on("postgres_changes", { event: "*", schema: "public", table: "remediation_tasks" }, reload).subscribe();
		return () => { window.clearTimeout(t); supabase.removeChannel(ch); };
	}, [allowed]);

	const names = useMemo(() => Object.fromEntries(organizations.map((o) => [o.id, o.name])), [organizations]);
	const summary = useMemo(() => summarize(organizations.map((o) => ({ id: o.id, name: o.name })), rows), [organizations, rows]);
	const filteredRaw = summary.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())
		&& (!onlyUnvalued || c.unvalued > 0) && (!statusFilter || c.byStatus[statusFilter] > 0));
	const filtered = sortBy(filteredRaw, sortC, (c: any, k) => k.startsWith("st:") ? c.byStatus[k.slice(3)] : c[k]);
	const tot = summary.reduce((a, c) => ({ p: a.p + c.pipelineValue, w: a.w + c.acceptedValue, n: a.n + c.total, u: a.u + (c.unvalued > 0 ? 1 : 0) }), { p: 0, w: 0, n: 0, u: 0 });
	const wonCount = rows.filter((r) => isWon(r.status)).length;
	const decided = rows.filter((r) => isWon(r.status) || r.status === "rifiutato").length;

	if (loading) return null;
	if (!allowed) return <Navigate to="/dashboard" replace />;

	const patch = async (r: SalesRow, p: Parameters<typeof salesManagerApi.save>[1]) => {
		try {
			await salesManagerApi.save(r, p);
			setRows((all) => all.map((x) => x.taskId === r.taskId ? { ...x,
				...(p.status ? { status: p.status } : {}), ...("proposed_value" in p ? { proposedValue: p.proposed_value ?? null, budget: p.proposed_value ?? null } : {}),
				...("notes" in p ? { notes: p.notes ?? null } : {}), updatedAt: new Date().toISOString() } : x));
		} catch (e: any) { toast({ title: "Salvataggio non riuscito", description: e.message, variant: "destructive" }); }
	};
	const bulk = async (p: Parameters<typeof salesManagerApi.save>[1], label: string) => {
		const targets = rows.filter((r) => sel.has(r.taskId));
		if (!targets.length) return;
		for (const r of targets) await patch(r, p);
		toast({ title: `${label}: ${targets.length} remediation aggiornate` });
		setSel(new Set());
	};
	const bulkClients = async (st: CommercialStatus) => {
		const targets = rows.filter((r) => clientSel.has(r.organizationId) && r.status !== st && (fromStatus === "all" || r.status === fromStatus));
		if (!targets.length) { toast({ title: "Nessuna remediation da aggiornare" }); return; }
		if (!window.confirm(`Spostare ${targets.length} remediation di ${clientSel.size} clienti a «${STATUS_LABELS[st]}»?`)) return;
		const today = new Date().toISOString().slice(0, 10);
		for (const r of targets) await patch(r, { status: st, ...(st === "inviato" ? { proposed_at: today } : {}), ...(isWon(st) || st === "rifiutato" ? { closed_at: today } : {}) });
		toast({ title: `${targets.length} remediation spostate a ${STATUS_LABELS[st]}` });
		setClientSel(new Set());
	};
	const openPlan = (orgId: string) => { const o = organizations.find((x) => x.id === orgId); if (o) { setSelectedOrganization(o); navigate("/remediation"); } };

	const orgRows = sortBy(openOrg ? rows.filter((r) => r.organizationId === openOrg) : [], sortR,
		(r: any, k) => k === "value" ? effectiveValue(r.budget, r.proposedValue) : k === "status" ? STATUS_LABELS[r.status as CommercialStatus] : r[k]);
	const scopeRows = openOrg ? orgRows : rows.filter((r) => filtered.some((c) => c.organizationId === r.organizationId));
	const scopeSummary = openOrg ? summary.filter((c) => c.organizationId === openOrg) : filtered;
	const exportBar = (
		<div className="flex flex-wrap gap-2">
			<Button variant="outline" size="sm" onClick={() => exportCsv(scopeSummary, scopeRows, names)}><FileText className="mr-1 h-4 w-4" />CSV</Button>
			<Button variant="outline" size="sm" onClick={() => exportExcel(scopeSummary, scopeRows, names)}><FileSpreadsheet className="mr-1 h-4 w-4" />Excel</Button>
			<Button variant="outline" size="sm" onClick={() => exportPpt(scopeSummary, scopeRows).catch((e) => toast({ title: "Export non riuscito", description: e.message, variant: "destructive" }))}><Presentation className="mr-1 h-4 w-4" />PowerPoint</Button>
		</div>
	);

	return (
		<DashboardLayout>
			<div className="space-y-6 p-4 md:p-6 min-w-0">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="min-w-0">
						<h1 className="text-2xl font-bold">Sales Manager</h1>
						<p className="text-sm text-muted-foreground">Gestione commerciale dei piani di remediation dei clienti</p>
					</div>
					{exportBar}
				</div>

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					{[["Pipeline", eur(tot.p)], ["Accettato", eur(tot.w)], ["Conversione", decided ? `${Math.round((wonCount / decided) * 100)}%` : "—"], ["Clienti da valorizzare", String(tot.u)]].map(([l, v]) => (
						<Card key={l}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-bold">{v}</div></CardContent></Card>
					))}
				</div>
				{!openOrg && (
					<div className="flex gap-1">
						<Button size="sm" variant={view === "dashboard" ? "secondary" : "ghost"} onClick={() => setView("dashboard")}>Dashboard</Button>
						<Button size="sm" variant={view === "clienti" ? "secondary" : "ghost"} onClick={() => setView("clienti")}>Clienti</Button>
					</div>
				)}
				{!openOrg && view === "dashboard" && <><SalesDashboard rows={rows} names={names} onOpen={setOpenOrg} /><SalesKpiPanel rows={rows} /></>}

				{!openOrg && view === "dashboard" ? null : !openOrg ? (
					<Card>
						<CardHeader className="space-y-3">
							<CardTitle>Clienti</CardTitle>
							<div className="flex flex-wrap items-center gap-3">
								<Input className="w-64" placeholder="Cerca cliente" value={search} onChange={(e) => setSearch(e.target.value)} />
								<label className="flex items-center gap-2 text-sm"><Switch checked={onlyUnvalued} onCheckedChange={setOnlyUnvalued} />Solo da valorizzare</label>
								<div className="flex flex-wrap gap-1">
									<Button size="sm" variant={statusFilter ? "ghost" : "secondary"} onClick={() => setStatusFilter(null)}>Tutti</Button>
									{COMMERCIAL_STATUSES.map((s) => <Button key={s} size="sm" variant={statusFilter === s ? "secondary" : "ghost"} onClick={() => setStatusFilter(s)}>{STATUS_LABELS[s]}</Button>)}
								</div>
							</div>
						</CardHeader>
						<CardContent className="overflow-x-auto space-y-3">
							{clientSel.size > 0 && (
								<div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
									<span className="text-sm font-medium">{clientSel.size} clienti selezionati</span>
									<span className="text-xs text-muted-foreground">Remediation da:</span>
									<select className="h-7 rounded-md border bg-background px-2 text-xs" value={fromStatus} onChange={(e) => setFromStatus(e.target.value as any)}>
										<option value="all">Tutti gli stati</option>
										{COMMERCIAL_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
									</select>
									<span className="text-xs text-muted-foreground">sposta a:</span>
									{COMMERCIAL_STATUSES.map((st) => <Button key={st} size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkClients(st)}>{STATUS_LABELS[st]}</Button>)}
									<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setClientSel(new Set())}>Annulla</Button>
								</div>
							)}
							<Table>
								<TableHeader><TableRow>
									<TableHead className="w-8"><Checkbox aria-label="Seleziona tutti i clienti" checked={filtered.length > 0 && filtered.every((c) => clientSel.has(c.organizationId))}
										onCheckedChange={(v) => setClientSel(v ? new Set(filtered.map((c) => c.organizationId)) : new Set())} /></TableHead>
									<SortHead k="name" sort={sortC} setSort={setSortC}>Cliente</SortHead><SortHead k="total" sort={sortC} setSort={setSortC} className="text-right">Remediation</SortHead>
									{COMMERCIAL_STATUSES.map((s) => <SortHead key={s} k={"st:" + s} sort={sortC} setSort={setSortC} className="text-right text-xs">{STATUS_LABELS[s]}</SortHead>)}
									<SortHead k="unvalued" sort={sortC} setSort={setSortC} className="text-right">Da valorizzare</SortHead><SortHead k="pipelineValue" sort={sortC} setSort={setSortC} className="text-right">Pipeline</SortHead><SortHead k="acceptedValue" sort={sortC} setSort={setSortC} className="text-right">Accettato</SortHead><SortHead k="lastUpdate" sort={sortC} setSort={setSortC}>Aggiornato</SortHead><TableHead />
								</TableRow></TableHeader>
								<TableBody>
									{busy && <TableRow><TableCell colSpan={15} className="text-muted-foreground">Caricamento…</TableCell></TableRow>}
									{filtered.map((c) => (
										<TableRow key={c.organizationId} className="cursor-pointer" data-state={clientSel.has(c.organizationId) ? "selected" : undefined} onClick={() => setOpenOrg(c.organizationId)}>
											<TableCell onClick={(e) => e.stopPropagation()}><Checkbox aria-label="Seleziona cliente" checked={clientSel.has(c.organizationId)}
												onCheckedChange={(v) => setClientSel((cur) => { const n = new Set(cur); v ? n.add(c.organizationId) : n.delete(c.organizationId); return n; })} /></TableCell>
											<TableCell className="font-medium">{c.name}</TableCell>
											<TableCell className="text-right">{c.total}</TableCell>
											{COMMERCIAL_STATUSES.map((s) => <TableCell key={s} className="text-right">{c.byStatus[s] || ""}</TableCell>)}
											<TableCell className="text-right">{c.unvalued > 0 ? <Badge variant="destructive">{c.unvalued}</Badge> : "0"}</TableCell>
											<TableCell className="text-right">{eur(c.pipelineValue)}</TableCell>
											<TableCell className="text-right">{eur(c.acceptedValue)}</TableCell>
											<TableCell className="text-xs">{c.lastUpdate ? new Date(c.lastUpdate).toLocaleDateString("it-IT") : "—"}</TableCell>
											<TableCell><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openPlan(c.organizationId); }}><ExternalLink className="mr-1 h-4 w-4" />Piano</Button></TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				) : (
					<Card>
						<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2 min-w-0">
								<Button size="sm" variant="ghost" onClick={() => { setOpenOrg(null); setSel(new Set()); }}><ArrowLeft className="mr-1 h-4 w-4" />Clienti</Button>
								<CardTitle className="truncate">{names[openOrg]}</CardTitle>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button size="sm" onClick={() => navigate(`/sales-manager/piano/${openOrg}`)}>Piano completo</Button>
								<Button size="sm" variant="outline" onClick={() => openPlan(openOrg)}><ExternalLink className="mr-1 h-4 w-4" />Apri piano di remediation</Button>
							</div>
						</CardHeader>
						<CardContent className="overflow-x-auto space-y-3">
							{sel.size > 0 && (
								<div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
									<span className="text-sm font-medium">{sel.size} selezionate</span>
									<span className="text-xs text-muted-foreground">Imposta stato:</span>
									{COMMERCIAL_STATUSES.map((st) => <Button key={st} size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulk({ status: st,
										...(st === "inviato" ? { proposed_at: new Date().toISOString().slice(0, 10) } : {}),
										...(isWon(st) || st === "rifiutato" ? { closed_at: new Date().toISOString().slice(0, 10) } : {}) }, STATUS_LABELS[st])}>{STATUS_LABELS[st]}</Button>)}
									<Input type="number" min={0} className="h-7 w-28" placeholder="Valore €" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
									<Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkValue === ""} onClick={() => { bulk({ proposed_value: Number(bulkValue) }, "Valore"); setBulkValue(""); }}>Applica valore</Button>
									<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSel(new Set())}>Annulla</Button>
								</div>
							)}
							<Table>
								<TableHeader><TableRow>
									<TableHead className="w-8"><Checkbox aria-label="Seleziona tutte" checked={orgRows.length > 0 && orgRows.every((r) => sel.has(r.taskId))}
										onCheckedChange={(v) => setSel(v ? new Set(orgRows.map((r) => r.taskId)) : new Set())} /></TableHead>
									<SortHead k="task" sort={sortR} setSort={setSortR}>Azione</SortHead><SortHead k="priority" sort={sortR} setSort={setSortR}>Priorità</SortHead><SortHead k="progress" sort={sortR} setSort={setSortR} className="text-right">Avanz.</SortHead>
									<SortHead k="value" sort={sortR} setSort={setSortR}>Valore</SortHead><SortHead k="status" sort={sortR} setSort={setSortR}>Stato</SortHead><TableHead>Sposta a</TableHead><SortHead k="notes" sort={sortR} setSort={setSortR}>Note</SortHead>
								</TableRow></TableHeader>
								<TableBody>
									{scopeRows.length === 0 && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Nessuna remediation nel piano di questo cliente.</TableCell></TableRow>}
									{scopeRows.map((r) => {
										const hasBudget = r.budget != null && Number(r.budget) > 0;
										return (
											<TableRow key={r.taskId} data-state={sel.has(r.taskId) ? "selected" : undefined}>
												<TableCell><Checkbox aria-label="Seleziona" checked={sel.has(r.taskId)} onCheckedChange={(v) => setSel((cur) => { const n = new Set(cur); v ? n.add(r.taskId) : n.delete(r.taskId); return n; })} /></TableCell>
												<TableCell className="max-w-md"><div className="font-medium">{r.task}</div><div className="text-xs text-muted-foreground">{r.category}</div></TableCell>
												<TableCell>{r.priority}</TableCell>
												<TableCell className="text-right">{r.progress}%</TableCell>
												<TableCell className="min-w-40"><div className="space-y-1">
													<ValueInput key={String(r.proposedValue)} row={r} onSave={(v) => patch(r, { proposed_value: v })} />
													<div className="text-xs text-muted-foreground">{hasBudget ? "Sincronizzato col piano" : "Piano non valorizzato"}</div>
												</div></TableCell>
												<TableCell><Badge variant={statusVariant(r.status)}>{STATUS_LABELS[r.status]}</Badge></TableCell>
												<TableCell><div className="flex flex-wrap gap-1">{nextStatuses(r.status).map((s) => (
													<Button key={s} size="sm" variant="outline" className="h-7 text-xs" onClick={() => patch(r, {
														status: s, ...(s === "inviato" ? { proposed_at: new Date().toISOString().slice(0, 10) } : {}),
														...(isWon(s) || s === "rifiutato" ? { closed_at: new Date().toISOString().slice(0, 10) } : {}) })}>{STATUS_LABELS[s]}</Button>
												))}</div></TableCell>
												<TableCell className="min-w-48"><NotesInput row={r} onSave={(v) => patch(r, { notes: v || null })} /></TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				)}
			</div>
		</DashboardLayout>
	);
}
