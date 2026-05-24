<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 09 - Implementation Roadmap

## Obiettivo

Spezzare l'implementazione DarkRisk360 in step progressivi per Codex.

Ogni fase deve essere committabile, testabile e reversibile.

## Fase 0 - Repository discovery

### Task

Codex deve ispezionare:

- struttura frontend;
- routing;
- auth;
- Supabase client;
- Edge Functions;
- schema database esistente;
- modulo SurfaceScan360 esistente;
- component library;
- storage bucket;
- test framework;
- `.env.example`.

### Output

- breve report tecnico in `docs/darkrisk360/discovery-notes.md`;
- lista file da modificare;
- piano di migrazione.

### DoD

- nessun codice di produzione ancora modificato;
- confermata struttura reale del progetto;
- identificate tabelle cliente esistenti.

## Fase 1 - Schema dati

### Task

Implementare migrazioni Supabase:

- entitlements;
- assets;
- selectors;
- scan_runs;
- source_records;
- evidence;
- findings;
- recommendations;
- alerts;
- report_snapshots;
- audit_log;
- raw_evidence_refs;
- source_config.

### DoD

- migrazioni idempotenti;
- RLS attiva;
- indici principali;
- seed bucket config iniziale;
- tipi enum;
- test migration se disponibili.

## Fase 2 - Domain services

### Task

Creare servizi applicativi:

- asset registry;
- selector registry;
- masking utilities;
- audit service;
- scan run service;
- entitlement service;
- finding service.

### DoD

- unit test masking;
- unit test selector validation;
- unit test risk score;
- nessuna dipendenza UI.

## Fase 3 - SurfaceScan360 adapter

### Task

Collegare i risultati SurfaceScan360 a DarkRisk360.

Azioni:

- leggere dati da modulo esistente o API interna;
- normalizzare DTO;
- creare source records;
- creare evidence;
- creare finding su DNS, email, TLS, porte, CVE, reputation.

### DoD

- scan run con sorgente SurfaceScan360;
- finding generati da fixture;
- nessun dato mock nella dashboard;
- deduplica porte e DNS.

## Fase 4 - IntelX client backend

### Task

Implementare client server-side:

- submit search;
- poll results;
- terminate search;
- preview file;
- phonebook per extended;
- throttling;
- error handling 400/401/402/404/5xx;
- User-Agent;
- API key da environment.

### DoD

- nessuna chiamata dal browser;
- client testabile con mock;
- rate limit attivo;
- terminate chiamato;
- record IntelX persistiti;
- preview mascherata.

## Fase 5 - IntelX finding engine

### Task

Trasformare source records IntelX in evidence e finding:

- credential leak;
- email exposure;
- stealer log;
- domain in leak;
- cross-domain leakage;
- file type stats;
- data source stats.

### DoD

- deduplica con systemid, storageid, simhash;
- ricorrenza calcolata;
- finding aggregati per identità;
- raw non mostrato in UI;
- test con fixture synthetic.

## Fase 6 - Scoring e alerting

### Task

Implementare:

- risk dimensions;
- score cliente;
- score finding;
- alert generation;
- trend tra scan;
- delta nuovi finding.

### DoD

- dashboard KPI calcolati;
- alert recenti reali;
- severity coerente;
- trend rispetto a run precedente.

## Fase 7 - UI Overview

### Task

Sostituire mockup con componenti reali:

- KPI cards;
- alert recenti;
- minacce rilevate;
- coverage matrix;
- tier badge;
- last scan;
- empty states.

### DoD

- mock data rimossa;
- loading, error, empty state;
- filtri base;
- responsive layout.

## Fase 8 - UI dettaglio

### Task

Implementare pagine:

- assets;
- findings;
- identity;
- surface;
- evidence vault;
- reports;
- settings.

### DoD

- customer non vede raw;
- analyst può richiedere reveal auditato;
- filtri funzionanti;
- drawer dettaglio finding.

## Fase 9 - OpenAI recommendations

### Task

Implementare recommendation service:

- sanitize payload;
- Structured Output schema;
- gpt-4o-mini;
- output validation;
- fallback deterministic;
- storage recommendations.

### DoD

- prompt non contiene segreti;
- output JSON valido;
- recommendations collegate a finding;
- fallback testato.

## Fase 10 - Report generation

### Task

Implementare:

- report JSON;
- renderer HTML;
- export PDF se supportato;
- storage;
- download link;
- report Standard;
- report Estesa.

### DoD

- report generato da snapshot;
- nessun segreto in chiaro;
- PDF o HTML scaricabile;
- audit download;
- report riproducibile.

## Fase 11 - Hardening

### Task

- test RLS;
- test accesso cross-customer;
- test secrets;
- log redaction;
- retention job;
- performance query;
- error budget API;
- documentazione admin.

### DoD

- test passano;
- nessuna secret nel bundle;
- reveal auditato;
- retention documentata.

## Prompt operativo per Codex

Usare questo prompt per ciascuna fase:

```markdown
Implementa la Fase {{N}} di DarkRisk360 seguendo i documenti in docs/darkrisk360.
Prima ispeziona il codice esistente e riusa pattern già presenti.
Non esporre secrets nel frontend.
Non usare dati mock in produzione.
Aggiungi test.
Aggiorna la documentazione se cambi contratti o schema.
Fornisci al termine:
1. file modificati;
2. decisioni tecniche;
3. test eseguiti;
4. rischi residui.
```

## Ordine consigliato dei commit

1. `docs: add darkrisk360 implementation specs`
2. `db: add darkrisk360 schema`
3. `feat: add darkrisk domain services`
4. `feat: add surfacescan adapter`
5. `feat: add intelx backend client`
6. `feat: normalize intelx evidence`
7. `feat: add darkrisk scoring and alerts`
8. `feat: replace darkrisk mock dashboard`
9. `feat: add findings and evidence views`
10. `feat: add openai recommendations`
11. `feat: add report generation`
12. `test: harden darkrisk security and rls`

## Rischi da gestire

| Rischio | Mitigazione |
|---|---|
| IntelX credits esauriti | throttling, cache, stop 402 |
| API key leak | backend only, env, no logs |
| raw evidence in UI | masking, RBAC, tests |
| false positive | confidence e validation workflow |
| report non riproducibile | snapshot JSON |
| performance scarsa | indici, paginazione, aggregazioni |
| duplicati leak | dedupe systemid/simhash |
| scansione fuori perimetro | scope enforcement |

## Acceptance criteria finale

- Il modulo sostituisce il mockup.
- Standard ed Estesa sono gestiti da entitlement.
- SurfaceScan360 e IntelX alimentano stesso modello.
- OpenAI genera solo raccomandazioni grounded.
- Report generabile.
- Security governance implementata.
