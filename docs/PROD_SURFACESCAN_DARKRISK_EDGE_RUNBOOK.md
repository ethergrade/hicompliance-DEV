# SurfaceScan360 + DarkRisk360 — Runbook Produzione (Supabase Edge)

## 1) Obiettivo
Guida interna per portare **SurfaceScan360** e **DarkRisk360** in produzione in modo ripetibile, con:
- deploy Edge Functions Supabase,
- migrazioni DB,
- schedulazioni automatiche,
- smoke test API,
- checklist operativa e rollback.

> Questo documento è operativo per dev/ops interni. Non usare in documentazione cliente.

---

## 2) Prerequisiti

## 2.1 Accessi
- Accesso repo Git (`PRODOTTO`).
- Supabase project collegato (CLI `supabase link`).
- Permessi deploy functions + query DB remoto.

## 2.2 Tooling locale
- Node + npm.
- Supabase CLI.
- Deno (per check locale functions, opzionale).

## 2.3 Variabili/secret minimi (Supabase)
Impostare in Supabase `Project Settings -> Edge Functions Secrets`:

- Core
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`

- SurfaceScan360
  - `SURFACESCAN_CRON_INTERNAL_SECRET`
  - `SURFACESCAN_INTERNAL_SECRET` (fallback)
  - `SURFACESCAN_DEFAULT_SCAN_PROFILE` (consigliato: `domain_exposure`)

- Exposure/validation
  - `PENTEST_TOOLS_API_KEY`
  - `PENTEST_TOOLS_API_BASE` (default: `https://app.pentest-tools.com/api/v2`)

- Threat / enrichment
  - `SHODAN_API_KEY`
  - `GOOGLE_API_KEY` (moduli quality/safe browsing)

- Report
  - `OPENAI_API_KEY`
  - `SURFACESCAN_REPORT_INTERNAL_SECRET` (o `SURFACESCAN_INTERNAL_REPORT_SECRET`)

- DarkRisk360
  - `DARKRISK360_INTERNAL_SECRET`
  - `INTELX_API_KEY`
  - `INTELX_API_URL` (default: `https://2.intelx.io`)
  - `OPENAI_RECOMMENDATION_MODEL` (consigliato: `gpt-4o-mini`)

---

## 3) Database: migrazioni

## 3.1 Strategia
1. Applicare migrazioni additive in ordine cronologico.
2. Verificare RLS e indici.
3. Verificare job cron (`pg_cron`, `pg_net`).

## 3.2 Comandi
- Standard (repo con history coerente):
```bash
supabase db push
```

- Se `db push` fallisce per mismatch storico migrazioni legacy:
  - applicare SQL puntuale con query linked:
```bash
supabase db query --linked -f supabase/migrations/<TIMESTAMP>_<name>.sql
```
  - poi riallineare storico in ambiente controllato con `migration repair`.

## 3.3 Migrazioni da verificare per questi moduli
- SurfaceScan360 schema/guard/report:
  - `20260522160000_surfacescan_schema_compat.sql`
  - `20260523100000_surface_scan_scope_guard_hardening.sql`
  - `20260523193000_surface_exposure_port_tech.sql`
  - `20260523221000_surface_scan_module_results_registry.sql`
  - `20260524235600_surfacescan_exposure_poll_unification.sql`
  - `20260525113000_surface_scan_weekly_cron_refresh.sql`
  - `20260525154500_surface_scan_cve_validation_default_on.sql`

- DarkRisk360:
  - `20260524173000_darkrisk360_entitlements.sql`
  - `20260524190000_darkrisk360_core_schema.sql`
  - `20260524195500_darkrisk360_report_storage.sql`
  - `20260524211500_darkrisk360_security_governance_hardening.sql`
  - `20260524221500_darkrisk360_roadmap_autoprovision.sql`
  - `20260524232000_darkrisk360_qa_snapshot.sql`

- CVE/KEV:
  - `20260522173000_cve_enqueue_freshness_1day.sql`
  - `20260522174500_cve_kev_cron_reschedule.sql`

---

## 4) Edge Functions: mappa operativa

## 4.1 SurfaceScan360 core
- `surfacescan360-start-scan`
  - crea job e mette in coda pipeline.
- `surfacescan360-run-enrichment`
  - esegue enrichment completo su `job_id`.
- `surfacescan360-get-scan-status`
  - stato job e progress.
- `surface-scan-cron`
  - automazioni settimanali full-scope + refresh report repository.
- `surfacescan360-ai-report`
  - genera/aggiorna report canonico (single job o organization scope).

## 4.2 Exposure pipeline
- `ptools-start-exposure-scan`
  - avvia scansione exposure multi-target.
- `ptools-poll-scans`
  - poll stato scansioni esterne + persistenza output.
- `ptools-resync-job`
  - riallineamento job.
- `surface-exposure-summary`
  - KPI consolidati scope.
- `pentest-tools-orchestrator` / `pentest-tools-poll` / `pentest-tools-webhook`
  - orchestrazione e integrazione provider exposure.

## 4.3 DarkRisk360
- `darkrisk360-sync-surfacescan`
  - sincronizza scope/asset da SurfaceScan360 e lancia intelligence pipeline.
- `darkrisk360-overview`
  - aggregati dashboard.
- `darkrisk360-generate-recommendations`
  - raccomandazioni operative strutturate.
- `darkrisk360-generate-report`
  - snapshot report JSON/HTML/PDF.
- `darkrisk360-report-access`
  - signed URL export.
- `darkrisk360-reveal-evidence`
  - reveal controllato con audit (solo ruoli autorizzati).
- `darkrisk360-qa-status`, `darkrisk360-roadmap-status`
  - quality/roadmap diagnostiche.
- `darkrisk360-retention-cleanup`
  - retention e cleanup.

## 4.4 CVE/KEV support
- `cve-enrichment`
- `cisa-kev-sync`

---

## 5) Deploy Edge Functions (produzione)

## 5.1 Deploy selettivo (consigliato)
```bash
supabase functions deploy surfacescan360-start-scan --project-ref <PROJECT_REF>
supabase functions deploy surfacescan360-run-enrichment --project-ref <PROJECT_REF>
supabase functions deploy surfacescan360-get-scan-status --project-ref <PROJECT_REF>
supabase functions deploy surface-scan-cron --project-ref <PROJECT_REF>
supabase functions deploy surfacescan360-ai-report --project-ref <PROJECT_REF>

supabase functions deploy ptools-start-exposure-scan --project-ref <PROJECT_REF>
supabase functions deploy ptools-poll-scans --project-ref <PROJECT_REF>
supabase functions deploy ptools-resync-job --project-ref <PROJECT_REF>
supabase functions deploy surface-exposure-summary --project-ref <PROJECT_REF>

supabase functions deploy darkrisk360-sync-surfacescan --project-ref <PROJECT_REF>
supabase functions deploy darkrisk360-overview --project-ref <PROJECT_REF>
supabase functions deploy darkrisk360-generate-recommendations --project-ref <PROJECT_REF>
supabase functions deploy darkrisk360-generate-report --project-ref <PROJECT_REF>
supabase functions deploy darkrisk360-report-access --project-ref <PROJECT_REF>
supabase functions deploy darkrisk360-reveal-evidence --project-ref <PROJECT_REF>
supabase functions deploy darkrisk360-qa-status --project-ref <PROJECT_REF>
supabase functions deploy darkrisk360-roadmap-status --project-ref <PROJECT_REF>
supabase functions deploy darkrisk360-retention-cleanup --project-ref <PROJECT_REF>

supabase functions deploy cve-enrichment --project-ref <PROJECT_REF>
supabase functions deploy cisa-kev-sync --project-ref <PROJECT_REF>
```

## 5.2 Deploy rapido full set
```bash
supabase functions deploy --project-ref <PROJECT_REF>
```

---

## 6) Chiamate Edge (contratti minimi)

## 6.1 Start scan SurfaceScan360
Endpoint: `POST /functions/v1/surfacescan360-start-scan`

Body esempio:
```json
{
  "target": "panapesca.it",
  "customer_id": "<ORG_UUID>",
  "scan_profile": "domain_exposure",
  "authorization_confirmed": true,
  "ownership_proof": "scope_authorization",
  "force_refresh": false
}
```

Note:
- hard scope guard attivo: target fuori scope => 400 con `code` semantico.
- `cve_api_validation` resta admin-only.

## 6.2 Run enrichment manuale
Endpoint: `POST /functions/v1/surfacescan360-run-enrichment`

```json
{
  "job_id": "<JOB_UUID>",
  "force": false
}
```

## 6.3 Start exposure scan (admin/internal)
Endpoint: `POST /functions/v1/ptools-start-exposure-scan`

```json
{
  "tenant_id": "<ORG_UUID>",
  "customer_id": "<ORG_UUID>",
  "scan_name": "Exposure Full Scan",
  "root_domains": ["panapesca.it", "panapesca.eu"],
  "public_ips": ["93.144.77.39"],
  "include_subdomain_discovery": true,
  "include_port_scan": true,
  "include_web_technology_detection": true,
  "include_ssl_scan": true,
  "include_network_vuln_scan": true,
  "scan_depth": "deep",
  "protocol": "tcp",
  "check_alive": true,
  "detect_service_version": true,
  "detect_os": true,
  "traceroute": false
}
```

## 6.4 Poll exposure scans
Endpoint: `POST /functions/v1/ptools-poll-scans`

Body opzionale:
```json
{ "max_tasks": 80 }
```

## 6.5 Report SurfaceScan360 (repository)
Endpoint: `POST /functions/v1/surfacescan360-ai-report`

Organization-scope canonico:
```json
{
  "organization_id": "<ORG_UUID>",
  "scope_mode": "organization_scope",
  "trigger_source": "manual",
  "force_regenerate": true
}
```

## 6.6 Sync DarkRisk360 da scope Surface
Endpoint: `POST /functions/v1/darkrisk360-sync-surfacescan`

Body minimo:
```json
{
  "customer_id": "<ORG_UUID>",
  "triggered_by": "manual"
}
```

## 6.7 Overview DarkRisk360
Endpoint: `POST /functions/v1/darkrisk360-overview`

```json
{
  "customer_id": "<ORG_UUID>"
}
```

## 6.8 Report DarkRisk360
Endpoint: `POST /functions/v1/darkrisk360-generate-report`

```json
{
  "customer_id": "<ORG_UUID>",
  "classification": "confidential",
  "triggered_by": "manual"
}
```

## 6.9 Accesso export report DarkRisk360
Endpoint: `POST /functions/v1/darkrisk360-report-access`

```json
{
  "customer_id": "<ORG_UUID>",
  "report_id": "<REPORT_UUID>",
  "format": "pdf",
  "expires_in": 900,
  "reason": "manual_report_export"
}
```

---

## 7) Automazioni e scheduler

## 7.1 SurfaceScan360 weekly
- Cron SQL già previsto in migrazione `20260525113000_surface_scan_weekly_cron_refresh.sql`.
- Frequenza: lunedì 04:00 (DB timezone).
- Azioni cron:
  1. valida scope,
  2. avvia exposure full-scope,
  3. rigenera report canonico organization-scope.

## 7.2 CVE/KEV
- Tenere attivi job periodici:
  - queue drain CVE enrichment,
  - sync catalogo KEV giornaliero.

## 7.3 DarkRisk360 retention
- Schedulare `darkrisk360-retention-cleanup` (giornaliero/notturno).

---

## 8) Flusso standard cliente (produzione)

## 8.1 Abilitazione moduli
In `organizations`:
- `surface_scan360_enabled = true`
- `dark_risk360_enabled = true` (se richiesto)
- `pentest_tools_auto_validation = true` (default obbligatorio)

## 8.2 Onboarding scope
- inserire regole in `surface_scan_monitored_ips`:
  - domini,
  - IP singoli,
  - range,
  - CIDR.

## 8.3 Esecuzione automatica
- allineamento scope -> queue scansioni.
- weekly refresh automatico su tutto lo scope.

## 8.4 Reporting
- SurfaceScan360: 1 report repository canonico organization-scope, aggiornato.
- DarkRisk360: snapshot report con export signed URL.

---

## 9) Smoke test post-deploy (obbligatorio)

## 9.1 Surface start + status
1. Start scan `domain_exposure` su dominio in scope.
2. Verificare `surface_scan_jobs.status` da `queued` -> `running` -> `completed/partial`.
3. Verificare scrittura in:
   - `surface_assets`
   - `surface_findings`
   - `surface_observations`
   - `surface_scan_module_results`.

## 9.2 Exposure
1. Start exposure scan full-scope.
2. Eseguire `ptools-poll-scans` fino a completion.
3. Verificare dati:
   - `surface_open_ports`
   - `surface_web_technologies`
   - `surface_ssl_results`
   - `surface_exposure_findings`.

## 9.3 DarkRisk360
1. `darkrisk360-sync-surfacescan`.
2. Verificare overview + findings + coverage controls.
3. `darkrisk360-generate-recommendations` e `darkrisk360-generate-report`.

## 9.4 Report
- SurfaceScan360 report: nessun placeholder generico, evidenze tecniche valorizzate.
- Report repository aggiornato con nuovo timestamp.
- PDF non deve includere screenshot raw.

---

## 10) Monitoraggio e audit

Tabelle audit principali:
- `surface_scan_audit_log`
- `external_scan_audit_log`
- `darkrisk_audit_log`

Controlli giornalieri:
- job bloccati > 30 min,
- poll retry loop anomali,
- growth anomalo findings,
- errori `401/403/429/5xx` Edge.

---

## 11) Sicurezza operativa

- API key solo in secrets Edge, mai nel frontend.
- Scope guard hard-enforced in start-scan.
- Reveal evidence solo su tier/ruolo autorizzato + audit.
- Mascheramento segreti e dati sensibili in payload/report.
- Non mostrare nomi provider tecnici nelle narrative cliente-facing.

---

## 12) Rollback

In caso regressione:
1. Redeploy versione precedente funzioni critiche:
   - `surfacescan360-start-scan`
   - `surfacescan360-run-enrichment`
   - `ptools-poll-scans`
   - `darkrisk360-sync-surfacescan`
2. Disabilitare temporaneamente cron settimanale (`cron.unschedule`).
3. Bloccare trigger automatici run da UI admin.
4. Ripristinare report da ultimo snapshot valido in repository/storage.

---

## 13) Checklist go-live

- [ ] Secrets completi impostati in Supabase.
- [ ] Migrazioni applicate e verificate.
- [ ] Edge deployate (Surface + Exposure + DarkRisk + CVE/KEV).
- [ ] Cron weekly + cve/kev + retention attivi.
- [ ] Smoke test su cliente test (scope multi-dominio/IP) superato.
- [ ] Report SurfaceScan360 e DarkRisk360 generati correttamente.
- [ ] Audit log valorizzati e senza errori critici.

