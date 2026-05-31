# Codex - UI/UX Dashboard HTTP Headers in SurfaceScan360

## Obiettivo
Aggiungere in dashboard SurfaceScan360 una sezione chiara per HTTP Security Headers, con KPI executive e drill-down tecnico.

## Prima di sviluppare
Individua componenti già presenti:

- card KPI
- badge severity/status
- tab navigation
- finding table
- drawer/modal dettaglio asset
- componenti chart Recharts
- toast/loading/error state
- client Supabase già configurato

Riutilizza il design system esistente.

## Posizionamento UI
Aggiungi una tab dentro la pagina di dettaglio scan:

```text
Overview | Exposure | Ports | Technologies | Web Check | HTTP Headers | Report
```

Se esiste già una tab Web/Security, integra HTTP Headers come sottosezione.

## KPI in alto
Mostra 4 card:

1. **Average Header Score**
   - valore: media score
   - subtitle: `A-F grading based on weighted security headers`
2. **Assets A/B**
   - valore: asset con grade A o B
   - subtitle: `Acceptable browser hardening`
3. **High Impact Open**
   - valore: finding high non OK
   - subtitle: `HSTS/CSP missing or weak`
4. **Most Missing Header**
   - valore: header con più status `missing`
   - subtitle: `Top remediation candidate`

## Tabella asset
Colonne:

- Asset / URL
- Final URL
- HTTP status
- HTTPS
- Grade
- Score
- Missing
- Weak
- High impact open
- Last scan
- Action: `View findings`

## Drawer dettaglio asset
Quando l'utente apre un asset:

### Header
- URL originale
- Final URL
- status code
- response time
- grade e score

### Findings
Tabella:

- Header
- Status
- Severity
- Evidence / actual value
- Why it matters
- Recommendation

### Raw headers
Accordion tecnico collapsible, non aperto di default.

## Colori e badge

- `ok`: verde
- `weak`: amber/orange
- `missing`: rosso
- `error`: grigio/rosso
- grade A/B: verde
- grade C: giallo
- grade D/F: rosso

## Copy UX
Usa copy business-oriented:

- Non dire solo `CSP missing`.
- Scrivi: `Content-Security-Policy missing: higher exposure to XSS and content injection.`
- Per HSTS: `HSTS missing or weak: users may be exposed to downgrade/mixed-content scenarios on future visits.`

## Query Supabase frontend
Crea hook:

```text
src/hooks/useSurfaceHttpHeaderResults.ts
```

Deve esportare:

```ts
useSurfaceHttpHeaderSummary(scanId: string)
useSurfaceHttpHeaderResults(scanId: string)
useSurfaceHttpHeaderFindings(resultId: string)
```

Se esiste già React Query, usare `@tanstack/react-query`.

## Componenti suggeriti

```text
src/components/surface-scan/http-headers/HttpHeadersSummaryCards.tsx
src/components/surface-scan/http-headers/HttpHeadersAssetTable.tsx
src/components/surface-scan/http-headers/HttpHeadersFindingDrawer.tsx
src/components/surface-scan/http-headers/HttpHeadersGradeBadge.tsx
```

## Acceptance criteria

- La tab HTTP Headers compare solo se il modulo è abilitato o se esistono risultati.
- Stato loading/skeleton coerente con il resto della dashboard.
- Stato empty: `No HTTP header scan results yet. Run SurfaceScan360 to populate this section.`
- Stato error leggibile.
- Drill-down asset disponibile senza ricaricare pagina.
