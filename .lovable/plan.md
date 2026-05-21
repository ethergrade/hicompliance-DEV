Rimuovere la frase "Nessuno screenshot" dal sottotitolo del tab "Report AI SurfaceScan360".

**File:** `src/components/surface-scan/AiReportTab.tsx` (riga 159-160)

**Prima:**
> Genera un report con anagrafica cliente, asset in scope, findings e Top-5 raccomandazioni correlate da AI agent (OpenAI gpt-4o-mini). Nessuno screenshot, pronto per export PDF.

**Dopo:**
> Genera un report con anagrafica cliente, asset in scope, findings e Top-5 raccomandazioni correlate da AI agent. Pronto per export PDF.

Tolgo anche il riferimento al modello specifico (OpenAI gpt-4o-mini) per coerenza con la policy "agnostica" già applicata altrove. Nessun'altra modifica.