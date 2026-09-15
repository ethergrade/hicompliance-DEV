# 05 - Data dictionary

## 1. Entitlement e scope

### `darkrisk_capability_grants`

| Campo | Tipo logico | Uso |
|---|---|---|
| `organization_id` | UUID | tenant proprietario |
| `capability` | enum | `standard_monitor`, `extended_identity` |
| `source` | enum | `hicompliance`, `standalone_standard`, `extended_bundle` |
| `enabled` | boolean | grant attivo/disattivo |
| `starts_at`, `ends_at` | timestamptz | finestra contrattuale |
| `metadata` | JSONB | metadati non sensibili |

Chiave logica: organizzazione + capability + source.

### `darkrisk_external_scope`

| Campo | Tipo logico | Uso |
|---|---|---|
| `organization_id` | UUID | tenant proprietario |
| `target_type` | enum | `domain`, `ip` |
| `value` | text | valore normalizzato esposto all'applicazione |
| `normalized_value` | text | chiave canonica |
| `active` | boolean | target in uso |
| `authorization_status` | text | `approved`, `candidate`, `revoked` |
| `source` | text | origine del target |
| `created_by` | UUID | attore che lo ha registrato |
| `metadata` | JSONB | metadati non sensibili |

Chiave logica: organizzazione + tipo + valore normalizzato.

## 2. Run e task

### `darkrisk_scan_runs`

| Campo | Uso |
|---|---|
| `id` | identificativo run |
| `organization_id` | tenant |
| `tier` | compatibilita' legacy Standard/Extended |
| `mode` | modalita' V2 `standard`/`extended` |
| `status` | stato run |
| `trigger_type` | manuale, cron settimanale o report mensile |
| `requested_by` | attore richiedente |
| `sources` | sorgenti pianificate, mai credenziali |
| `stats`, `warnings` | aggregati non sensibili |
| `plan_version` | `2.0` per V2 |
| `idempotency_key` | chiave di dedupe richiesta |
| `scope_snapshot` | copia immutabile dei target della run |
| `period_key` | `YYYY-Wnn` o `YYYY-MM` |
| `heartbeat_at` | vitalita' processo |
| `started_at`, `completed_at` | tempi esecuzione |

### `darkrisk_scan_tasks`

| Campo | Uso |
|---|---|
| `scan_run_id` | run padre |
| `scope_target_id` | target, nullo per report |
| `task_kind` | tipo lavoro |
| `provider` | `intelx_search`, `intelx_leaks`, `report` |
| `status` | queue state |
| `attempt_count`, `max_attempts` | retry budget |
| `available_at` | prossima disponibilita' |
| `lease_owner`, `lease_expires_at` | ownership worker |
| `heartbeat_at` | vitalita' task |
| `last_error_code` | codice sanificato |
| `last_error_message` | messaggio generico |
| `payload` | selector/tipo target, mai API key/password |
| `result_summary` | conteggi e indicatori aggregati |

## 3. Record e occurrence

### `darkrisk_source_records`

Record provider canonico e non sensibile.

| Campo | Uso |
|---|---|
| `source` | sorgente canonica, per V2 `intelx` |
| `source_record_key` | fingerprint deterministica |
| `source_system_id` | ID provider quando disponibile |
| `source_bucket` | per Esteso sempre `leaks.private.general` |
| `source_type` | `extended_lines` o `extended_accounts` |
| `source_date` | data dichiarata dalla fonte |
| `raw_metadata` | solo metadati safe, incluso `encrypted=true` |
| `safe_preview` | nullo nel percorso V2 Esteso |
| `preview_hash` | fingerprint, non contenuto raw |

La migrazione di dedupe rende il record riutilizzabile tra run; il codice gestisce il conflitto unique recuperando l'esistente.

### `darkrisk_source_record_occurrences`

| Campo | Uso |
|---|---|
| `scan_run_id` | run in cui il record e' ricomparso |
| `task_id` | task che lo ha osservato |
| `source_record_id` | record canonico |
| `scope_target_id` | target associato |
| `match_type` | `direct`, `correlated_from_ip` |
| `observed_at` | tempo osservazione |

Chiave logica: run + record + target.

## 4. Payload sensibili

### `darkrisk_sensitive_payloads`

| Campo | Classificazione | Uso |
|---|---|---|
| `source_record_id` | riferimento | record canonico |
| `algorithm` | tecnico | identificatore schema cifratura |
| `key_version` | segreto operativo indiretto | versione KEK, non la chiave |
| `encrypted_dek` | sensibile cifrato | DEK cifrata |
| `dek_iv` | tecnico | IV wrapping DEK |
| `ciphertext` | sensibile cifrato | record IntelX completo |
| `payload_iv` | tecnico | IV payload |
| `sha256` | impronta | integrita'/dedupe, non preview |
| `retention_until` | governance | data purge eventuale |

La tabella non e' leggibile da `anon` o `authenticated`.

## 5. Evidenze, finding e alert legacy/canonici

| Entita' | Scopo | Dati sensibili ammessi |
|---|---|---|
| `darkrisk_evidence` | evidenza normalizzata/presentabile | solo mascherati secondo visibility |
| `darkrisk_findings` | rischio operativo | no password |
| `darkrisk_recommendations` | azioni grounded | no payload raw |
| `darkrisk_alerts` | notifica | no password |
| `darkrisk_raw_evidence_refs` | riferimento Storage legacy | path privato, non contenuto |

### Stati finding

```text
new
triaged
validated
false_positive
accepted_risk
remediation_in_progress
resolved
suppressed
```

### Severity

```text
info
low
medium
high
critical
```

### Confidence

```text
low
medium
high
```

## 6. Report

### `darkrisk_report_snapshots`

| Campo | Uso |
|---|---|
| `organization_id` | tenant |
| `scan_run_id` | obbligatorio logicamente per report Esteso |
| `tier` | compatibilita' legacy |
| `report_kind` | `standard_monthly`, `extended_run` |
| `period_key` | mese Standard |
| `report_version` | `2.0` per i projector V2 |
| `classification` | tipicamente `confidential` |
| `report_json` | snapshot strutturato |
| `html_storage_path` | oggetto HTML |
| `json_storage_path` | oggetto JSON, aggiunto da migrazioni governance |
| `pdf_storage_path` | oggetto PDF |
| `status` | draft/ready/failed secondo projector |

Unicita' V2:

- Standard: organizzazione + periodo;
- Esteso: scan run.

## 7. Audit

### `darkrisk_audit_log`

Campi principali:

```text
organization_id
actor_id
action
entity_type
entity_id
reason
ip_address
user_agent
metadata
created_at
```

Non devono entrare in `metadata`:

- password;
- API key;
- cookie o token;
- payload IntelX;
- URL firmati completi;
- selector non necessari all'evento.

Azioni V2 rilevanti:

```text
darkrisk_identity_ip_fallback_v2
darkrisk_identity_out_of_bucket_dropped_v2
darkrisk_extended_contract_purged_v2
```

## 8. Projection Standard

La vista `darkrisk_standard_overview_v2` espone:

```text
run_id
organization_id
period_key
status
trigger_type
created_at
completed_at
total_count
at_least
completed_targets
total_targets
```

Non espone record provider, account o payload.

## 9. Mapping sorgente -> persistenza -> UI

| Informazione | Persistenza | UI Standard | UI Esteso |
|---|---|---|---|
| Scope | `darkrisk_external_scope` | Si' | Si' |
| Conteggio Search | task `result_summary` / vista | Si' | Non primario |
| Flag limite | `at_least` | `Almeno N` | `capped` operativo |
| Riga leak | record + payload cifrato | No | Si', dopo decrypt autorizzato |
| Account/password | payload cifrato | Mai | Si' |
| Bucket | record/task | No provider raw | sempre Private Leaks |
| Match IP | occurrence | aggregato | badge correlato |
| Report | snapshot + Storage | mensile | per run |
| Audit | audit log | invisibile cliente | obbligatorio per accessi |

## 10. Dati che non devono essere persistiti in chiaro

- password;
- righe complete IntelX;
- token e cookie;
- API key;
- chiave KEK o DEK;
- URL firmati;
- risposte di errore provider contenenti payload.

