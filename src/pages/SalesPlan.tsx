import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, Plus, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useClientContext } from "@/contexts/ClientContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { salesManagerApi } from "@/lib/api/salesManager";
import { STATUS_LABELS, effectiveValue, eur, type SalesRow } from "@/lib/salesManager/value";
import { DUE_LABELS, dueState, planTotals, type PlanItem } from "@/lib/salesManager/plan";

const sb = supabase as any;
const dueVariant = (s: string): "default" | "destructive" | "secondary" | "outline" => s === "scaduto" ? "destructive" : s === "fatto" ? "default" : s === "in_scadenza" ? "secondary" : "outline";

function Debounced({ value, onSave, type = "text", className, placeholder }: { value: string; onSave: (v: string) => void; type?: string; className?: string; placeholder?: string }) {
	const [v, setV] = useState(value);
	const t = useRef<number>();
	useEffect(() => setV(value), [value]);
	return <Input type={type} className={className} placeholder={placeholder} value={v}
		onChange={(e) => { const x = e.target.value; setV(x); window.clearTimeout(t.current); t.current = window.setTimeout(() => onSave(x), 1500); }} />;
}

export default function SalesPlan() {
	const { orgId = "" } = useParams();
	const { isSuperAdmin, isSales, loading } = useUserRoles() as any;
	const { organizations, fetchOrganizations, hasFetchedOrganizations } = useClientContext();
	const navigate = useNavigate();
	const { toast } = useToast();
	const [rows, setRows] = useState<SalesRow[]>([]);
	const [items, setItems] = useState<PlanItem[]>([]);
	const [busy, setBusy] = useState(true);
	const allowed = isSuperAdmin || isSales;

	const load = async () => {
		try {
			const [r, { data, error }] = await Promise.all([salesManagerApi.listRows([orgId]),
				sb.from("remediation_plan_items").select("*").eq("organization_id", orgId).order("sort_order").order("created_at")]);
			if (error) throw error;
			setRows(r); setItems(data ?? []);
		} catch (e: any) { toast({ title: "Errore caricamento", description: e.message, variant: "destructive" }); }
		finally { setBusy(false); }
	};
	useEffect(() => { if (allowed && !hasFetchedOrganizations) fetchOrganizations(); }, [allowed, hasFetchedOrganizations, fetchOrganizations]);
	useEffect(() => {
		if (!allowed || !orgId) return;
		load();
		let t: number | undefined;
		const reload = () => { window.clearTimeout(t); t = window.setTimeout(load, 800); };
		const ch = supabase.channel(`sales-plan-${Math.random().toString(36).slice(2)}`)
			.on("postgres_changes", { event: "*", schema: "public", table: "remediation_plan_items", filter: `organization_id=eq.${orgId}` }, reload)
			.on("postgres_changes", { event: "*", schema: "public", table: "remediation_commercial", filter: `organization_id=eq.${orgId}` }, reload)
			.on("postgres_changes", { event: "*", schema: "public", table: "remediation_tasks", filter: `organization_id=eq.${orgId}` }, reload).subscribe();
		return () => { window.clearTimeout(t); supabase.removeChannel(ch); };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [allowed, orgId]);

	const byTask = useMemo(() => { const m = new Map<string, PlanItem[]>(); items.forEach((i) => m.set(i.task_id, [...(m.get(i.task_id) ?? []), i])); return m; }, [items]);
	const schedule = useMemo(() => items.filter((i) => !i.done && i.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!)), [items]);
	const totalBudget = rows.reduce((a, r) => a + (effectiveValue(r.budget, r.proposedValue) ?? 0), 0);
	const all = planTotals(items, totalBudget);

	if (loading) return null;
	if (!allowed) return <Navigate to="/dashboard" replace />;
	const name = organizations.find((o) => o.id === orgId)?.name ?? "Cliente";

	const addItem = async (r: SalesRow) => {
		const { data, error } = await sb.from("remediation_plan_items").insert({ task_id: r.taskId, organization_id: orgId, title: "Nuova attività", sort_order: (byTask.get(r.taskId)?.length ?? 0) }).select().single();
		if (error) return toast({ title: "Errore", description: error.message, variant: "destructive" });
		setItems((x) => [...x, data]);
	};
	const updItem = async (id: string, p: Partial<PlanItem>) => {
		setItems((x) => x.map((i) => i.id === id ? { ...i, ...p } : i));
		const { error } = await sb.from("remediation_plan_items").update(p).eq("id", id);
		if (error) toast({ title: "Salvataggio non riuscito", description: error.message, variant: "destructive" });
	};
	const delItem = async (id: string) => {
		if (!window.confirm("Eliminare questa attività?")) return;
		setItems((x) => x.filter((i) => i.id !== id));
		await sb.from("remediation_plan_items").delete().eq("id", id);
	};
	const setBudget = async (r: SalesRow, v: string) => {
		const n = v === "" ? null : Number(v);
		try { await salesManagerApi.save(r, { proposed_value: n }); setRows((x) => x.map((y) => y.taskId === r.taskId ? { ...y, proposedValue: n, budget: n } : y)); }
		catch (e: any) { toast({ title: "Salvataggio non riuscito", description: e.message, variant: "destructive" }); }
	};

	return (
		<DashboardLayout>
			<div className="space-y-4 p-4 md:p-6 min-w-0">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<Button size="sm" variant="ghost" onClick={() => navigate("/sales-manager")}><ArrowLeft className="mr-1 h-4 w-4" />Sales Manager</Button>
						<h1 className="truncate text-2xl font-bold">Piano completo · {name}</h1>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
					{([["Budget totale", eur(totalBudget)], ["Costo attività", eur(all.cost)], ["Azioni", String(rows.length)], ["Attività fatte", `${all.done} / ${all.total}`], ["Scadute", String(all.overdue)]] as const).map(([l, v]) => (
						<Card key={l}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-bold">{v}</div></CardContent></Card>
					))}
				</div>

				<div className="grid gap-4 xl:grid-cols-[1fr_340px]">
					<div className="space-y-3 min-w-0">
						{busy && <div className="text-sm text-muted-foreground">Caricamento…</div>}
						{!busy && rows.length === 0 && <Card><CardContent className="p-6 text-sm text-muted-foreground">Nessuna remediation per questo cliente.</CardContent></Card>}
						{rows.map((r) => {
							const its = byTask.get(r.taskId) ?? [];
							const t = planTotals(its, effectiveValue(r.budget, r.proposedValue));
							return (
								<Card key={r.taskId}>
									<CardHeader className="space-y-2 pb-3">
										<div className="flex flex-wrap items-start justify-between gap-2">
											<div className="min-w-0"><CardTitle className="text-base">{r.task}</CardTitle>
												<div className="text-xs text-muted-foreground">{r.category} · Priorità {r.priority ?? "—"} · Avanzamento piano {r.progress}%</div></div>
											<div className="flex items-center gap-2">
												<Badge variant="secondary">{STATUS_LABELS[r.status]}</Badge>
												<span className="text-xs text-muted-foreground">Budget</span>
												<Debounced type="number" className="h-8 w-28" placeholder="€" value={r.proposedValue?.toString() ?? r.budget?.toString() ?? ""} onSave={(v) => setBudget(r, v)} />
											</div>
										</div>
										<div className="flex items-center gap-3 text-xs">
											<Progress value={t.pct} className="h-2 flex-1" /><span>{t.done}/{t.total} attività</span>
											<span className={t.overBudget ? "font-semibold text-destructive" : "text-muted-foreground"}>Costi {eur(t.cost)}{t.overBudget ? " · oltre budget" : ""}</span>
										</div>
									</CardHeader>
									<CardContent className="overflow-x-auto pt-0">
										<Table>
											<TableHeader><TableRow><TableHead className="w-8" /><TableHead>Attività</TableHead><TableHead>Responsabile</TableHead><TableHead>Scadenza</TableHead><TableHead>Costo €</TableHead><TableHead>Stato</TableHead><TableHead className="w-8" /></TableRow></TableHeader>
											<TableBody>
												{its.map((i) => { const s = dueState(i); return (
													<TableRow key={i.id}>
														<TableCell><Checkbox aria-label="Fatto" checked={i.done} onCheckedChange={(v) => updItem(i.id, { done: !!v })} /></TableCell>
														<TableCell className="min-w-56"><Debounced className="h-8" value={i.title} onSave={(v) => updItem(i.id, { title: v || "Attività" })} /></TableCell>
														<TableCell className="min-w-36"><Debounced className="h-8" placeholder="Nome" value={i.owner ?? ""} onSave={(v) => updItem(i.id, { owner: v || null })} /></TableCell>
														<TableCell><Input type="date" className="h-8 w-40" value={i.due_date ?? ""} onChange={(e) => updItem(i.id, { due_date: e.target.value || null })} /></TableCell>
														<TableCell><Debounced type="number" className="h-8 w-28" value={i.cost?.toString() ?? ""} onSave={(v) => updItem(i.id, { cost: v === "" ? null : Number(v) })} /></TableCell>
														<TableCell><Badge variant={dueVariant(s)}>{DUE_LABELS[s]}</Badge></TableCell>
														<TableCell><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Elimina" onClick={() => delItem(i.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
													</TableRow>); })}
											</TableBody>
										</Table>
										<Button size="sm" variant="outline" className="mt-2" onClick={() => addItem(r)}><Plus className="mr-1 h-4 w-4" />Aggiungi attività</Button>
									</CardContent>
								</Card>
							);
						})}
					</div>
					<Card className="h-fit xl:sticky xl:top-4">
						<CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" />Scadenzario</CardTitle></CardHeader>
						<CardContent className="space-y-2">
							{schedule.length === 0 && <div className="text-sm text-muted-foreground">Nessuna scadenza aperta</div>}
							{schedule.map((i) => { const s = dueState(i); const r = rows.find((x) => x.taskId === i.task_id); return (
								<div key={i.id} className="rounded-md border p-2 text-sm">
									<div className="flex items-center justify-between gap-2"><span className="font-medium">{new Date(i.due_date!).toLocaleDateString("it-IT")}</span><Badge variant={dueVariant(s)}>{DUE_LABELS[s]}</Badge></div>
									<div className="truncate">{i.title}</div>
									<div className="truncate text-xs text-muted-foreground">{r?.task}{i.owner ? ` · ${i.owner}` : ""}</div>
								</div>); })}
						</CardContent>
					</Card>
				</div>
			</div>
		</DashboardLayout>
	);
}
