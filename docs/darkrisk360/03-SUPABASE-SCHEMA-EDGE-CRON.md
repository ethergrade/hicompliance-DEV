# 03 - Supabase, schema, Edge Functions e cron

## 1. Strategia di migrazione

DarkRisk360 usa migrazioni additive. La V2 convive temporaneamente con il modello legacy per consentire dual-read e rollback tramite feature flag.

Migrazione V2 principale:

```text
supabase/migrations/20260628195813_darkrisk360_orchestrator_v2.sql
```

Dipende dalle migrazioni DarkRisk precedenti che introducono entitlement, schema core, storage, governance, QA e deduplicazione.

## 2. Modello dati core

| Tabella | Responsabilita' |
|---|---|
| `darkrisk_entitlements` | tier e opzioni legacy |
| `darkrisk_assets` | asset normalizzati |
| `darkrisk_selectors` | selector tecnici legacy/canonici |
| `darkrisk_scan_runs` | ciclo di vita della scansione |
| `darkrisk_source_records` | record provider canonici |
| `darkrisk_evidence` | evidenze presentabili e metadati |
| `darkrisk_findings` | finding, score e remediation state |
| `darkrisk_recommendations` | raccomandazioni grounded |
| `darkrisk_alerts` | notifiche operative |
| `darkrisk_report_snapshots` | snapshot report e path Storage |
| `darkrisk_audit_log` | audit non sensibile |
| `darkrisk_raw_evidence_refs` | riferimenti a evidenze private legacy |
| `darkrisk_source_config` | configurazione sorgenti non segreta |

## 3. Estensioni V2

| Tabella / vista | Responsabilita' |
|---|---|
| `darkrisk_capability_grants` | capability e sorgente commerciale |
| `darkrisk_external_scope` | scope unico dominio/IP |
| `darkrisk_scan_tasks` | queue persistente con retry e lease |
| `darkrisk_provider_leases` | serializzazione per provider |
| `darkrisk_source_record_occurrences` | record canonico osservato in una run |
| `darkrisk_sensitive_payloads` | payload Esteso cifrato |
| `darkrisk_standard_overview_v2` | projection Standard count-only |

`darkrisk_scan_runs` viene estesa con:

```text
mode
plan_version
idempotency_key
scope_snapshot
period_key
heartbeat_at
```

`darkrisk_report_snapshots` viene estesa con:

```text
report_kind
period_key
report_version
```

## 4. Stati e transizioni

### Run

Gli enum core usano:

```text
queued -> running -> completed
                    completed_with_warnings
                    failed
                    cancelled
```

Il frontend normalizza `completed_with_warnings` come stato utilizzabile e accetta anche `partial` dal contratto Laravel.

### Task V2

```text
queued -> running -> completed
             |----> queued   (retry/defer)
             |----> failed
             |----> cancelled
```

Campi operativi:

- `attempt_count`, `max_attempts`;
- `available_at`;
- `lease_owner`, `lease_expires_at`;
- `heartbeat_at`;
- `last_error_code`, `last_error_message`;
- `payload` privo di credenziali;
- `result_summary` privo di password.

## 5. Tipi task

| `task_kind` | Provider | Creato per |
|---|---|---|
| `standard_search` | `intelx_search` | ogni target Standard |
| `extended_lines` | `intelx_leaks` | ogni dominio/IP Esteso |
| `extended_accounts` | `intelx_leaks` | ogni dominio Esteso |
| `standard_monthly_report` | `report` | organizzazione e mese |
| `extended_run_report` | `report` | singola run Esteso |

Il worker provider V2 consuma solo i primi tre tipi. I task `report` devono essere consumati dal projector Laravel/report worker.

## 6. Funzioni SQL V2

| Funzione | Scopo |
|---|---|
| `darkrisk_normalize_external_scope_v2` | normalizzazione, validazione e limite scope |
| `darkrisk_sync_capability_grants_v2` | grant Standard da organizzazione |
| `darkrisk_sync_extended_grant_v2` | grant Standard+Esteso dal tier extended |
| `darkrisk_claim_scan_tasks_v2` | claim atomico `SKIP LOCKED` |
| `darkrisk_acquire_provider_lease_v2` | lease esclusivo provider |
| `darkrisk_release_provider_lease_v2` | rilascio lease |
| `darkrisk_purge_expired_extended_v2` | purge post-contratto |

Le funzioni di claim, lease e purge sono revocate ad `anon` e `authenticated` e concesse soltanto a `service_role`.

## 7. Edge Functions

### Runtime V2

| Function | Ruolo |
|---|---|
| `darkrisk360-orchestrator-v2` | valida ruolo/grant/scope, crea run e task |
| `darkrisk360-worker-v2` | claim, chiamate IntelX e ingestion |
| `surface-scan-cron` | tick DST-safe e accodamento Standard/report |

### Runtime applicativo/legacy ancora presente

| Function | Ruolo |
|---|---|
| `darkrisk360-overview` | aggregazione storica SurfaceScan/DarkRisk |
| `darkrisk360-sync-surfacescan` | sincronizzazione legacy |
| `darkrisk360-generate-report` | generazione snapshot report |
| `darkrisk-dti-esteso-report` | report DTI Esteso legacy |
| `darkrisk360-generate-recommendations` | raccomandazioni |
| `darkrisk360-report-access` | URL firmati e audit report |
| `darkrisk360-reveal-evidence` | reveal Storage legacy auditato |
| `darkrisk360-retention-cleanup` | cleanup retention legacy |
| `darkrisk360-qa-status` | controlli QA |
| `darkrisk360-roadmap-status` | stato implementativo legacy |

La presenza di una function nel manifest non prova che sia deployata nell'ambiente remoto. Il deploy deve essere verificato esplicitamente.

## 8. Autenticazione Edge

Le function DarkRisk hanno `verify_jwt = false` nel manifest per gestire internamente i diversi chiamanti. Questo non significa accesso anonimo: ogni handler deve validare una delle seguenti forme ammesse.

- JWT utente + verifica profilo/ruolo/organizzazione;
- bearer `service_role` per chiamate server-to-server;
- secret interno validato, quando previsto dal job cron.

Gli endpoint sensibili aggiungono `Cache-Control: no-store`.

## 9. Scheduling V2

| Job | Cron UTC | Azione |
|---|---|---|
| `darkrisk-v2-dst-scheduler-hourly` | `0 * * * *` | chiama il tick Europe/Rome |
| `darkrisk-v2-provider-worker` | `*/2 * * * *` | consuma fino a 5 task provider |
| `darkrisk-v2-retention-hourly` | `15 * * * *` | purge grant Esteso scaduti |

Il tick orario valuta `Europe/Rome`:

- lunedi' alle 02:00: run Standard con periodo ISO week;
- giorno 1 alle 03:00: report Standard del mese precedente.

L'idempotency key impedisce doppie run quando il cron viene ritentato o durante transizioni DST.

## 10. Nessun cron Esteso

La migrazione rimuove job il cui nome DarkRisk contiene `esteso`, `extended`, `identity` o `dti`. Esteso viene accodato soltanto da un'azione autorizzata.

## 11. Indici e invarianti

- grant unico per organizzazione, capability e sorgente;
- scope unico per organizzazione, tipo e valore;
- run idempotente per organizzazione e chiave;
- task unico per run, kind e target;
- occurrence unica per run, record e target;
- payload sensibile unico per record canonico;
- report Standard V2 unico per organizzazione/periodo;
- report Esteso V2 unico per run.

## 12. RLS

In sintesi:

- tenant autenticato: lettura delle righe della propria organizzazione;
- admin organizzazione: gestione scope, non grant commerciali;
- superadmin: gestione grant e scope;
- `service_role`: task, occurrence, payload, lease e funzioni operative;
- `darkrisk_sensitive_payloads` e `darkrisk_provider_leases`: nessun accesso Data API ad authenticated/anon.

Le policy dettagliate sono nella migrazione e devono essere verificate con test di ruolo prima del rollout.

## 13. Storage

| Bucket | Contenuto | Accesso |
|---|---|---|
| `darkrisk-reports` | HTML/JSON/PDF report | URL firmato e audit |
| `darkrisk-evidence-private` | raw evidence legacy | accesso ristretto e audit |

I payload V2 IntelX sono invece cifrati in `darkrisk_sensitive_payloads` e richiedono un percorso decrypt applicativo dedicato.
