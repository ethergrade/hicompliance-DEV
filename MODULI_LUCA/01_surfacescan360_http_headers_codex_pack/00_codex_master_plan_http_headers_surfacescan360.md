# Codex Master Plan - Integrare HTTP Security Headers Scanner in SurfaceScan360

## Obiettivo
Integrare un nuovo scanner HTTP Security Headers dentro SurfaceScan360, senza creare un prodotto parallelo. Il modulo deve analizzare domini e URL pubblici già in perimetro, salvare risultati in Supabase, mostrarli in dashboard e inserirli nel report SurfaceScan360.

## Prima di modificare codice
Esegui una ricognizione nel repo `ethergrade/hicompliance-DEV`:

1. Cerca file e componenti esistenti con queste keyword:
   - `SurfaceScan`
   - `surface scan`
   - `surface_scan`
   - `Shodan`
   - `Pentest`
   - `web-check`
   - `report`
   - `scan_jobs`
   - `assets`
   - `domains`
   - `supabase.functions.invoke`
2. Identifica:
   - tabella Supabase usata per scan job e asset del cliente;
   - Edge Functions già presenti per SurfaceScan360;
   - componenti dashboard già usati per score, severity, finding table, report export;
   - sistema di generazione PDF/DOCX già presente.
3. Non duplicare layout, toast, badge, cards, tabs o client Supabase se già presenti.
4. Se SurfaceScan360 ha già un orchestratore, aggiungi lo scanner come step `http_headers`, non come flusso separato.

## Fonte logica da portare
Porta la logica del Python scanner in TypeScript:

- data shapes: `HeaderRule`, `HeaderFinding`, `ScanReport`;
- funzione pura `evaluateHeaders()` testabile senza rete;
- funzione I/O `scanHttpSecurityHeaders()` che fa una singola richiesta HTTP;
- score pesato e grade A-F;
- recommendation per finding non OK.

## Architettura desiderata

```text
SurfaceScan360 scan job
  -> asset URL/domain in scope
  -> Edge Function surface-http-headers-scan
  -> evaluate headers
  -> persist results + findings
  -> dashboard aggregata
  -> report SurfaceScan360
```

## Vincoli

- Mai eseguire scan su URL non presenti nel perimetro cliente o nel job SurfaceScan360.
- Implementare protezione anti-SSRF minima: blocco localhost, 127.0.0.1, 0.0.0.0, ::1, 10/8, 172.16/12, 192.168/16, 169.254/16.
- Usare timeout massimo 10 secondi per target.
- Seguire redirect e salvare `final_url`.
- Salvare raw headers solo come JSONB tecnico.
- Non bloccare l'intero scan job se un target fallisce: salvare risultato con `status = error`.
- UI e report devono mostrare remediation business-oriented, non solo dati grezzi.

## Deliverable attesi

1. `supabase/functions/_shared/httpHeadersScanner.ts`
2. `supabase/functions/surface-http-headers-scan/index.ts`
3. migration SQL per tabelle risultati e findings
4. integrazione orchestratore SurfaceScan360
5. componenti dashboard
6. sezione report
7. test unitari sulle funzioni pure
8. test manuale con almeno 3 URL

## Definition of Done

- Un job SurfaceScan360 scansiona gli header per ogni URL/domain in scope.
- Ogni asset ha score, grade, findings, raw headers e remediation.
- Dashboard mostra KPI aggregati e tabella asset.
- Report include executive summary e dettagli tecnici.
- Nessun segreto o API key viene introdotto.
- `npm run build` e `npm run lint` passano.
