# 04 - Runbook DEV -> Produzione

## Variabili ambiente

| Secret | Obbligatorio | Uso |
|---|---|---|
| `SUPABASE_URL` | si, automatico | API progetto |
| `SUPABASE_SERVICE_ROLE_KEY` | si, automatico | operazioni Edge privilegiate |
| `SURFACE_SCAN_CRON_INTERNAL_SECRET` | si | cron, poll e dispatch |
| `SURFACESCAN_REPORT_INTERNAL_SECRET` | si | report automatici |
| `CS_POD_HOST` | si per ConnectSecure globale | host pod senza credenziali |
| `CS_COMPANY_ID` | si per ConnectSecure globale | company id |
| `CS_CLIENT_AUTH_TOKEN` | si per ConnectSecure globale | generazione JWT ConnectSecure |
| `NVD_API_KEY` | consigliato | quota NVD |
| `SHODAN_API_KEY` | richiesto se enrichment attivo | OSINT rete pubblica |
| `OPENAI_API_KEY` | facoltativo | sintesi report |
| `GOOGLE_API_KEY` | facoltativo | quality/safe browsing |
| `SURFACESCAN_SUBDOMAIN_CHILD_JOB_LIMIT` | facoltativo | limite tier esteso |

Non creare file `.env` versionati. Verificare soltanto i nomi con:

```bash
supabase secrets list --project-ref <PROJECT_REF>
```

## Preflight repository

```bash
git status --short
npm ci
npm run qa:no-secrets
npm run build
deno check supabase/functions/connectsecure-scan/index.ts
deno check supabase/functions/surface-exposure-summary/index.ts
deno check supabase/functions/cve-enrichment/index.ts
deno check supabase/functions/surfacescan360-ai-report/index.ts
deno check supabase/functions/surfacescan360-monthly-report/index.ts
```

## DEV

Project ref DEV: `hcllvyzhefcqftesahnv`.

1. Confrontare history locale/remota:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
```

2. Applicare solo le migrazioni pending dopo review:

```bash
supabase db push --linked
```

Se il dry-run segnala versioni remote assenti nel repository, non eseguire `migration repair` automaticamente. Allineare la history o applicare le sole migrazioni SurfaceScan approvate tramite il processo Supabase, mantenendo i file Git come source of truth.

3. Deploy selettivo delle Edge modificate:

```bash
supabase functions deploy surfacescan360-ai-report --project-ref hcllvyzhefcqftesahnv
supabase functions deploy surfacescan360-monthly-report --project-ref hcllvyzhefcqftesahnv
```

4. Verificare auth e dati senza lanciare scan:

```bash
curl -sS -X POST \
  'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/connectsecure-scan' \
  -H 'Authorization: Bearer <ADMIN_JWT>' \
  -H 'Content-Type: application/json' \
  -d '{"action":"diagnose_auth","organization_id":"<ORG_UUID>"}'
```

Atteso: `auth_ok=true`; il payload deve mostrare solo lunghezza e hash prefix del token.

5. Smoke mensile:

```bash
curl -sS -X POST \
  'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/surfacescan360-monthly-report' \
  -H 'Authorization: Bearer <ADMIN_JWT>' \
  -H 'Content-Type: application/json' \
  -d '{"organization_id":"<ORG_UUID>","month_key":"<YYYY-MM>","triggered_by":"manual"}'
```

## Produzione

Non cambiare il link locale al progetto produzione durante lo sviluppo. Usare sempre ref esplicito:

```bash
supabase migration list --project-ref <PROD_PROJECT_REF>
supabase db push --project-ref <PROD_PROJECT_REF> --dry-run
supabase db push --project-ref <PROD_PROJECT_REF>
```

Deploy canonico selettivo:

```bash
for fn in \
  surfacescan360-start-scan \
  surfacescan360-run-enrichment \
  surfacescan360-get-scan-status \
  surface-scan-cron \
  connectsecure-scan \
  surface-exposure-summary \
  subdomain-dump \
  shodan-scan \
  cve-enrichment \
  cisa-kev-sync \
  surfacescan360-ai-report \
  surfacescan360-monthly-report
do
  supabase functions deploy "$fn" --project-ref <PROD_PROJECT_REF>
done
```

Non usare `supabase functions deploy` senza nome: il repository puo' contenere Edge di altri prodotti.

## Checklist post-deploy

- [ ] `migration list` allineata.
- [ ] RLS abilitata sulle nuove tabelle.
- [ ] Grant `authenticated` presenti solo su registry e report mensili.
- [ ] Nessun accesso Data API a config/token e sensitive data.
- [ ] Secrets ConnectSecure presenti.
- [ ] Secret Vault cron allineato al secret Edge.
- [ ] Cinque cron attivi con schedule corretti.
- [ ] `diagnose_auth` verde.
- [ ] Summary ET_NEW/tenant test restituisce target e porte coerenti.
- [ ] UI non mostra moduli interni/provider.
- [ ] Report PDF e DOCX non contengono sezioni vuote o sorgenti interne.
- [ ] Log Edge senza errori 401/403 inattesi.

## Rollback

### Edge

Ridispiegare il commit precedente della singola funzione. Non disabilitare l'intero runtime.

### Database

La migrazione di portabilita' e' additiva. In caso di regressione:

1. Bloccare il deploy applicativo.
2. Ripristinare policy/grant precedenti con una nuova migrazione forward-only.
3. Non cancellare tabelle con dati cliente.
4. Se necessario, disabilitare temporaneamente i cron con `cron.unschedule(jobid)` e riattivarli dopo il fix.

### ConnectSecure

- `Failed to authorize`: confrontare hash prefix del secret con il token valido, poi aggiornare il secret.
- `scan accodato ma nessun risultato`: verificare registry, job persistente e cron poller.
- sottodomini presenti ma non scansionati: verificare queue `subdomain_enrichment`, cooldown e dispatch ogni 2 minuti.

## Riferimenti Supabase

- [Deploy Edge Functions](https://supabase.com/docs/guides/functions/deploy)
- [Gestione secrets](https://supabase.com/docs/guides/functions/secrets)
- [Cron](https://supabase.com/docs/guides/cron)
- [Grant espliciti Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
