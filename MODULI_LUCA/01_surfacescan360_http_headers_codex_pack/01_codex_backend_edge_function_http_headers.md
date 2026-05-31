# Codex - Backend Edge Function HTTP Headers Scanner

## Obiettivo
Creare una Supabase Edge Function che esegue lo scan HTTP Security Headers per uno o più asset SurfaceScan360.

## File da creare

```text
supabase/functions/_shared/httpHeadersScanner.ts
supabase/functions/surface-http-headers-scan/index.ts
```

## Implementazione shared scanner
Usa il codice TypeScript fornito nel file `httpHeadersScanner.ts` e salvalo in:

```text
supabase/functions/_shared/httpHeadersScanner.ts
```

Deve esportare:

```ts
scanHttpSecurityHeaders(inputUrl: string, timeoutMs?: number): Promise<HttpHeaderScanReport>
evaluateHeaders(...): HttpHeaderScanReport
HTTP_SECURITY_HEADER_RULES
```

## Edge Function contract
La funzione deve accettare POST JSON:

```json
{
  "scan_id": "uuid",
  "project_id": "uuid",
  "assets": [
    {
      "asset_id": "uuid",
      "asset_type": "domain|url",
      "value": "https://example.com"
    }
  ]
}
```

Risposta:

```json
{
  "ok": true,
  "scanner": "surface-http-headers",
  "scan_id": "uuid",
  "processed": 3,
  "failed": 0,
  "results": [
    {
      "asset_id": "uuid",
      "url": "https://example.com",
      "score": 85,
      "grade": "B",
      "status_code": 200,
      "final_url": "https://www.example.com/"
    }
  ]
}
```

## Regole operative

1. Validare JWT utente se le altre funzioni SurfaceScan360 lo fanno già.
2. Verificare che `scan_id`, `project_id` e `asset_id` siano collegati al tenant/profilo corretto.
3. Scansionare solo asset già presenti nel perimetro del job.
4. Non accettare URL arbitrari fuori perimetro.
5. Processare in batch con concorrenza bassa, massimo 3 target paralleli.
6. Timeout per singolo target: 10 secondi.
7. Salvare errori target-specific senza fallire tutta la funzione.

## Pseudocodice Edge Function

```ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scanHttpSecurityHeaders } from "../_shared/httpHeadersScanner.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const body = await req.json();
  const { scan_id, project_id, assets } = body;

  // TODO: load job + scoped assets from DB and compare with input
  // TODO: deny assets not present in the job scope

  const results = [];
  for (const asset of assets) {
    const report = await scanHttpSecurityHeaders(asset.value, 10000);
    const resultId = await persistHeaderResult(supabase, scan_id, project_id, asset, report);
    await persistHeaderFindings(supabase, resultId, report.findings);
    results.push({ asset_id: asset.asset_id, url: asset.value, score: report.score, grade: report.grade });
  }

  return json({ ok: true, scanner: "surface-http-headers", scan_id, processed: results.length, results });
});
```

## Persistenza
Usare le tabelle definite nella migration del file `02_codex_database_migration_http_headers.md`.

## Note importanti

- Se esiste già una tabella generica `surface_scan_results`, puoi integrare lì usando `scanner_type = 'http_headers'`, ma mantieni una tabella findings normalizzata o JSONB interrogabile.
- Se esiste già un orchestratore Edge Function SurfaceScan360, invoca questa funzione come step interno.
- Non mettere chiamate HTTP dal browser verso i target: CORS e sicurezza rendono lo scan browser-side inadatto.
