import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Assessment, Supplier } from "@/features/supply-chain/api";

const MONTHS = 12;

/**
 * Monthly trend series computed only from stored data (no invented values):
 * - avgScore: average of each supplier's latest submitted score as of month end
 * - coverage: % of suppliers existing at month end with a submitted assessment
 * - atRisk: suppliers whose latest score as of month end is below 60
 * - suppliers: suppliers registered by month end
 */
export function buildSupplyChainTrend(suppliers: Supplier[], assessments: Assessment[], now = new Date()) {
  const submitted = assessments.filter((a) => a.status === "submitted" && a.submitted_at && a.score != null)
    .sort((a, b) => +new Date(a.submitted_at!) - +new Date(b.submitted_at!));
  const out = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const existing = suppliers.filter((s) => {
      const c = (s as Supplier & { created_at?: string }).created_at;
      return !c || new Date(c) <= end;
    });
    const latest: Record<string, number> = {};
    for (const a of submitted) if (new Date(a.submitted_at!) <= end) latest[a.supplier_id] = a.score as number;
    const scores = existing.map((s) => latest[s.id]).filter((x) => x != null);
    out.push({
      month: end.toLocaleDateString("it-IT", { month: "short", year: "2-digit" }),
      suppliers: existing.length,
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      coverage: existing.length ? Math.round((scores.length / existing.length) * 100) : null,
      atRisk: scores.filter((x) => x < 60).length,
    });
  }
  return out;
}

export function SupplyChainTrends({ suppliers, assessments }: { suppliers: Supplier[]; assessments: Assessment[] }) {
  const data = useMemo(() => buildSupplyChainTrend(suppliers, assessments), [suppliers, assessments]);
  const axis = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const tip = { contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 } };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-sm">Trend postura filiera (ultimi 12 mesi)</CardTitle></CardHeader><CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -20, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={axis} /><YAxis domain={[0, 100]} tick={axis} />
            <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="avgScore" name="Score medio" stroke="hsl(var(--primary))" strokeWidth={2} connectNulls dot={false} />
            <Line type="monotone" dataKey="coverage" name="Copertura assessment %" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 4" strokeWidth={2} connectNulls dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Trend esposizione (ultimi 12 mesi)</CardTitle></CardHeader><CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -20, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={axis} /><YAxis allowDecimals={false} tick={axis} />
            <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="suppliers" name="Fornitori censiti" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="atRisk" name="Fornitori a rischio (<60)" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent></Card>
    </div>
  );
}
