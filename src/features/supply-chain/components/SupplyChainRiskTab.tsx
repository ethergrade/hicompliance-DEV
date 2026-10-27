import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CRITICALITY_LABEL, riskBand, type Assessment, type Criticality, type Supplier } from "@/features/supply-chain/api";

export type OrgGap = { supplier_id: string; rule_code: string; gap_title: string; neutral_action: string | null; priority: string };

const PRIORITY_LABEL: Record<string, string> = { high: "Alta", medium: "Media", low: "Bassa" };
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const CRIT_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const CRITS: Criticality[] = ["critical", "high", "medium", "low"];
const BANDS = [
  { key: "critical", label: "0–39", test: (s: number) => s < 40 },
  { key: "low", label: "40–59", test: (s: number) => s >= 40 && s < 60 },
  { key: "mid", label: "60–79", test: (s: number) => s >= 60 && s < 80 },
  { key: "good", label: "80–100", test: (s: number) => s >= 80 },
];

type Props = {
  suppliers: Supplier[];
  latest: Record<string, Assessment>;
  lastScore: Record<string, number | null>;
  gaps: OrgGap[];
  onOpen: (s: Supplier) => void;
};

/** Business view of supply-chain risk: exposure, potential risks and gaps. No commercial data. */
export function supplyChainExposure(suppliers: Supplier[], lastScore: Record<string, number | null>, gaps: OrgGap[]) {
  const critical = suppliers.filter((s) => s.criticality === "critical" || s.criticality === "high");
  const criticalAtRisk = critical.filter((s) => lastScore[s.id] != null && (lastScore[s.id] as number) < 60).length;
  const criticalUnassessed = critical.filter((s) => lastScore[s.id] == null).length;
  const highGaps = gaps.filter((g) => g.priority === "high").length;
  const assessed = suppliers.filter((s) => lastScore[s.id] != null).length;
  const coverage = suppliers.length ? Math.round((assessed / suppliers.length) * 100) : 0;
  return { criticalAtRisk, criticalUnassessed, highGaps, coverage };
}

export function SupplyChainRiskTab({ suppliers, latest, lastScore, gaps, onOpen }: Props) {
  const [fPrio, setFPrio] = useState("all");
  const [fSup, setFSup] = useState("all");
  const byId = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s])), [suppliers]);

  const risks = useMemo(() => {
    const out: { s: Supplier; reason: string; rank: number }[] = [];
    for (const s of suppliers) {
      const sc = lastScore[s.id];
      const a = latest[s.id];
      const crit = s.criticality === "critical" || s.criticality === "high";
      if (sc != null && sc < 60) out.push({ s, reason: `Score ${sc}: postura insufficiente`, rank: 0 });
      if (crit && sc == null) out.push({ s, reason: "Fornitore critico senza assessment completato", rank: 1 });
      if (s.status === "invited") out.push({ s, reason: "Invito in attesa di risposta", rank: 2 });
      if (a && a.status !== "submitted" && a.due_at && new Date(a.due_at) < new Date()) out.push({ s, reason: "Assessment scaduto", rank: 1 });
    }
    return out.sort((x, y) => x.rank - y.rank || (CRIT_RANK[x.s.criticality] ?? 9) - (CRIT_RANK[y.s.criticality] ?? 9));
  }, [suppliers, latest, lastScore]);

  const gapRows = useMemo(() => gaps
    .filter((g) => (fPrio === "all" || g.priority === fPrio) && (fSup === "all" || g.supplier_id === fSup))
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
      || (CRIT_RANK[byId[a.supplier_id]?.criticality] ?? 9) - (CRIT_RANK[byId[b.supplier_id]?.criticality] ?? 9)), [gaps, fPrio, fSup, byId]);

  const spread = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const g of gaps) (m[g.gap_title] ??= new Set()).add(g.supplier_id);
    return Object.entries(m).map(([t, set]) => ({ t, n: set.size })).sort((a, b) => b.n - a.n).slice(0, 8);
  }, [gaps]);

  const cell = (c: Criticality, test: (n: number) => boolean) => suppliers.filter((s) => s.criticality === c && lastScore[s.id] != null && test(lastScore[s.id] as number));
  const hot = (ci: number, bi: number) => (ci <= 1 && bi <= 1 ? "bg-destructive/15" : ci <= 1 || bi <= 1 ? "bg-muted" : "");

  return (
    <div className="space-y-4 min-w-0">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-sm">Matrice di rischio: criticità × score</CardTitle></CardHeader><CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className="text-left text-xs text-muted-foreground font-normal p-1">Criticità \ Score</th>{BANDS.map((b) => <th key={b.key} className="text-xs text-muted-foreground font-normal p-1">{b.label}</th>)}</tr></thead>
            <tbody>{CRITS.map((c, ci) => (
              <tr key={c}><td className="p-1 text-muted-foreground">{CRITICALITY_LABEL[c]}</td>
                {BANDS.map((b, bi) => { const list = cell(c, b.test); return (
                  <td key={b.key} className={`p-1 text-center rounded ${hot(ci, bi)}`} title={list.map((s) => s.supplier_name).join(", ")}>
                    <span className={list.length ? "font-semibold" : "text-muted-foreground"}>{list.length}</span>
                  </td>); })}
              </tr>))}</tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-2">In evidenza i fornitori critici o ad alta criticità con score inferiore a 60.</p>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-sm">Gap più diffusi nella filiera</CardTitle></CardHeader><CardContent className="space-y-2">
          {spread.length === 0 ? <p className="text-sm text-muted-foreground">Nessun gap rilevato.</p> : spread.map((g) => (
            <div key={g.t} className="flex items-center justify-between gap-2 text-sm"><span className="truncate min-w-0">{g.t}</span><Badge variant="outline">{g.n} fornitori</Badge></div>))}
        </CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle className="text-sm">Rischi potenziali ({risks.length})</CardTitle></CardHeader><CardContent className="space-y-1">
        {risks.length === 0 ? <p className="text-sm text-muted-foreground">Nessun rischio potenziale rilevato.</p> : risks.map((r, i) => (
          <button key={i} onClick={() => onOpen(r.s)} className="w-full flex items-center justify-between gap-2 text-sm hover:bg-muted/50 rounded px-2 py-1 text-left">
            <span className="truncate min-w-0"><span className="font-medium">{r.s.supplier_name}</span> · {r.reason}</span>
            <Badge variant={r.s.criticality === "critical" || r.s.criticality === "high" ? "destructive" : "secondary"}>{CRITICALITY_LABEL[r.s.criticality]}</Badge>
          </button>))}
      </CardContent></Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm">Gap per fornitore ({gapRows.length})</CardTitle>
          <div className="flex gap-2">
            <Select value={fPrio} onValueChange={setFPrio}><SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="all">Tutte le priorità</SelectItem>{Object.entries(PRIORITY_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
            <Select value={fSup} onValueChange={setFSup}><SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="all">Tutti i fornitori</SelectItem>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>)}</SelectContent></Select>
          </div>
        </CardHeader>
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Fornitore</TableHead><TableHead>Criticità</TableHead><TableHead>Score</TableHead><TableHead>Gap</TableHead><TableHead>Priorità</TableHead><TableHead>Azione consigliata</TableHead></TableRow></TableHeader>
          <TableBody>{gapRows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nessun gap</TableCell></TableRow> :
            gapRows.map((g, i) => { const s = byId[g.supplier_id]; const sc = lastScore[g.supplier_id]; const b = riskBand(sc); return (
              <TableRow key={`${g.supplier_id}-${g.rule_code}-${i}`} className="cursor-pointer" onClick={() => s && onOpen(s)}>
                <TableCell className="font-medium">{s?.supplier_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{s ? CRITICALITY_LABEL[s.criticality] : "—"}</TableCell>
                <TableCell>{sc != null ? <Badge variant="outline" className={b.tone}>{sc}</Badge> : "—"}</TableCell>
                <TableCell className="text-sm">{g.gap_title}</TableCell>
                <TableCell><Badge variant={g.priority === "high" ? "destructive" : "secondary"}>{PRIORITY_LABEL[g.priority] ?? g.priority}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-xs">{g.neutral_action ?? "—"}</TableCell>
              </TableRow>); })}
          </TableBody>
        </Table></div>
      </Card>
    </div>
  );
}
