# DarkRisk360 V2 - architettura, orchestrazione e contratto IntelX

## Decisioni di prodotto

- `standard_monitor` e `extended_identity` sono capability separate.
- HiCompliance concede `standard_monitor`; uno standalone Standard usa `standalone_standard`.
- Il bundle Esteso concede sia `extended_identity` sia `standard_monitor`.
- Lo scope canonico contiene al massimo quattro target attivi e approvati, esclusivamente domini bare o IP pubblici. Email, URL, CIDR, range e domini con prefisso `@` sono rifiutati.
- Standard e SurfaceScan ricevono gli stessi valori normalizzati. Esteso usa gli stessi target autorizzati.
- Standard è settimanale e count-only. Esteso è spot, avviabile da admin/superadmin, e produce un report per run.

## Contratto IntelX derivato

Questa specifica deriva dai manuali locali `Search API v5`, `Leaks API v5` e `Search Tips`. I PDF originali non fanno parte del repository.

### Search API - Standard

- Base URL obbligatorio: `https://2.intelx.io`.
- API key esclusivamente nell'header `x-key`; `User-Agent` applicativo obbligatorio.
- Submit: `POST /intelligent/search` con `term` bare, `buckets: []`, `lookuplevel: 0`, `maxresults: 1000`, `timeout: 0`, `sort: 2`, `media: 0`.
- Polling: `GET /intelligent/search/result?id={id}&limit={limit}`.
- Stato `0`: consumare i record e continuare; `1`: consumare gli eventuali record finali e terminare; `2`: ID non trovato; `3`: nessun risultato ancora, continuare.
- Se `softselectorwarning=true`, la run è non affidabile e deve fallire come validazione selector.
- Terminare i job non più necessari con `GET /intelligent/search/terminate?id={id}`.
- Dedupe primario su `systemid`, fallback SHA-256 deterministico.
- Un risultato che raggiunge il limite viene presentato come `almeno N`, mai come totale esatto.

### Leaks API - Esteso

- Base URL programmatico obbligatorio: `https://3.intelx.io`.
- `https://4.intelx.io` è vietato al runtime: è riservato alla UI Identity e il suo uso automatizzato può sospendere l'account.
- API key esclusivamente nell'header `x-key`.
- Righe: `GET /live/search/internal?selector={bare}&limit=1000&bucket=leaks.private.general&skipinvalid=true&analyze=false`.
- Account/password: `GET /accounts/csv` con lo stesso selector, limite e bucket.
- `/accounts/1` non deve essere usato: il manuale avverte che il percorso sincrono può perdere risultati.
- Polling condiviso: `GET /live/search/result?id={id}&format=1`.
- Stato `0`: consumare e continuare; `1`: nessun risultato momentaneo, continuare; `2`: consumare gli eventuali record finali e terminare; `3`: ID non trovato.
- Terminazione: `GET /live/search/terminate?id={id}`, con risposta attesa `204`.
- Ogni record viene filtrato nuovamente lato applicazione: solo `leaks.private.general` è accettato.
- Il limite è applicato anche client-side, perché il provider può restituire più record del richiesto.
- Le password appartengono solo al flusso Esteso e non possono entrare in log, task payload, overview Standard o cache persistenti.

### Selector IP per Esteso

Il manuale garantisce il caso dominio/email; l'uso IP è osservato nella Identity UI ma non è formalizzato allo stesso livello. La V2:

1. tenta l'IP bare soltanto su `/live/search/internal`;
2. non usa `/accounts/csv` per IP;
3. se IntelX rifiuta l'IP, usa esclusivamente domini già approvati nello scope o sottodomini della root approvata;
4. marca le evidenze indirette `correlated_from_ip`;
5. lascia gli altri domini come candidate da approvare, evitando espansioni automatiche da shared hosting.

## Schema e data flow

- `darkrisk_capability_grants`: grant per capability e sorgente, con intervallo di validità.
- `darkrisk_external_scope`: registro normalizzato, deduplicato e protetto da limite transazionale a quattro target.
- `darkrisk_scan_runs`: piano immutabile V2 tramite `mode`, `plan_version`, `idempotency_key`, `scope_snapshot`, `period_key` e heartbeat.
- `darkrisk_scan_tasks`: unità persistenti con retry, lease, heartbeat e payload privo di credenziali.
- `darkrisk_source_record_occurrences`: collega un record canonico a più run senza riscriverne la provenienza.
- `darkrisk_report_snapshots`: unicità V2 per organizzazione/mese nello Standard e per run nell'Esteso.
- `darkrisk_standard_overview_v2`: projection `security_invoker` count-only per overview/trend Laravel (`run_id`, periodo, totale, `at_least`, target completati), senza payload o record IntelX.

L'orchestratore `darkrisk360-orchestrator-v2` valida ruolo, capability e scope, crea una run idempotente e accoda:

- un task `standard_search` per target Standard;
- un task `extended_lines` per ogni dominio/IP Esteso;
- un task `extended_accounts` solo per i domini;
- un task `extended_run_report` per run Esteso;
- un task `standard_monthly_report` per organizzazione e mese.

I provider worker devono acquisire task con `darkrisk_claim_scan_tasks_v2`, che usa `FOR UPDATE SKIP LOCKED` e lease. La chiave IntelX resta sempre un secret runtime e non viene serializzata nel database.

`ExternalScopeRegistry` nel backend Laravel è l'unico writer pubblico dello scope. Il `PUT /companies/{id}/external-scope` deve eseguire in una sola transazione logica: validazione/deduplica, replace dei target in `darkrisk_external_scope` e dual-write delle sole righe approved/active in `surface_scan_monitored_ips` (`domain` per domini, `single` per IP, `discovered_via=darkrisk_external_scope_v2`). Una revoca/disattivazione rimuove esclusivamente le righe SurfaceScan con questa provenienza; le regole manuali o scoperte da altri motori non vengono toccate. Finché Laravel non è disponibile, non è consentito modificare lo scope V2 via Data API: un trigger DB non viene introdotto perché la tabella legacy SurfaceScan ha shape divergenti tra ambienti e richiede normalizzazione applicativa.

`darkrisk360-worker-v2` consuma esclusivamente task provider, serializza le operazioni per chiave tramite lease globale e usa gli adapter IntelX condivisi. Standard persiste soltanto conteggio e flag `at_least`; Esteso salva record canonici privi di segreti e cifra il payload completo con DEK casuale per record, a sua volta cifrata dalla KEK runtime. I task report non vengono claimati dal provider worker: il projector Laravel/report worker li consuma dopo lo sblocco a fine ingestion.

## Autorizzazione e sicurezza

- Tenant autenticati: lettura dei record della propria organizzazione.
- Admin organizzazione e superadmin: gestione grant/scope e avvio run.
- Sales e customer non possono avviare run Esteso.
- Scrittura task/occurrence e claim: solo `service_role`.
- Le policy usano `TO authenticated` più predicato organizzazione; non usano `auth.role()`.
- Gli endpoint sensibili restituiscono `Cache-Control: no-store`.
- I report Esteso e le evidenze complete devono essere cifrati a riposo, auditati e cancellati entro 24 ore dalla fine del contratto.
- Solo superadmin e `service_role` possono mutare i capability grant commerciali. L'admin organizzazione può gestire scope e run, ma non auto-concedersi Esteso.

## Scheduling

- Un tick `pg_cron` orario chiama `surface-scan-cron` in modalità `darkrisk_schedule_only`.
- L'Edge Function valuta `Europe/Rome`: lunedì alle 02:00 accoda Standard con chiave `standard:{org}:{ISO-week}`; il primo giorno del mese alle 03:00 accoda il report del mese precedente.
- Il tick orario rende l'orario DST-safe; gli indici idempotenti impediscono duplicati su retry.
- Non esiste alcun cron Esteso. La migrazione rimuove job legacy con nome Esteso/Extended/Identity/DTI.
- Un purge orario elimina payload cifrati, report Esteso, riferimenti e oggetti Storage quando il grant Esteso è scaduto/disabilitato; la soglia a 23 ore assorbe il jitter e garantisce il completamento entro 24 ore. L'audit conserva esclusivamente timestamp e conteggi.

## Rollout

La migrazione è additiva e non applicata automaticamente. Prima del deploy:

1. eseguire migration dry-run e advisor su un clone;
2. configurare i secret IntelX e `User-Agent` nel runtime, mai nel repository;
3. distribuire orchestratore e provider worker;
4. abilitare `darkrisk_orchestrator_v2` inizialmente su un tenant interno;
5. riconciliare run, task, occurrence e report prima di avanzare 5%, 25%, 100%;
6. mantenere il runtime legacy come fallback finché il dual-read è validato.

Mappatura flag (tutti disabilitati per default):

- `DARKRISK_ORCHESTRATOR_V2=true`: abilita creazione run/task e scheduler backend;
- `DARKRISK_IDENTITY_V2=true`: abilita accodamento e consumo dei task Leaks/Identity Esteso;
- `VITE_DARKRISK_EXTENDED_UI_V2=true`: abilita la nuova UI Esteso nel frontend;
- `VITE_DARKRISK_ORCHESTRATOR_V2=true`: indirizza la UI Standard verso il contratto V2.
