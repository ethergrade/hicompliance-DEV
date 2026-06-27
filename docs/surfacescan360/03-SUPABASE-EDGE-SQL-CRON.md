# 03 - Supabase Edge, SQL e cron

## Manifest Edge canonico

| Edge Function | Contratto principale | Auth applicativa |
|---|---|---|
| `surfacescan360-start-scan` | crea job nello scope autorizzato | JWT utente/internal |
| `surfacescan360-run-enrichment` | esegue i moduli di un job | internal/service |
| `surfacescan360-get-scan-status` | stato e progress job | JWT con accesso org |
| `surface-scan-cron` | weekly, dispatch e report refresh | secret internal/service |
| `connectsecure-scan` | auth, scan, poll e ingest ASM | JWT/internal/service |
| `surface-exposure-summary` | KPI latest-per-target, finding unificati e Score V3 | JWT con accesso org |
| `subdomain-dump` | discovery e persistenza sottodomini | JWT/internal |
| `shodan-scan` | enrichment rete pubblica | internal/service |
| `cve-enrichment` | fingerprint, CPE, NVD e EPSS | internal/service |
| `cisa-kev-sync` | refresh catalogo KEV | internal/cron |
| `surfacescan360-ai-report` | report canonico org/single job | JWT/internal/service |
| `surfacescan360-monthly-report` | aggregato mensile | JWT admin/internal/service |

`verify_jwt=false` in `supabase/config.toml` e' intenzionale per queste Edge: l'autorizzazione viene applicata nel corpo per supportare sia JWT utente sia chiamate `pg_net` con secret interno. Ogni funzione deve restare default-deny.

## Tabelle canoniche

### Orchestrazione

- `surface_scan_jobs`: stato job, target, profilo, retry e scheduling.
- `surface_scan_module_results`: esito di ciascun modulo.
- `surface_scan_audit_log`: eventi operativi.
- `surface_scan_history`: snapshot periodici per trend mensile.

### Risultati

- `surface_assets`: domini, sottodomini, IP e relazioni.
- `surface_open_ports`: porte, protocollo e fingerprint.
- `surface_web_technologies`: tecnologie reali rilevate sul target.
- `surface_ssl_results`: evidenze TLS.
- `surface_observations`: risultati strutturati non necessariamente vulnerabili.
- `surface_findings`: finding normalizzati e workflow stato.
- `surface_exposure_findings`: finding specifici exposure.

### Intelligence

- `surface_service_fingerprint_queue`: coda fingerprint servizi.
- `surface_service_vulnerability_matches`: relazione servizio/CPE/CVE.
- `cve_enrichment_queue`: coda CVE.
- `cve_intel_cache`: CVSS, EPSS, KEV, CWE e riferimenti.
- `cisa_kev_catalog`: catalogo CISA locale.

### ConnectSecure

- `connectsecure_config`: override per organizzazione; token non esposto alla Data API.
- `connectsecure_domain_registry`: mapping org + dominio -> id ASM e profondita'.
- `connectsecure_sensitive_data`: evidenze sensibili, service-role only.

### Report

- `surface_scan_ai_reports`: report scan canonici.
- `surface_scan_monthly_reports`: aggregati mensili.

## RLS e grant

Tutte le tabelle in `public` devono avere RLS abilitata. RLS e grant sono livelli distinti:

1. `GRANT` espone operazioni al ruolo Data API.
2. Le policy RLS limitano le righe dell'organizzazione.
3. `service_role` opera solo nelle Edge e non deve raggiungere il browser.

La migrazione `*_surfacescan_portability_schema.sql` applica grant espliciti, coerenti con il cambiamento Supabase 2026 che non espone automaticamente le nuove tabelle alla Data/GraphQL API.

## Cron effettivi

| Job | Schedule UTC | Payload |
|---|---|---|
| `connectsecure-result-poller` | `* * * * *` | `poll_pending`, max 5 job |
| `surfacescan-subdomain-queue-dispatch` | `*/2 * * * *` | `dispatch_only=true` |
| `surface-scan-weekly-monday` | `0 0 * * 1` | weekly scope + report |
| `cve-enrichment-drain-30s` | ogni minuto + `pg_sleep(30)` | 1 item per chiamata, due chiamate/min |
| `cisa-kev-sync-daily` | `0 3 * * *` | refresh KEV |

I cron SurfaceScan leggono `surface_scan_cron_internal_secret` da Supabase Vault. Il valore Vault deve corrispondere al secret Edge `SURFACE_SCAN_CRON_INTERNAL_SECRET`.

## Migrazioni chiave

Applicare l'intera history in ordine. Per audit operativo, verificare almeno:

- `20260523193000_surface_exposure_port_tech.sql`
- `20260523221000_surface_scan_module_results_registry.sql`
- `20260522174500_cve_kev_cron_reschedule.sql`
- `20260626212520_connectsecure_persistent_orchestrator.sql`
- `20260626213201_surface_scan_cron_vault_auth.sql`
- `20260626214257_connectsecure_poller_batch_tuning.sql`
- `*_surfacescan_portability_schema.sql`
- `*_surfacescan_portability_grants_hardening.sql`
- `*_surfacescan_portability_index_dedupe.sql`
- `*_surfacescan_portability_foreign_keys.sql`

Le tre migrazioni di hardening gestiscono il drift del progetto DEV, dove le tabelle erano state create manualmente prima di entrare nella history Git. Restano idempotenti su un ambiente pulito.

## Query diagnostiche

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 20;

select jobname, schedule, active
from cron.job
where jobname in (
  'connectsecure-result-poller',
  'surfacescan-subdomain-queue-dispatch',
  'surface-scan-weekly-monday',
  'cve-enrichment-drain-30s',
  'cisa-kev-sync-daily'
)
order by jobname;

select status, count(*)
from public.surface_scan_jobs
group by status
order by status;

select organization_id, status, count(*)
from public.surface_scan_jobs
where scan_type = 'subdomain_enrichment'
group by organization_id, status;
```
