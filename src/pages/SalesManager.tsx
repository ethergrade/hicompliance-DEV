import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useClientContext } from "@/contexts/ClientContext";
import { useToast } from "@/hooks/use-toast";
import { salesManagerApi } from "@/lib/api/salesManager";
import { COMMERCIAL_STATUSES, STATUS_LABELS, effectiveValue, eur, isWon, nextStatuses, summarize, type CommercialStatus, type SalesRow } from "@/lib/salesManager/value";
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

	useEffect(() => { if (allowed && !hasFetchedOrganizations) fetchOrganizations(); }, [allowed, hasFetchedOrganizations, fetchOrganizations]);
	useEffect(() => {
		if (!allowed) return;
		salesManagerApi.listRows().then(setRows).catch((e) => toast({ title: "Errore caricamento", description: String(e.message ?? e), variant: "destructive" })).finally(() => setBusy(false));
	}, [allowed, toast]);

	const names = useMemo(() => Object.fromEntries(organizations.map((o) => [o.id, o.name])), [organizations]);
	const summary = useMemo(() => summarize(organizations.map((o) => ({ id: o.id, name: o.name })), rows), [organizations, rows]);
	const filtered = summary.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())
		&& (!onlyUnvalued || c.unvalued > 0) && (!statusFilter || c.byStatus[statusFilter] > 0));
	const tot = summary.reduce((a, c) => ({ p: a.p + c.pipelineValue, w: a.w + c.acceptedValue, n: a.n + c.total, u: a.u + (c.unvalued > 0 ? 1 : 0) }), { p: 0, w: 0, n: 0, u: 0 });
	const wonCount = rows.filter((r) => isWon(r.status)).length;
	const decided = rows.filter((r) => isWon(r.status) || r.status === "rifiutato").length;

	if (loading) return null;
	if (!allowed) return <Navigate to="/dashboard" replace />;

	const patch = async (r: SalesRow, p: Parameters<typeof salesManagerApi.save>[1]) => {
		try {
			await salesManagerApi.save(r, p);
			setRows((all) => all.map((x) => x.taskId === r.taskId ? { ...x,
				...(p.status ? { status: p.status } : {}), ...("proposed_value" in p ? { proposedValue: p.proposed_value ?? null } : {}),
				...("notes" in p ? { notes: p.notes ?? null } : {}), updatedAt: new Date().toISOString() } : x));
		} catch (e: any) { toast({ title: "Salvataggio non riuscito", description: e.message, variant: "destructive" }); }
	};
	const pushBudget = async (r: SalesRow) => {
		if (!window.confirm(`Aggiornare il budget nel piano di remediation a ${eur(r.proposedValue)}? Verrà modificato solo il budget di questa azione.`)) return;
		try {
			await salesManagerApi.pushBudget(r.taskId, r.proposedValue);
			setRows((all) => all.map((x) => x.taskId === r.taskId ? { ...x, budget: r.proposedValue } : x));
			toast({ title: "Budget inviato al piano" });
		} catch (e: any) { toast({ title: "Invio non riuscito", description: e.message, variant: "destructive" }); }
	};
	const openPlan = (orgId: string) => { const o = organizations.find((x) => x.id === orgId); if (o) { setSelectedOrganization(o); navigate("/remediation"); } };

	const scopeRows = openOrg ? rows.filter((r) => r.organizationId === openOrg) : rows.filter((r) => filtered.some((c) => c.organizationId === r.organizationId));
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

				{!openOrg ? (
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
						<CardContent className="overflow-x-auto">
							<Table>
								<TableHeader><TableRow>
									<TableHead>Cliente</TableHead><TableHead className="text-right">Remediation</TableHead>
									{COMMERCIAL_STATUSES.map((s) => <TableHead key={s} className="text-right text-xs">{STATUS_LABELS[s]}</TableHead>)}
									<TableHead className="text-right">Da valorizzare</TableHead><TableHead className="text-right">Pipeline</TableHead><TableHead className="text-right">Accettato</TableHead><TableHead>Aggiornato</TableHead><TableHead />
								</TableRow></TableHeader>
								<TableBody>
									{busy && <TableRow><TableCell colSpan={14} className="text-muted-foreground">Caricamento…</TableCell></TableRow>}
									{filtered.map((c) => (
										<TableRow key={c.organizationId} className="cursor-pointer" onClick={() => setOpenOrg(c.organizationId)}>
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
								<Button size="sm" variant="ghost" onClick={() => setOpenOrg(null)}><ArrowLeft className="mr-1 h-4 w-4" />Clienti</Button>
								<CardTitle className="truncate">{names[openOrg]}</CardTitle>
							</div>
							<Button size="sm" onClick={() => openPlan(openOrg)}><ExternalLink className="mr-1 h-4 w-4" />Apri piano di remediation</Button>
						</CardHeader>
						<CardContent className="overflow-x-auto">
							<Table>
								<TableHeader><TableRow>
									<TableHead>Azione</TableHead><TableHead>Priorità</TableHead><TableHead className="text-right">Avanz.</TableHead>
									<TableHead>Valore</TableHead><TableHead>Stato</TableHead><TableHead>Sposta a</TableHead><TableHead>Note</TableHead>
								</TableRow></TableHeader>
								<TableBody>
									{scopeRows.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Nessuna remediation nel piano di questo cliente.</TableCell></TableRow>}
									{scopeRows.map((r) => {
										const hasBudget = r.budget != null && Number(r.budget) > 0;
										return (
											<TableRow key={r.taskId}>
												<TableCell className="max-w-md"><div className="font-medium">{r.task}</div><div className="text-xs text-muted-foreground">{r.category}</div></TableCell>
												<TableCell>{r.priority}</TableCell>
												<TableCell className="text-right">{r.progress}%</TableCell>
												<TableCell className="min-w-40"><div className="space-y-1">
													<ValueInput row={r} onSave={(v) => patch(r, { proposed_value: v })} />
													<div className="text-xs text-muted-foreground">Piano: {hasBudget ? eur(Number(r.budget)) : "non valorizzato"}</div>
													{r.proposedValue != null && Number(r.proposedValue) !== Number(r.budget ?? 0) && (
														<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => pushBudget(r)}>Invia budget al piano</Button>
													)}
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
