import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { COMMERCIAL_STATUSES, STATUS_LABELS, annualKpi, effectiveValue, eur, type SalesRow } from "@/lib/salesManager/value";

const sb = supabase as any;
const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2, 173 58% 39%))", "hsl(var(--chart-3, 197 37% 24%))", "hsl(var(--chart-4, 43 74% 66%))", "hsl(var(--chart-5, 27 87% 67%))", "hsl(var(--muted-foreground))", "hsl(var(--destructive))"];

export function SalesKpiPanel({ rows }: { rows: SalesRow[] }) {
	const thisYear = new Date().getFullYear();
	const [year, setYear] = useState(thisYear);
	const [target, setTarget] = useState({ value: 0, count: 0 });
	const [sectors, setSectors] = useState<Record<string, string>>({});
	const t = useRef<number>();

	useEffect(() => {
		const load = () => sb.from("sales_targets").select("*").eq("year", year).maybeSingle()
			.then(({ data }: any) => setTarget({ value: Number(data?.target_value ?? 0), count: Number(data?.target_count ?? 0) }));
		load();
		const ch = supabase.channel(`sales-targets-${Math.random().toString(36).slice(2)}`)
			.on("postgres_changes", { event: "*", schema: "public", table: "sales_targets" }, load).subscribe();
		return () => { supabase.removeChannel(ch); };
	}, [year]);
	useEffect(() => {
		sb.from("organization_profiles").select("organization_id,business_sector").then(({ data }: any) =>
			setSectors(Object.fromEntries((data ?? []).map((p: any) => [p.organization_id, p.business_sector || "Non indicato"]))));
	}, []);

	const saveTarget = (next: { value: number; count: number }) => {
		setTarget(next);
		window.clearTimeout(t.current);
		t.current = window.setTimeout(async () => {
			const { data: u } = await supabase.auth.getUser();
			await sb.from("sales_targets").upsert({ year, target_value: next.value, target_count: next.count, updated_by: u.user?.id ?? null }, { onConflict: "year" });
		}, 1500);
	};

	const k = annualKpi(rows, year, target);
	const byStatus = COMMERCIAL_STATUSES.map((s) => ({ name: STATUS_LABELS[s], count: rows.filter((r) => r.status === s).length,
		value: rows.filter((r) => r.status === s).reduce((a, r) => a + (effectiveValue(r.budget, r.proposedValue) ?? 0), 0) }));
	const bySector = useMemo(() => {
		const m = new Map<string, number>();
		rows.forEach((r) => { const s = sectors[r.organizationId] ?? "Non indicato"; m.set(s, (m.get(s) ?? 0) + (effectiveValue(r.budget, r.proposedValue) ?? 0)); });
		return [...m.entries()].map(([name, value]) => ({ name, value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
	}, [rows, sectors]);

	return (
		<Card>
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
				<CardTitle>KPI commerciali</CardTitle>
				<div className="flex items-center gap-1">
					<Button size="sm" variant="ghost" onClick={() => setYear(year - 1)}>‹</Button>
					<span className="w-14 text-center font-semibold">{year}</span>
					<Button size="sm" variant="ghost" onClick={() => setYear(year + 1)}>›</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2 rounded-md border p-4">
						<div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">Target annuale (€)</span>
							<Input type="number" min={0} className="h-8 w-36" value={target.value || ""} placeholder="0" onChange={(e) => saveTarget({ ...target, value: Number(e.target.value || 0) })} /></div>
						<Progress value={k.pctValue} />
						<div className="flex justify-between text-sm"><span>Chiuso {eur(k.wonValue)} ({k.pctValue}%)</span><span className="font-semibold">Rimanente {eur(k.remainingValue)}</span></div>
					</div>
					<div className="space-y-2 rounded-md border p-4">
						<div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">Target remediation chiuse</span>
							<Input type="number" min={0} className="h-8 w-36" value={target.count || ""} placeholder="0" onChange={(e) => saveTarget({ ...target, count: Number(e.target.value || 0) })} /></div>
						<Progress value={k.pctCount} />
						<div className="flex justify-between text-sm"><span>Chiuse {k.wonCount} ({k.pctCount}%)</span><span className="font-semibold">Da completare {k.remainingCount}</span></div>
					</div>
				</div>
				<div className="grid gap-4 lg:grid-cols-2">
					<div className="min-w-0"><div className="mb-2 text-sm font-medium">Remediation per stato</div>
						<ResponsiveContainer width="100%" height={240}><BarChart data={byStatus}>
							<CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="name" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} />
							<Tooltip formatter={(v: number, n) => n === "value" ? eur(v) : v} /><Bar dataKey="count" name="Remediation" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
						</BarChart></ResponsiveContainer></div>
					<div className="min-w-0"><div className="mb-2 text-sm font-medium">Valore per settore</div>
						{bySector.length === 0 ? <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">Nessun valore</div> :
						<ResponsiveContainer width="100%" height={240}><PieChart>
							<Pie data={bySector} dataKey="value" nameKey="name" outerRadius={90} label={(e: any) => e.name}>{bySector.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie>
							<Tooltip formatter={(v: number) => eur(v)} />
						</PieChart></ResponsiveContainer>}</div>
				</div>
				<div className="text-xs text-muted-foreground">Aggiornato in tempo reale</div>
			</CardContent>
		</Card>
	);
}
