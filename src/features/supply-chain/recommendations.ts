export type SupplierRec = { rule_code: string; gap_title: string; neutral_action: string | null; priority: string; rationale?: string | null };

export const PRIORITY_LABEL: Record<string, string> = { high: "Alta", medium: "Media", low: "Bassa" };
/** Suggested timeframe per priority (proposal, shown as guidance). */
export const HORIZON: Record<string, { key: string; label: string }> = {
  high: { key: "30", label: "Entro 30 giorni" },
  medium: { key: "60", label: "Entro 60 giorni" },
  low: { key: "90", label: "Entro 90 giorni" },
};

/** Automatic insights derived only from score and stored gaps. */
export function buildSupplierInsights(score: number | null | undefined, recs: SupplierRec[]) {
  const high = recs.filter((r) => r.priority === "high").length;
  const medium = recs.filter((r) => r.priority === "medium").length;
  const low = recs.filter((r) => r.priority === "low").length;
  const insights: string[] = [];
  if (score == null) insights.push("Completa e invia l'assessment per ricevere raccomandazioni personalizzate.");
  else if (score < 40) insights.push(`Punteggio ${score}: postura critica. Dai priorità assoluta alle azioni ad alta priorità.`);
  else if (score < 60) insights.push(`Punteggio ${score}: postura insufficiente. Le azioni ad alta priorità portano il miglioramento più rapido.`);
  else if (score < 80) insights.push(`Punteggio ${score}: postura discreta. Chiudi i gap residui per raggiungere un livello buono.`);
  else insights.push(`Punteggio ${score}: postura buona. Mantieni i controlli e verifica periodicamente.`);
  if (high) insights.push(`${high} azioni ad alta priorità da avviare entro 30 giorni.`);
  if (score != null && recs.length === 0) insights.push("Nessun gap rilevato nell'ultimo assessment.");
  const plan = (["high", "medium", "low"] as const).map((p) => ({ priority: p, ...HORIZON[p], items: recs.filter((r) => r.priority === p) }));
  return { insights, counts: { high, medium, low, total: recs.length }, plan };
}
