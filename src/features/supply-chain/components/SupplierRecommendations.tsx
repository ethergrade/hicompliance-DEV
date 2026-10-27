import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb } from "lucide-react";
import { buildSupplierInsights, PRIORITY_LABEL, type SupplierRec } from "@/features/supply-chain/recommendations";

/** Shared between supplier portal and internal detail sheet: neutral, no commercial content. */
export function SupplierRecommendations({ score, recs }: { score: number | null | undefined; recs: SupplierRec[] }) {
  const { insights, counts, plan } = buildSupplierInsights(score, recs);
  return (
    <div className="space-y-4 min-w-0">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="h-4 w-4" />Insight</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">{insights.map((t) => <p key={t}>{t}</p>)}
          {counts.total > 0 && <div className="flex gap-2 pt-2">
            <Badge variant="destructive">Alta {counts.high}</Badge><Badge variant="secondary">Media {counts.medium}</Badge><Badge variant="outline">Bassa {counts.low}</Badge>
          </div>}
        </CardContent></Card>
      {plan.filter((p) => p.items.length).map((p) => (
        <Card key={p.priority}><CardHeader className="pb-2"><CardTitle className="text-sm">{p.label} · priorità {PRIORITY_LABEL[p.priority]}</CardTitle></CardHeader>
          <CardContent className="space-y-2">{p.items.map((r) => (
            <div key={r.rule_code} className="rounded-lg border p-3">
              <p className="text-sm font-medium">{r.gap_title}</p>
              {r.neutral_action && <p className="text-sm mt-1"><span className="text-muted-foreground">Raccomandazione: </span>{r.neutral_action}</p>}
              {r.rationale && <p className="text-xs text-muted-foreground mt-1">Perché: {r.rationale}</p>}
            </div>))}
          </CardContent></Card>
      ))}
      <p className="text-xs text-muted-foreground">Le tempistiche sono indicative e dipendono dalla priorità. Raccomandazioni generate automaticamente dalle risposte all'assessment.</p>
    </div>
  );
}
