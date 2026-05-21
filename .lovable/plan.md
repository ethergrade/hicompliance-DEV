
# Pentest-Tools Integration — Validatore Attivo Surface Scan

Scelte fatte: auto-trigger dal cron Shodan quando `shodan_status ∈ {not_found, shared_hosting}`, ricezione risultati via webhook, profili `recon_safe + cve_web + cve_network` con guard rail, finding mostrati come tab "CVE validati" dentro SurfaceScan360.

## Architettura

```text
cron settimanale Shodan
    └─> surface-scan-cron (esistente)
            ├─> snapshot in surface_scan_history
            └─> per ogni asset/target:
                  classifica shodan_status + hosting_context
                  se serve validazione attiva:
                      crea external_scan_jobs (status=queued)
                      └─> pentest-tools-orchestrator (nuova edge fn)
                              └─> POST /scans per ogni tool del profilo
                                    └─> external_scan_tasks
                                          (configurato webhook callback)

Pentest-Tools API
    └─> webhook → pentest-tools-webhook (edge fn pubblica)
            ├─> verifica firma + idempotenza
            ├─> normalizza findings
            └─> upsert external_cve_findings
                  └─> realtime/refetch in UI tab "CVE validati"
```

## Step 1 — Setup chiave API e secret

- Aggiungere `PENTEST_TOOLS_API_KEY` come Supabase secret (input utente, mai esposta al frontend).
- Aggiungere `PENTEST_TOOLS_WEBHOOK_SECRET` per validare i payload in arrivo (header `X-PT-Signature` HMAC SHA256 sul body, oppure shared token nell'URL se la firma non è disponibile).
- Opzionale: `PENTEST_TOOLS_WORKSPACE_ID` se l'organizzazione Pentest-Tools usa workspace multipli.

## Step 2 — Schema database (migration unica)

Tabelle nuove, tutte con RLS multi-tenant (org-scoped + Sales/Admin globale, allineato alle altre):

- **`external_scan_jobs`** — un job = un target+profilo richiesto.
  Campi chiave: `organization_id`, `target`, `target_type` (`domain|url|ip`), `resolved_ips[]`, `hosting_context` (`dedicated|shared_hosting|cdn_proxy|unknown`), `shodan_status` (`found_exact|found_ip_only|not_found|stale_or_low_confidence`), `scan_profile` (`recon_safe|cve_web|cve_network|deep_authorized`), `status` (`queued|running|partial|completed|failed`), `triggered_by` (`cron|manual|auto_from_shodan`), `requested_by`, `authorization_proof`, `created_at`, `started_at`, `completed_at`.

- **`external_scan_tasks`** — un task = una chiamata `POST /scans` (un tool).
  Campi: `scan_job_id` (FK cascade), `tool_id` (int), `tool_name`, `target`, `external_scan_id` (id restituito da Pentest-Tools), `external_task_id`, `status` (raw + mappato), `progress`, `raw_status` jsonb, timestamps.

- **`external_cve_findings`** — un record per finding normalizzato.
  Campi: `scan_job_id`, `task_id`, `organization_id`, `external_finding_id`, `target`, `affected_url`, `ip`, `port`, `protocol`, `service`, `name`, `cve[]`, `cwe`, `cvss`, `cvssv3`, `epss_score`, `epss_percentile`, `in_cisa_catalog` bool, `risk_level` (0-4), `severity` (info/low/medium/high/critical), `attribution_confidence` (`high|medium|low`), `confidence` (`validated|active_scan_validated|external_signal_not_attributed|unvalidated`), `status` (open/triaged/risolto/falso_positivo), `recommendation`, `evidence` jsonb, `raw_finding` jsonb, `created_at`.

- **`shodan_enrichments`** — passa lo snapshot Shodan a contesto del job.
  Campi: `scan_job_id`, `target`, `ip`, `source` (`host|search|internetdb`), `found` bool, `ports[]`, `hostnames[]`, `cpes[]`, `vulns` jsonb, `raw_response` jsonb, `confidence`, `created_at`.

- **`external_scan_reports`** — report PDF/DOCX/CSV generati on-demand.
  Campi: `scan_job_id`, `external_report_id`, `format`, `group_by`, `status`, `download_url` (signed quando ready), `created_by`, `created_at`.

- **`external_scan_audit_log`** — ogni azione (start, retry, override autorizzazione, profilo deep).
  Campi: `organization_id`, `actor_id`, `action`, `details` jsonb, `created_at`.

Indici: `(organization_id, created_at desc)` su jobs/findings; `external_scan_id` univoco su tasks; `(scan_job_id, external_finding_id)` univoco su findings per idempotenza webhook.

## Step 3 — Decision engine (libreria condivisa)

`src/lib/pentestPlan.ts` (e copia mirror server in `supabase/functions/_shared/pentestPlan.ts`):

- `classifyHostingContext(shodanData, vhostsData?)` → `dedicated|shared_hosting|cdn_proxy|unknown`. Regole: >3 hostname non correlati sullo stesso IP, ASN noto di shared/CDN (Cloudflare/Akamai/Fastly), o flag esplicito da Virtual Hosts Finder.
- `classifyShodanStatus(shodanData, target)` → `found_exact|found_ip_only|not_found|stale_or_low_confidence`. `last_update` > 14 giorni ⇒ stale.
- `decidePlan({ target, isUrl, resolvedIps, shodanStatus, hostingContext, technologies, authorizationLevel, profile })` → ritorna array di `{ tool_id, tool_name, target, params }`. Stessa logica del prompt: niente Network Scanner su shared, CMS scanner condizionati a `technologies[]`, ecc.

Tool ID centralizzati come enum (`PT_TOOLS.WEBSITE_RECON = 310`...).

## Step 4 — Edge functions

### 4a. `pentest-tools-client` (libreria interna)

File `supabase/functions/_shared/pentestClient.ts`: wrapper per `startScan`, `getScan`, `getScanOutput`, `getFindings`, `getFindingDetails`, `createReport`, `getReport`, `downloadReport`. Gestisce:

- header Bearer.
- rate limit lato client: token bucket in memoria (250 GET/min, 125 POST/min). Persistenza counter in tabella `external_scan_audit_log` per visibilità.
- retry esponenziale su 429 leggendo `Retry-After`.
- `request_id` per logging.

### 4b. `pentest-tools-orchestrator` (verify_jwt = true)

Endpoint POST per:
- avvio manuale (admin): `{ organization_id, target, profile, authorization_proof }`.
- avvio auto dal cron Shodan (chiamata interna service-role).

Flusso:
1. Verifica autorizzazione (admin role per `cve_network`/`deep_authorized`, ownership check).
2. Carica enrichment Shodan dall'ultimo snapshot, calcola `hosting_context`/`shodan_status`.
3. Chiama `decidePlan()`. Se shared hosting + profilo `cve_network` ⇒ blocca con 403 a meno di `authorization_proof`.
4. Crea `external_scan_jobs` + N `external_scan_tasks`.
5. Per ogni task chiama `POST /scans`, salva `external_scan_id`, configura webhook URL per quel task (se Pentest-Tools lo permette per scan, altrimenti webhook globale già configurato in dashboard).
6. Audit log entry.

### 4c. `pentest-tools-webhook` (verify_jwt = false, pubblico)

Endpoint POST per ricevere notifiche scan completati:
1. Verifica firma HMAC con `PENTEST_TOOLS_WEBHOOK_SECRET` (header `X-PT-Signature`).
2. Estrae `task_id`/`scan_id`, cerca `external_scan_tasks.external_scan_id`. Se non trovato ⇒ 404 silenzioso (idempotenza: rispondiamo 200 per non causare retry inutili).
3. Chiama `getScan()` per stato + `getFindings(task_id)` per finding normalizzati.
4. Upsert `external_cve_findings` (deduplicato su `(scan_job_id, external_finding_id)`).
5. Applica regole di attribuzione (`attribution_confidence` + `confidence`):
   - Website/SSL/CMS/API Scanner su dominio ⇒ `high` + `active_scan_validated`.
   - Network Scanner su IP dedicato autorizzato ⇒ `high` + `active_scan_validated`.
   - Match con CVE già presente in `shodan_enrichments.vulns` ⇒ promuove la finding Shodan a `validated`.
   - Network Scanner su shared hosting ⇒ `low` + `external_signal_not_attributed`.
6. Se tutti i task del job sono terminati ⇒ aggiorna `external_scan_jobs.status = completed`, `completed_at = now()`, ricalcola `surface_scan_history.assets_snapshot` con i finding validati (campo nuovo `validated_cves_count`).
7. Risposta 200 entro 10s (lavoro pesante può essere async in background con `EdgeRuntime.waitUntil` se serve).

### 4d. Estensione `surface-scan-cron`

Modifica esistente: dopo aver salvato lo snapshot Shodan per ogni org, valutare per ciascun asset Shodan:
- se `shodan_status = not_found` ⇒ se l'org ha `pentest_tools_auto_validation = true` (nuovo flag su `organizations`), invocare orchestrator con profilo `cve_web` sul target dominio.
- se `hosting_context = shared_hosting` ⇒ stessa cosa, profilo `cve_web`.
- mai auto-`cve_network` (richiede ownership proof esplicito).

## Step 5 — Frontend

### 5a. Nuovo flag organizzazione

In `ClientServicesDialog.tsx`, sotto la sezione "SurfaceScan Esteso", aggiungere Switch:
- **"Validazione attiva CVE (Pentest-Tools)"** → salva `organizations.pentest_tools_auto_validation`. Tooltip: "Quando Shodan non trova dati o l'IP è shared hosting, lancia automaticamente uno scan CVE attivo sul dominio."

### 5b. Tab "CVE validati" in SurfaceScan360

Nuova `Tabs` wrapper attorno alla sezione asset attuale:
- **Tab 1 "Asset esposti"** — esistente (Shodan).
- **Tab 2 "CVE validati"** — nuova.

Contenuto tab 2 (`src/components/surface-scan/ValidatedCveTab.tsx`):
- Banner con summary: N finding `high`, N `validated`, N `external_signal_not_attributed`.
- Pulsante **"Esegui validazione attiva ora"** (solo admin) → apre Sheet con: target preselezionato dalle regole, scelta profilo (`recon_safe`/`cve_web`/`cve_network`), checkbox autorizzazione, textarea ownership proof se `cve_network`. Submit chiama orchestrator.
- Lista job (`external_scan_jobs`) con stato e progress aggregato dai task. Polling 30s su job non completed (anche se i risultati arrivano via webhook, lo stato visivo si aggiorna senza refresh).
- Tabella finding (`external_cve_findings`): colonne CVE, CVSS, EPSS, KEV badge, target, port/service, `attribution_confidence` (badge colorato), azione "Dettaglio" che apre Sheet con evidence + recommendation + raw payload.
- Filtri per severity/confidence/job.
- Empty state se nessun job: spiega che la validazione parte automaticamente quando Shodan è cieco, oppure manualmente da qui.

### 5c. Hook

- `useExternalScanJobs(orgId)` — react-query, polling 30s su jobs `queued|running`.
- `useExternalCveFindings(orgId, filters)` — react-query, refetch on job complete.
- `useTriggerPentestScan()` — mutation che chiama orchestrator.

### 5d. Toggle in SurfaceScan360 esistente

Sugli asset Shodan, aggiungere piccolo badge "✓ Validato" se esiste almeno un finding `attribution_confidence=high` per quell'IP/hostname, oppure "⚠ Non validato (shared hosting)" se `external_signal_not_attributed` presente.

## Step 6 — Safety & rate limiting

- Funzione `has_role(_, 'admin')` per gate orchestrator quando profilo è `cve_network`/`deep_authorized` o quando target è IP/CIDR.
- Limite hard-coded: `max 3 concurrent jobs per organization` (count su `external_scan_jobs WHERE status IN ('queued','running')` prima di crearne uno nuovo).
- Limite cron auto: `max 10 auto-validation per org per settimana` (count su `external_scan_jobs WHERE triggered_by='auto_from_shodan' AND created_at > now() - interval '7 days'`).
- Audit log obbligatorio su ogni `POST /scans`.

## Step 7 — Webhook setup utente

Documentare nel changelog: l'admin deve configurare in Pentest-Tools dashboard l'URL webhook:

```
https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/pentest-tools-webhook
```

con il secret HMAC condiviso. Aggiungere card in pagina admin Integrazioni con URL+istruzioni copia.

## Step 8 — Memoria progetto

Salvare `mem://surface-scan/pentest-tools-integration` con: profili supportati, regole attribuzione, flag `pentest_tools_auto_validation`, webhook URL e regole guard rail (mai Network Scanner su shared, sempre proof per IP).

## Cosa NON è incluso nella v1

- Profilo `deep_authorized` (rinviato a v2 dopo aver validato l'esperienza).
- Scanning CIDR (solo IP singoli o range derivati dalle regole esistenti).
- Webhook signature verification con certificato pinning (usiamo HMAC shared secret).
- Generazione report PDF/DOCX/CSV (schema pronto in `external_scan_reports`, UI rinviata).

## Deliverable

- 1 migration database (~6 tabelle nuove + flag organizations).
- 3 edge functions nuove + 1 estesa + 2 librerie condivise.
- 1 tab UI nuova + 1 sheet config + estensione `ClientServicesDialog`.
- 1 secret + 1 file di memoria.

Conferma quando vuoi che proceda con l'implementazione: ti chiederò di aggiungere `PENTEST_TOOLS_API_KEY` e `PENTEST_TOOLS_WEBHOOK_SECRET` come primo passo.
