import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { effectiveValue, eur, isWon, type CommercialStatus, type SalesRow } from "@/lib/salesManager/value";

function ClientList({ title, status, rows, names, onOpen }: { title: string; status: CommercialStatus; rows: SalesRow[]; names: Record<string, string>; onOpen: (id: string) => void }) {
	const m = new Map<string, { n: number; v: number }>();
	rows.filter((r) => r.status === status).forEach((r) => { const c = m.get(r.organizationId) ?? { n: 0, v: 0 }; c.n++; c.v += effectiveValue(r.budget, r.proposedValue) ?? 0; m.set(r.organizationId, c); });
	const list = [...m.entries()].sort((a, b) => b[1].v - a[1].v);
	return (
		<Card><CardHeader><CardTitle className="text-base">{title} <Badge variant="secondary" className="ml-2">{list.length}</Badge></CardTitle></CardHeader>
			<CardContent className="space-y-1">
				{list.length === 0 && <div className="text-sm text-muted-foreground">Nessun cliente</div>}
				{list.map(([id, c]) => (
					<button key={id} type="button" onClick={() => onOpen(id)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
						<span className="min-w-0 truncate font-medium">{names[id] ?? id}</span>
						<span className="shrink-0 text-muted-foreground">{c.n} az. · {eur(c.v)}</span>
					</button>
				))}
			</CardContent></Card>
	);
}

export function SalesDashboard({ rows, names, onOpen }: { rows: SalesRow[]; names: Record<string, string>; onOpen: (id: string) => void }) {
	const sent = rows.filter((r) => r.status !== "proposto");
	const won = rows.filter((r) => isWon(r.status));
	const decided = rows.filter((r) => isWon(r.status) || r.status === "rifiutato");
	const wonValue = won.reduce((a, r) => a + (effectiveValue(r.budget, r.proposedValue) ?? 0), 0);
	const kpis: [string, string][] = [
		["Proposte accettate", `${won.length} / ${sent.length}`],
		["Tasso di accettazione", decided.length ? `${Math.round((won.length / decided.length) * 100)}%` : "—"],
		["Valore accettato", eur(wonValue)],
		["Valore medio accettato", won.length ? eur(Math.round(wonValue / won.length)) : "—"],
	];
	const byClient = new Map<string, { sum: number; n: number }>();
	rows.forEach((r) => { const c = byClient.get(r.organizationId) ?? { sum: 0, n: 0 }; c.sum += r.progress ?? 0; c.n++; byClient.set(r.organizationId, c); });
	const progress = [...byClient.entries()].map(([id, c]) => ({ id, name: names[id] ?? id, avanzamento: Math.round(c.sum / c.n) }))
		.sort((a, b) => b.avanzamento - a.avanzamento).slice(0, 15);

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{kpis.map(([l, v]) => <Card key={l}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-bold">{v}</div></CardContent></Card>)}
			</div>
			<Card><CardHeader><CardTitle className="text-base">Avanzamento remediation per cliente</CardTitle></CardHeader>
				<CardContent className="min-w-0">
					{progress.length === 0 ? <div className="text-sm text-muted-foreground">Nessuna remediation</div> :
					<ResponsiveContainer width="100%" height={Math.max(200, progress.length * 28)}>
						<BarChart data={progress} layout="vertical" margin={{ left: 8, right: 24 }}>
							<CartesianGrid strokeDasharray="3 3" className="stroke-border" />
							<XAxis type="number" domain={[0, 100]} unit="%" fontSize={11} />
							<YAxis type="category" dataKey="name" width={160} fontSize={11} />
							<Tooltip formatter={(v: number) => `${v}%`} />
							<Bar dataKey="avanzamento" name="Avanzamento medio" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => onOpen(d.id)} />
						</BarChart>
					</ResponsiveContainer>}
				</CardContent></Card>
			<div className="grid gap-4 md:grid-cols-2">
				<ClientList title="Clienti in trattativa" status="in_trattativa" rows={rows} names={names} onOpen={onOpen} />
				<ClientList title="Clienti con remediation completate" status="completato" rows={rows} names={names} onOpen={onOpen} />
			</div>
		</div>
	);
}
