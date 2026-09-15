# 04 - Runbook DEV -> Produzione

Questo runbook e' forward-only. Non modifica la storia delle migrazioni remote e non presume che una function locale sia gia' deployata.

## 1. Prerequisiti

- accesso al progetto Supabase DEV e al progetto di Produzione;
- repository Laravel applicativo disponibile;
- licenza IntelX Search per Standard;
- licenza IntelX Identity/Enterprise per Leaks API Esteso;
- API key separate o autorizzate per i due servizi;
- `User-Agent` concordato con Intelligence X;
- KEK V2 generata e custodita in secret manager;
- backup e restore testato del database;
- tenant interno per canary.

## 2. Variabili attese

### Supabase

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY oppure SUPABASE_PUBLISHABLE_KEY
```

### IntelX

```text
INTELX_SEARCH_API_KEY
INTELX_LEAKS_API_KEY
INTELX_USER_AGENT
```

### Cifratura

```text
DARKRISK_EVIDENCE_KEK_BASE64
DARKRISK_EVIDENCE_KEY_VERSION
```

La KEK deve decodificare esattamente 32 byte. Non riutilizzare la KEK locale di sviluppo in Produzione.

### Feature flag

```text
DARKRISK_ORCHESTRATOR_V2
DARKRISK_IDENTITY_V2
VITE_DARKRISK_ORCHESTRATOR_V2
VITE_DARKRISK_EXTENDED_UI_V2
```

### Secret cron

```text
SURFACESCAN_CRON_INTERNAL_SECRET
```

Il valore deve essere salvato nel Vault/secret runtime coerente con `surface_scan_validate_internal_secret`.

## 3. File locale di handoff

Il file locale e' nella root DEV:

```text
.env.per_stefano
```

Regole:

- permessi `600`;
- coperto da `.gitignore` (`.env*`);
- mai `git add -f`;
- mai allegato a ticket, report o chat;
- trasferimento solo tramite canale segreto approvato;
- le variabili vuote devono essere completate prima del deploy.

## 4. Preflight repository

```bash
git status --short
npm ci
npm run test:deno
npm run check
npm run qa:no-secrets
git diff --check
```

Non includere file sporchi non correlati. Verificare inoltre che non esistano riferimenti runtime a:

```bash
rg -n '4\.intelx\.io|/accounts/1' src supabase/functions
```

I soli match ammessi sono test o documentazione che ne verificano il blocco.

## 5. Gate Laravel obbligatorio

Prima di abilitare la UI V2 devono esistere e superare i contract test:

```text
GET/PUT  /companies/{id}/external-scope
POST     /companies/{id}/darkrisk/runs
POST     /companies/{id}/darkrisk-esteso/runs
GET      /companies/{id}/darkrisk/runs/{runId}
GET      /companies/{id}/darkrisk/overview
GET      /companies/{id}/darkrisk-esteso/runs/{runId}/results
GET      /companies/{id}/darkrisk/reports
```

Il backend deve inoltre implementare:

- `ExternalScopeRegistry` con dual-write transazionale verso SurfaceScan360;
- projector `standard_monthly_report`;
- projector `extended_run_report`;
- decrypt autorizzato di `darkrisk_sensitive_payloads`;
- audit view/download;
- URL firmati brevi per report Esteso.

## 6. Migrazione database DEV

1. creare backup o clone;
2. ispezionare drift locale/remoto;
3. applicare le migrazioni DarkRisk in ordine;
4. controllare tipi, tabelle, funzioni, indici e policy;
5. verificare che i backfill dei grant riflettano i servizi reali;
6. controllare che nessuna organizzazione abbia piu' di quattro target approvati;
7. verificare i job cron creati.

Query diagnostiche senza dati sensibili:

```sql
select capability, source, enabled, count(*)
from darkrisk_capability_grants
group by capability, source, enabled
order by capability, source, enabled;

select status, task_kind, provider, count(*)
from darkrisk_scan_tasks
group by status, task_kind, provider
order by task_kind, status;

select mode, plan_version, status, count(*)
from darkrisk_scan_runs
group by mode, plan_version, status
order by mode, plan_version, status;
```

## 7. Gate URL cron

La migrazione V2 contiene l'URL del progetto DEV nel corpo dei job `pg_cron`. Prima della Produzione e' obbligatorio generare una migrazione forward-only specifica per il project ref PROD.

Non applicare in Produzione il cron con URL DEV. Verificare:

```sql
select jobname, schedule, command
from cron.job
where jobname like 'darkrisk-v2-%';
```

Il comando non deve contenere project ref o hostname DEV.

## 8. Deploy Edge DEV

Ordine consigliato:

1. secret runtime;
2. `darkrisk360-orchestrator-v2`;
3. `darkrisk360-worker-v2`;
4. `surface-scan-cron`;
5. function accessorie modificate;
6. smoke test non autenticato: atteso `401`/`403`, mai `200`;
7. smoke test autenticato sul tenant interno.

## 9. Smoke test Standard

1. configurare uno scope approvato;
2. verificare grant `standard_monitor`;
3. accodare una run con idempotency key unica;
4. ripetere la stessa richiesta e verificare lo stesso `run_id`;
5. attendere il worker;
6. verificare un task per target;
7. verificare che `result_summary` contenga solo conteggio e `at_least`;
8. verificare assenza di record/password nei payload Standard;
9. verificare overview e trend tramite Laravel.

## 10. Smoke test Esteso

Usare esclusivamente asset autorizzati e dati di test controllati.

1. verificare `extended_identity` e `DARKRISK_IDENTITY_V2=true`;
2. avviare con admin/superadmin;
3. verificare `403` per sales/customer;
4. verificare task lines per domini/IP e accounts solo per domini;
5. verificare `source_bucket=leaks.private.general`;
6. verificare audit per record fuori bucket;
7. verificare payload cifrato e nessuna password in record canonico/log/task;
8. verificare report per il solo run;
9. verificare `Cache-Control: no-store` e audit di view/download;
10. verificare che non esista cron Esteso.

## 11. Test purge

Su un tenant di prova:

1. terminare/disabilitare il grant Esteso;
2. simulare il superamento della finestra di 23 ore in ambiente isolato;
3. eseguire `darkrisk_purge_expired_extended_v2` come service role;
4. verificare eliminazione payload, report Esteso e oggetti Storage;
5. verificare che restino soltanto audit aggregati e conteggi non sensibili.

## 12. Rollout

| Fase | Target | Gate |
|---|---:|---|
| 1 | tenant interno | contract, security e report completi |
| 2 | 5% | error rate, code `401/402/429`, queue lag |
| 3 | 25% | riconciliazione conteggi e purge |
| 4 | 100% | approvazione operativa e sicurezza |

Non usare cherry-pick automatico tra `imnick` e `PRODOTTO` se i branch divergono. Fare porting semantico, rieseguire migrazioni e test nel contesto del branch destinazione.

## 13. Rollback

Rollback applicativo, non distruttivo:

```text
DARKRISK_IDENTITY_V2=false
DARKRISK_ORCHESTRATOR_V2=false
VITE_DARKRISK_EXTENDED_UI_V2=false
VITE_DARKRISK_ORCHESTRATOR_V2=false
```

Poi:

- sospendere i job cron V2;
- non cancellare run/task durante l'incidente;
- conservare correlation ID e codici errore sanificati;
- usare il fallback legacy solo per i percorsi esplicitamente supportati;
- riattivare dopo root cause e riconciliazione.

## 14. Incidenti IntelX

| Sintomo | Diagnosi | Azione |
|---|---|---|
| `401` | chiave non valida/scaduta | aprire circuito, ruotare secret |
| `402` | crediti/licenza | sospendere task, contattare provider |
| `429` | rate limit | rispettare `Retry-After`, controllare concorrenza |
| poll timeout | provider lento/job bloccato | terminate best effort e retry |
| record fuori bucket | contratto provider inatteso | scartare, auditare, non mostrare |
| queue ferma | worker/cron/lease | controllare `available_at`, lease e heartbeat |

## 15. Definition of Done produzione

- migrazione PROD forward-only revisionata;
- URL cron PROD verificato;
- Laravel completo e contract test verdi;
- Deno, TypeScript, build e no-secrets verdi;
- RLS testata per superadmin/admin/customer/sales;
- Standard count-only verificato;
- Esteso Private Leaks verificato;
- decrypt, audit, report e purge verificati;
- nessuna secret in Git o log;
- canary e rollout completati.
