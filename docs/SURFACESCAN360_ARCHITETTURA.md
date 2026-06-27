# SurfaceScan360 - Entry point architettura

> Source of truth aggiornata: `docs/surfacescan360/`
> Ultima revisione: 2026-06-27

SurfaceScan360 e' il modulo EASM multi-tenant di HiCompliance. Coordina scope autorizzato, motori DNS/HTTP/TLS/TCP, ConnectSecure ASM, OSINT rete pubblica, discovery sottodomini, CVE/NVD, EPSS e CISA KEV. Tutti i dati vengono normalizzati nelle tabelle `surface_*` prima di raggiungere GUI e report.

## Documentazione

| Documento | Contenuto |
|---|---|
| [README](./surfacescan360/README.md) | indice, diagramma end-to-end e principi |
| [01 - Architettura, motori e dati](./surfacescan360/01-ARCHITETTURA-MOTORI-DATI.md) | pipeline, scope, snapshot e UI |
| [02 - ConnectSecure, NVD, sottodomini e scoring](./surfacescan360/02-CONNECTSECURE-NVD-SUBDOMAIN-SCORING.md) | auth, ASM, queue, CVE e Score V2 |
| [03 - Supabase Edge, SQL e cron](./surfacescan360/03-SUPABASE-EDGE-SQL-CRON.md) | Edge canoniche, tabelle, RLS, grant e schedule |
| [04 - Runbook DEV -> Produzione](./surfacescan360/04-RUNBOOK-DEV-TO-PRODUCTION.md) | secrets, migration, deploy, smoke e rollback |
| [05 - Data dictionary](./surfacescan360/05-DATA-DICTIONARY.md) | mapping sorgente -> tabella -> UI -> report |

## Percorso rapido

- Per capire perche' una porta appare in UI: leggere `01` e `05`.
- Per diagnosticare `Failed to authorize`: leggere `02` e il troubleshooting in `04`.
- Per replicare DEV in produzione: seguire `04` nell'ordine indicato.
- Per verificare cron, tabelle e policy: usare `03`.
- Per modificare l'algoritmo di rischio: partire da `02` e da `supabase/functions/_shared/exposure-score-v2.ts`.

## Regole non negoziabili

- Nessun token/JWT reale nella documentazione o nel repository.
- Nessun provider interno esposto in GUI o report cliente.
- Nessuna scansione fuori dallo scope autorizzato.
- Nessuna ricorsione non limitata sui sottodomini.
- Migrazioni forward-only e deploy Edge selettivi.
