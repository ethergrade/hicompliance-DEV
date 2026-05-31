# Codex Prompt - Backend Edge Function DNS Lookup Scanner

## Scopo
Implementa una Supabase Edge Function `dns-lookup-scan` per SurfaceScan360.

Usa il file shared scanner:

```text
supabase/functions/_shared/dnsLookupScanner.ts
```

Il codice shared deve essere basato sul file TypeScript fornito `dnsLookupScanner.ts`.

## Endpoint

```http
POST /functions/v1/dns-lookup-scan
Content-Type: application/json
Authorization: Bearer <JWT>
```

Payload:

```json
{
  "scan_id": "uuid",
  "asset_id": "uuid",
  "tenant_id": "uuid",
  "domain": "example.com",
  "options": {
    "includeEmailSecurityChecks": true,
    "includeDkimSelectorChecks": false,
    "includeWildcardCheck": true
  }
}
```

Response:

```json
{
  "ok": true,
  "result_id": "uuid",
  "domain": "example.com",
  "score": 82,
  "grade": "B",
  "findings": 7,
  "high": 1,
  "medium": 2,
  "low": 3
}
```

## Implementazione richiesta

1. Validare metodo POST.
2. Validare JWT o usare pattern auth già presente nel progetto.
3. Validare che `domain` appartenga agli asset autorizzati del `scan_id` o `tenant_id`.
4. Normalizzare dominio.
5. Invocare `scanDnsLookup()`.
6. Salvare risultato completo in `surface_dns_lookup_results`.
7. Salvare findings normalizzati in `surface_dns_lookup_findings` oppure nella tabella findings esistente se già presente.
8. Aggiornare stato job SurfaceScan360 se esiste orchestratore.
9. Restituire summary breve al frontend.

## Regole importanti

### Non usare codice browser
Lo scanner DNS deve girare lato Edge Function, non lato React. Il browser non deve fare direttamente query DNS.

### Resolver
Usare DNS-over-HTTPS di default:

```text
https://cloudflare-dns.com/dns-query
```

Permettere override solo via secret/env controllato:

```text
DNS_LOOKUP_RESOLVER_URL
DNS_LOOKUP_TIMEOUT_MS
```

### Error handling
Un errore su MX, TXT o CAA non deve fallire l’intera funzione. Ogni record set deve avere:

```ts
{
  query,
  type,
  answers: [],
  error: "...",
  durationMs
}
```

### Anti-abuse
- bloccare `.local`, `.lan`, `.internal`, `localhost`;
- bloccare input con path, querystring, spazi o wildcard manuali;
- non permettere scansioni su domini fuori perimetro;
- rate limit per tenant se esiste già infrastruttura rate limiting.

## Pseudocodice funzione

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scanDnsLookup } from "../_shared/dnsLookupScanner.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json();
  const { scan_id, asset_id, tenant_id, domain, options } = body;

  // 1. auth
  // 2. validate perimetro
  // 3. run scan
  const result = await scanDnsLookup({
    domain,
    resolverUrl: Deno.env.get("DNS_LOOKUP_RESOLVER_URL") ?? undefined,
    timeoutMs: Number(Deno.env.get("DNS_LOOKUP_TIMEOUT_MS") ?? 5000),
    includeEmailSecurityChecks: options?.includeEmailSecurityChecks ?? true,
    includeDkimSelectorChecks: options?.includeDkimSelectorChecks ?? false,
    includeWildcardCheck: options?.includeWildcardCheck ?? true,
    userAgent: "SurfaceScan360-DNSLookup/1.0"
  });

  // 4. insert result and findings
  // 5. return summary
});
```

## Deploy

```bash
supabase functions deploy dns-lookup-scan
```

## Test locale

```bash
supabase functions serve dns-lookup-scan
curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/dns-lookup-scan' \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '{"scan_id":"...","asset_id":"...","tenant_id":"...","domain":"example.com"}'
```
