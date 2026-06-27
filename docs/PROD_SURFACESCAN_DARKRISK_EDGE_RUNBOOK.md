# SurfaceScan360 + DarkRisk360 - Runbook produzione

Questo documento coordina il rollout congiunto. Per SurfaceScan360 la procedura autorevole e' [04-RUNBOOK-DEV-TO-PRODUCTION.md](./surfacescan360/04-RUNBOOK-DEV-TO-PRODUCTION.md).

## 1. Principi

- Applicare migrazioni in ordine cronologico.
- Verificare sempre il dry-run sul project ref corretto.
- Deployare solo le Edge modificate o elencate nel manifest canonico.
- Non copiare secrets tra ambienti tramite file versionati.
- Non modificare cron e Vault senza query di verifica e rollback pronto.

## 2. Preflight

```bash
git status --short
npm ci
npm run qa:no-secrets
npm run build
supabase migration list --project-ref <PROJECT_REF>
supabase db push --project-ref <PROJECT_REF> --dry-run
```

Check Deno SurfaceScan:

```bash
deno check supabase/functions/connectsecure-scan/index.ts
deno check supabase/functions/surface-scan-cron/index.ts
deno check supabase/functions/surface-exposure-summary/index.ts
deno check supabase/functions/cve-enrichment/index.ts
deno check supabase/functions/surfacescan360-ai-report/index.ts
deno check supabase/functions/surfacescan360-monthly-report/index.ts
```

## 3. SurfaceScan360

### Edge canoniche

```text
surfacescan360-start-scan
surfacescan360-run-enrichment
surfacescan360-get-scan-status
surface-scan-cron
connectsecure-scan
surface-exposure-summary
subdomain-dump
shodan-scan
cve-enrichment
cisa-kev-sync
surfacescan360-ai-report
surfacescan360-monthly-report
```

Deploy:

```bash
supabase functions deploy <FUNCTION_NAME> --project-ref <PROJECT_REF>
```

Migrazioni e cron sono descritti in:

- [03-SUPABASE-EDGE-SQL-CRON.md](./surfacescan360/03-SUPABASE-EDGE-SQL-CRON.md)
- [04-RUNBOOK-DEV-TO-PRODUCTION.md](./surfacescan360/04-RUNBOOK-DEV-TO-PRODUCTION.md)

## 4. DarkRisk360

### Edge canoniche

```text
darkrisk360-sync-surfacescan
darkrisk360-overview
darkrisk360-generate-recommendations
darkrisk360-generate-report
darkrisk360-report-access
darkrisk360-reveal-evidence
darkrisk360-qa-status
darkrisk360-roadmap-status
darkrisk360-retention-cleanup
darkrisk-dti-esteso-report
```

Deploy selettivo:

```bash
for fn in \
  darkrisk360-sync-surfacescan \
  darkrisk360-overview \
  darkrisk360-generate-recommendations \
  darkrisk360-generate-report \
  darkrisk360-report-access \
  darkrisk360-reveal-evidence \
  darkrisk360-qa-status \
  darkrisk360-roadmap-status \
  darkrisk360-retention-cleanup \
  darkrisk-dti-esteso-report
do
  supabase functions deploy "$fn" --project-ref <PROJECT_REF>
done
```

Secrets DarkRisk minimi dipendono dai moduli abilitati; non includere mai valori reali nel runbook:

```text
DARKRISK360_INTERNAL_SECRET
INTELX_API_KEY
INTELX_API_URL
OPENAI_API_KEY
OPENAI_RECOMMENDATION_MODEL
```

## 5. Ordine rollout congiunto

1. Verificare secrets e Vault.
2. Applicare migrazioni.
3. Eseguire advisors security/performance.
4. Deploy Edge SurfaceScan condivise con DarkRisk.
5. Deploy Edge DarkRisk.
6. Eseguire smoke read-only e auth.
7. Verificare cron e log Edge.
8. Solo dopo, avviare un job controllato su tenant di test autorizzato.

## 6. Smoke test

```sql
select jobname, schedule, active from cron.job order by jobname;

select status, count(*)
from public.surface_scan_jobs
group by status;

select status, count(*)
from public.darkrisk360_scan_runs
group by status;
```

Verificare inoltre:

- SurfaceScan summary coerente con `surface_open_ports`.
- Sottodomini visibili e queue limitata.
- CVE con stato `confirmed/candidate/unknown/rejected`.
- Report senza nomi provider o sezioni vuote.
- DarkRisk overview e report leggono lo stesso scope canonico.

## 7. Rollback

- Edge: ridispiegare il commit precedente della singola funzione.
- Database: creare una migrazione forward-only correttiva; non cancellare dati cliente.
- Cron: disabilitare solo il job coinvolto e annotare `jobid`, schedule e comando di ripristino.
- Secrets: ruotare il valore, non stamparlo nei log.

## 8. Riferimenti

- [Documentazione SurfaceScan360](./surfacescan360/README.md)
- [Supabase deploy](https://supabase.com/docs/guides/functions/deploy)
- [Supabase secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
