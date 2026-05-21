# SurfaceScan360 — WebCheck-lite Enrichment Engine

Reimplementazione clean-room ispirata a `lissy93/web-check`, nativa Supabase Edge + Lovable. Niente Express, niente Puppeteer, niente container. Si integra con quanto già fatto: cron Shodan, `external_scan_jobs`, integrazione Pentest-Tools, tab "CVE validati" su `SurfaceScan360`.

## Architettura

```text
Lovable UI (/admin/surfacescan360 + tab esistenti)
    │
    ▼
surfacescan360-start-scan  ──►  surface_scan_jobs (queued)
                                       │
                                       ▼
                       surfacescan360-run-enrichment
                                       │
        ┌──────────────────────────────┼───────────────────────────────┐
        ▼            ▼          ▼          ▼           ▼          ▼
       DNS       HTTP/Hdr   Sec.Hdr/HSTS  Robots/    Redirect    Mail
                                         Sitemap/    Chain      (SPF/DMARC/
                                         Sec.txt                 DKIM/BIMI)
                                       │
                       ┌───────────────┼────────────────┐
                       ▼               ▼                ▼
                   Shodan         Shared-Hosting    urlscan.io
                  (esistente)      Detector         (opt.)
                                       │
                                       ▼
                       Pentest-Tools (già integrato)
                                       │
                                       ▼
        surface_assets · surface_observations · surface_findings ·
        surface_external_intel · surface_scan_audit_log
```

I dati esistenti restano: `external_scan_jobs/tasks/findings`, `shodan_enrichments`, `surface_scan_history`. Il nuovo modello `surface_*` affianca e generalizza (multi-provider, multi-modulo); ponti soft via `provider` + viste, no rottura.

## Fasi (consigliato: approvare una fase per volta)

### Fase 1 — Core engine "safe_recon" (nessuna API a pagamento)
Deliverable: scan domain/url passivo, salvataggio normalizzato, UI base.
- **DB migration**: nuove tabelle `surface_scan_jobs`, `surface_assets`, `surface_observations`, `surface_findings`, `surface_external_intel`, `surface_scan_audit_log` con RLS multi-tenant allineata alle altre (`organization_id`, Sales globale, admin write).
- **Shared lib** `supabase/functions/_shared/targetParser.ts`: parser/normalizzatore + blocklist privati/loopback/metadata.
- **Edge fn `surfacescan360-start-scan`** (verify_jwt=true): auth, ownership, autorizzazione, normalizza, crea job. Limite 3 concurrent/org.
- **Edge fn `surfacescan360-run-enrichment`** (verify_jwt=false, invocata server-side): esegue moduli in `Promise.allSettled`, scrive observations/findings, aggiorna status.
- **Moduli**: DNS (DoH Cloudflare), HTTP status, HTTP headers, Security headers, HSTS, robots.txt, security.txt, sitemap, redirect chain, mail security (SPF/DMARC/DKIM/BIMI).
- **UI** in `SurfaceScan360.tsx`: nuovo tab "OSINT enrichment" con launcher + lista job + observations a card + findings a tabella + JSON viewer evidence. Hook `useSurfaceScanEngine`.

### Fase 2 — External intel
- **Shodan enricher** (riusa `SHODAN_API_KEY`, allinea a `shodan_enrichments`).
- **Shared-hosting detector** (regola: >3 hostname non correlati, ASN CDN, signal da PT Virtual Hosts) → setta `hosting_context` su job.
- **urlscan.io** (nuovo secret `URLSCAN_API_KEY`, opzionale): screenshot URL, tech, verdetto malicious.
- **SecurityTrails subdomain discovery** (opzionale, `SECURITYTRAILS_API_KEY`).
- Aggancio: se job nuovo per dominio già coperto da cron Shodan, riusa snapshot esistente (no doppia chiamata).

### Fase 3 — Active validation
- Integrare Pentest-Tools già pronto come modulo del nuovo engine (profilo `cve_api_validation`).
- Mappare `external_cve_findings` → `surface_findings` via vista o doppia scrittura.
- Trigger automatico dal cron resta come oggi; in più il nuovo engine può essere lanciato manualmente con profilo dedicato.

### Fase 4 — Scoring & report
- Exposure Score, Mail Security Score, Web Hardening Score, Attack Surface Confidence, Attribution Confidence calcolati su `surface_findings` con pesatura severity + KEV/EPSS.
- Card riepilogo in `SurfaceScan360` + export PDF/DOCX riusando il pattern esistente.

## Vincoli & sicurezza (validi per tutte le fasi)

- RLS sempre attiva, scoping `organization_id`, Sales/Admin override come per le altre tabelle.
- Secret server-side only (`SHODAN_API_KEY`, `PENTEST_TOOLS_*`, eventuali `URLSCAN_API_KEY`, `SECURITYTRAILS_API_KEY`).
- Block list target: privati, loopback, link-local, 169.254.169.254, CIDR (v1).
- Max 3 scan concorrenti per org; rate-limit creazione (10/h/utente).
- Mai attribuire CVE IP-level a un dominio in `shared_hosting`: solo `external_signal_not_attributed`.
- Audit obbligatorio su start/retry/profile cambio.
- Zero codice Web-Check copiato; se in futuro qualche snippet venisse riusato, includere attribuzione MIT (autore Alicia Sykes).

## Dettagli tecnici chiave

- Tutti i moduli sono funzioni pure `(ctx) => Promise<{observations[], findings[], assets[]}>`. Centralizzato error handling.
- DoH provider configurabile via env (`DOH_URL`, default Cloudflare); fallback Google su 5xx.
- Redirect chain: implementazione manuale `redirect: 'manual'`, max 10 hop, traccia ogni hop e classifica downgrade/cross-domain.
- Mail security: lookup SPF (TXT v=spf1), DMARC (`_dmarc.<dom>`), DKIM su selettori comuni, BIMI (`default._bimi.<dom>`).
- Tutte le risposte raw salvate in `surface_external_intel.raw_response` per audit/replay.

## Cosa NON è incluso

- Port scan TCP nativo, traceroute, screenshot Chromium, Lighthouse (delegati a Pentest-Tools/urlscan).
- Wildcard/CIDR scanning (v2 con autorizzazione esplicita).
- Migrazione automatica dei findings storici Pentest-Tools nelle nuove tabelle (solo nuovi job).

## Domanda di approvazione

Lo scope completo è grande (4 fasi, ~6 tabelle nuove, 2 edge fn nuove + ~12 moduli, UI dedicata). Conferma se procedere così:

1. **Solo Fase 1** ora (più sicuro, ~1 PR grande): engine + safe_recon + UI base.
2. **Fase 1 + 2** insieme (engine + intel passiva): include Shodan/urlscan/shared-hosting detector.
3. **Tutto end-to-end** (4 fasi): rischio errori più alto, response più lunga.

Dimmi quale opzione e procedo. Default consigliato: **Fase 1**, poi iteriamo.
