# 08 - Stato implementativo e handoff

Ultimo aggiornamento: 29 giugno 2026.

Questo documento distingue il codice presente nel repository DEV dalle dipendenze ancora necessarie. Non contiene valori di secret.

## 1. Repository e baseline

- Workspace DEV: `hicompliance-DEV`.
- Branch: `imnick`.
- Commit V2 di riferimento: `166a9f3` (`feat: implement DarkRisk360 IntelX orchestration v2`).
- Migrazione principale: `20260628195813_darkrisk360_orchestrator_v2.sql`.
- Il repository presenta file sporchi preesistenti non correlati: non includerli nei commit DarkRisk.
- La presenza locale di migrazioni/function non prova applicazione o deploy remoto.

## 2. Implementato nel repository

### Prodotto e frontend

- route Standard ed Esteso separate;
- feature folder `src/features/darkrisk`;
- scope max quattro domini/IPv4;
- rimozione input email e trasformazione `@domain`;
- Standard count-only;
- Esteso spot con pagina risultati;
- React Query, query-key factory e parser di confine;
- fallback legacy controllato per endpoint compatibili;
- attivazioni commerciali Standard/Esteso nella UI servizi.

### IntelX

- client HTTP condiviso;
- origin pinning `2.intelx.io` e `3.intelx.io`;
- blocco `4.intelx.io`;
- Search submit/poll/terminate;
- Leaks lines e `/accounts/csv` asincrono;
- blocco `/accounts/1`;
- filtro `leaks.private.general`;
- rate limit, retry, `Retry-After` e circuit breaker;
- dedupe e limite client-side;
- fallback IP verso soli domini autorizzati.

### Orchestrazione e dati

- capability grant separati;
- scope canonico con limite DB;
- run idempotenti e snapshot scope;
- task persistenti con claim, lease, heartbeat e retry;
- lease esclusivo provider;
- record canonico e occurrence per run;
- payload Esteso cifrato;
- projection Standard count-only;
- schedule Europe/Rome DST-safe;
- rimozione cron Esteso;
- purge V2 di fine contratto.

### Sicurezza

- controlli ruolo/capability nell'orchestratore;
- tabelle sensibili revocate ad anon/authenticated;
- `Cache-Control: no-store` nei percorsi sensibili principali;
- audit per fallback IP, scarto bucket e purge;
- no-secrets gate disponibile.

## 3. Non implementato qui / dipendenze bloccanti

### Backend Laravel

Il repository Laravel non e' presente in questo workspace. Restano da implementare:

- controller degli endpoint `/companies/{id}/...`;
- policy e request validation Laravel;
- `ExternalScopeRegistry` e dual-write SurfaceScan;
- overview Standard dalla projection V2;
- risultati Esteso scoped alla run;
- decrypt autorizzato dei payload V2;
- projector report Standard/Esteso;
- URL firmati, audit e response headers applicativi;
- rollout percentuale per tenant.

### Report task

`darkrisk360-worker-v2` consuma solo task IntelX. I task provider `report` restano in attesa finche' non viene aggiunto il projector Laravel/report worker.

### Decrypt V2

`darkrisk360-reveal-evidence` opera sul vault Storage legacy. Non decifra `darkrisk_sensitive_payloads`. La UI Esteso completa richiede il servizio Laravel dedicato.

### Scope condiviso

Il frontend descrive lo scope come condiviso con SurfaceScan360, ma il dual-write transazionale deve essere realizzato dal backend Laravel. Non usare un trigger improvvisato sulle tabelle legacy.

### IPv6

Il trigger database accetta IP pubblici via `inet`; il frontend V2 rifiuta IPv6. Il comportamento di prodotto corrente documentato e' IPv4. Allineare i due livelli prima di estendere il supporto.

### Rollout remoto

Non risultano dimostrati in questa documentazione:

- applicazione migrazione V2 su DEV remoto;
- deploy Edge V2 remoto;
- configurazione reale IntelX;
- canary 5/25/100%;
- QA browser end-to-end con Laravel.

## 4. Gate di produzione noti

1. fornire repository Laravel;
2. implementare API e projector;
3. creare migrazione cron PROD senza URL/project ref DEV;
4. configurare secret reali in DEV;
5. applicare migrazione e deploy Edge DEV;
6. eseguire test contract IntelX con mock e smoke autorizzato;
7. testare decrypt/report/purge;
8. testare RLS per ruolo e tenant;
9. eseguire browser QA Standard/Esteso;
10. promuovere con porting semantico su `PRODOTTO`.

## 5. File principali

### Frontend

- `src/features/darkrisk/standard/StandardDarkRiskPage.tsx`
- `src/features/darkrisk/extended/ExtendedDarkRiskPage.tsx`
- `src/features/darkrisk/api/darkRiskGateway.ts`
- `src/features/darkrisk/domain/contracts.ts`
- `src/features/darkrisk/domain/schemas.ts`
- `src/features/darkrisk/domain/scope.ts`
- `src/components/clients/ClientServicesDialog.tsx`

### Backend Supabase

- `supabase/functions/darkrisk360-orchestrator-v2/index.ts`
- `supabase/functions/darkrisk360-orchestrator-v2/orchestration.ts`
- `supabase/functions/darkrisk360-worker-v2/index.ts`
- `supabase/functions/darkrisk360-worker-v2/worker-utils.ts`
- `supabase/functions/_shared/intelx-http-client.ts`
- `supabase/functions/_shared/intelx-search-adapter.ts`
- `supabase/functions/_shared/intelx-leaks-adapter.ts`
- `supabase/functions/_shared/darkrisk-access-policy.ts`
- `supabase/functions/surface-scan-cron/index.ts`

### Test

- `supabase/functions/_shared/intelx-adapters.test.ts`
- `supabase/functions/_shared/darkrisk-access-policy.test.ts`
- `supabase/functions/darkrisk360-orchestrator-v2/orchestration.test.ts`
- `supabase/functions/darkrisk360-worker-v2/worker-utils.test.ts`

## 6. Comandi di verifica

```bash
npm run test:deno
npm run check
npm run qa:no-secrets
git diff --check
```

Per una modifica solo documentale e' sufficiente verificare link, riferimenti file, assenza secret e `git diff --check`; prima di un handoff codice eseguire l'intera suite.

Verifica eseguita il 29 giugno 2026:

- `npm run test:deno`: 69 test superati, 0 falliti;
- `npm run check`: TypeScript e build di produzione superati; resta il warning noto sulla dimensione del bundle principale;
- `npm run qa:no-secrets`: superato;
- link relativi dei documenti canonici: validi;
- `git diff --check`: superato.

## 7. Variabili locali

Il file `.env.per_stefano` e' locale, ignorato e con permessi `600`. Alcune variabili possono essere presenti ma vuote: verificare i secret mancanti senza stamparne i valori.

Non aggiungere mai il file a Git e non duplicarne il contenuto nella documentazione.

## 8. Regole per la prossima sessione

1. leggere prima questo handoff e i documenti `01`-`07` canonici;
2. non considerare i vecchi prompt 00-11 come stato deployato;
3. non avviare query su asset non autorizzati;
4. non usare `4.intelx.io` o `/accounts/1`;
5. non mettere password in log o record canonici;
6. non claimare task report con il provider worker;
7. non applicare in PROD cron che puntano al project ref DEV;
8. non includere file sporchi non correlati;
9. mantenere rollback tramite feature flag finche' Laravel non e' completo;
10. aggiornare questo documento dopo ogni deploy o decisione architetturale.

## 9. Documenti correlati

- [Architettura, prodotto e flussi](./01-ARCHITETTURA-PRODOTTO-FLUSSI.md)
- [Contratti IntelX e adapter](./02-INTELX-CONTRATTI-ADAPTER.md)
- [Supabase, schema, Edge Functions e cron](./03-SUPABASE-SCHEMA-EDGE-CRON.md)
- [Runbook DEV -> Produzione](./04-RUNBOOK-DEV-TO-PRODUCTION.md)
- [Data dictionary](./05-DATA-DICTIONARY.md)
- [Sicurezza, privacy e retention](./06-SICUREZZA-PRIVACY-RETENTION.md)
- [API, frontend e report](./07-API-FRONTEND-REPORT.md)
- [Cadenza Esteso, KPI Standard e cleartext in piattaforma](./09-CADENZA-ESTESO-E-CLEARTEXT-PIATTAFORMA.md)
