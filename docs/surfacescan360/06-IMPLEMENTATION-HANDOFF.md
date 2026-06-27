# SurfaceScan360 - Stato implementativo e handoff

Ultimo aggiornamento: 27 giugno 2026.

Questo documento conserva il contesto operativo necessario per riprendere il lavoro senza ricostruire la cronologia della sessione. Non contiene token, JWT, password, service role o valori dei secrets.

## 1. Stato corrente

- Branch DEV: `imnick`.
- Commit principale della portabilita': `1ed7fc9`.
- Branch di prodotto: `PRODOTTO`.
- Commit portato su prodotto: `47ba101`.
- Progetto Supabase DEV: `hcllvyzhefcqftesahnv`.
- Le migrazioni e le Edge descritte qui sono state applicate/deployate solo in DEV.
- Su produzione e' stato pubblicato il codice Git, ma non sono state applicate migrazioni ne' eseguiti deploy Edge remoti.

## 2. Decisioni architetturali consolidate

1. ConnectSecure e' il motore esterno ASM canonico. La UI non espone il nome del provider.
2. DNS, HTTP, TLS, TCP, OSINT rete, fingerprint servizi, NVD, EPSS e CISA KEV confluiscono nelle tabelle canoniche SurfaceScan360.
3. La UI e i report leggono dati normalizzati, non payload provider raw.
4. Le porte aperte sono unificate da `surface_open_ports`, indipendentemente dal motore che le ha rilevate.
5. Gli asset latest-per-target restano visibili anche quando non presentano porte aperte.
6. I sottodomini scoperti vengono salvati in `surface_assets`; la scansione successiva passa dalla queue interna e non genera ricorsione incontrollata sul provider esterno.
7. Le organizzazioni standard accodano al massimo 10 nuovi sottodomini per ciclo. Le organizzazioni estese seguono i limiti configurati.
8. I moduli opzionali sono rimossi dal prodotto visibile e dai report. Il backend Amass resta disponibile ma disattivato e non e' stato distrutto.
9. Il percorso legacy Pentest/PTools e' stato rimosso dal runtime canonico.
10. Provider, sorgenti interne e nomi tecnici riservati vengono redatti prima della presentazione o dell'export.

## 3. ConnectSecure e autenticazione

### Flusso corretto

1. Risolvere la configurazione per organizzazione; se il token per-org e' vuoto, usare la configurazione globale.
2. Inviare `POST https://<pod-host>/w/authorize` con header `Client-Auth-Token`.
3. Estrarre l'access token dalla risposta.
4. Usare il bearer token per le API ASM.
5. Rigenerare il token di accesso per scansioni puntuali e schedulate; non persisterlo in UI o report.

### Diagnosi storica dell'errore auth

Il `curl` autorizzava correttamente, mentre il runtime restituiva `Failed to authorize`. La causa individuata era la divergenza tra il valore valido e `CS_CLIENT_AUTH_TOKEN` nel runtime Supabase. Il codice usa l'header corretto; la configurazione deve contenere esattamente il secret valido, senza doppia codifica, virgolette o spazi finali.

Configurazione globale attesa:

```text
CS_POD_HOST=<pod-host>
CS_COMPANY_ID=<company-id>
CS_CLIENT_AUTH_TOKEN=<secret>
```

La diagnostica deve mostrare soltanto presenza, lunghezza e prefisso hash; mai il secret o l'access token.

## 4. Normalizzazione dati

| Evidenza | Destinazione canonica | Uso |
|---|---|---|
| Domini, sottodomini e IP | `surface_assets` | Scope, discovery, lista asset |
| Porte e protocolli | `surface_open_ports` | KPI, servizi esposti, finding sintetici |
| Tecnologie e versioni | `surface_web_technologies` | Fingerprint e correlazione CVE |
| Finding tecnici | `surface_findings` | Vulnerabilita', remediation, report |
| Evidenze di modulo | `surface_observations` | HTTP, DNS, mail, TLS, WHOIS e contesto |
| Certificati | `surface_ssl_results` | Postura TLS e scadenze |
| CVE e metadati | `cve_intel_cache` | CVSS, EPSS, KEV e spiegazioni |
| Snapshot mensili | `surface_scan_monthly_reports` | Trend e report periodico |

Le informazioni SPF, DKIM, DMARC, porte, servizi, IP e sottodomini ricevute dal motore esterno vengono mappate nei rispettivi moduli canonici e fuse con i risultati dei motori interni.

## 5. Exposure Score V2

- Il valore mostrato e' un indice di postura: `100` significa postura migliore, non rischio massimo.
- Il rischio viene calcolato separatamente in punti rischio e classificato per livello.
- Una porta web aperta non implica automaticamente una vulnerabilita'.
- La correlazione CVE richiede un prodotto/versione attendibile o un'evidenza equivalente.
- Le CVE confermate pesano integralmente; le candidate hanno peso ridotto.
- CVSS misura la severita', EPSS la probabilita' di sfruttamento e KEV indica sfruttamento noto.
- Servizi sensibili possono produrre rischio anche senza CVE.
- In assenza di correlazione attendibile la UI dichiara lo stato non determinabile e non inventa CVE, CVSS o EPSS.

Test di riferimento: `supabase/functions/_shared/exposure-score-v2.test.ts`.

## 6. Comportamento UI e report

- Menu SurfaceScan360 sticky e sezioni ordinate per consultazione operativa.
- Il KPI `Asset scansionati` e' cliccabile e porta alla lista completa latest-per-target.
- La lista mostra target, stato snapshot, IP associati, numero porte e stato `Nessuna porta aperta`.
- `Indirizzi IP rilevati` non viene renderizzato quando non contiene IP validi.
- Grafici, card e sezioni senza dati vengono nascosti oppure sostituiti da un unico stato datato utile.
- Le scansioni automatiche sono silenziose; i toast restano per le azioni manuali.
- PDF, DOCX, report AI e report mensili passano dal filtro di visibilita' in `src/lib/surfacescan/reportVisibility.ts`.
- I vecchi payload vengono filtrati durante l'export per evitare la ricomparsa di moduli o provider nascosti.
- I placeholder di bucket storage senza evidenza concreta non generano finding; le evidenze realmente azionabili restano visibili e spiegate.

## 7. Migrazioni di portabilita' applicate in DEV

```text
20260627083248_surfacescan_portability_schema.sql
20260627084618_surfacescan_portability_grants_hardening.sql
20260627085018_surfacescan_portability_index_dedupe.sql
20260627085319_surfacescan_portability_foreign_keys.sql
```

Coprono:

- `connectsecure_config`;
- `connectsecure_domain_registry`;
- `connectsecure_sensitive_data`;
- `surface_scan_monthly_reports`;
- vincoli, indici, RLS, policy e grant espliciti;
- rimozione condizionale degli indici duplicati;
- foreign key validate dopo verifica degli orfani.

Non riparare o riscrivere la storia migrazioni remota senza un audit dedicato: DEV presenta drift storico tra migrazioni locali e remote. Per produzione seguire il runbook forward-only.

## 8. Edge e cron verificati

Edge deployate in DEV durante questo intervento:

```text
surfacescan360-ai-report
surfacescan360-monthly-report
```

Le chiamate senza autenticazione restituiscono `401`, come atteso. Il report mensile accetta service role, secret interno oppure JWT di un operatore globale o admin della stessa organizzazione.

Schedulazioni verificate:

| Job | Frequenza |
|---|---|
| Poll ConnectSecure | ogni minuto |
| Dispatch queue sottodomini | ogni 2 minuti |
| Scan settimanale | lunedi' 00:00 UTC |
| CVE enrichment | due volte al minuto |
| CISA KEV sync | 03:00 UTC |

## 9. Verifiche eseguite

- `deno check` sulle Edge canoniche: superato.
- Test adapter ConnectSecure e Score V2: 12 superati, 0 falliti.
- `npm run qa:no-secrets`: superato.
- `npm run build`: superato; resta soltanto il warning noto sulla dimensione del bundle.
- `git diff --check`: superato.
- Search gate UI/report per moduli opzionali, Amass visibile, Pentest e PTools: superato.
- Controlli RLS, grant, cron, foreign key e assenza orfani in DEV: superati per gli artefatti introdotti.

## 10. Verifica browser ancora da completare

Il server locale risponde senza errori console, ma la route protetta reindirizza a `/auth`. Non sono state copiate sessioni o credenziali per aggirare il login.

Procedura consigliata:

1. Aprire nel Browser integrato l'ambiente esatto da verificare.
2. L'utente inserisce direttamente credenziali temporanee e MFA nel browser, senza pubblicarle in chat.
3. Lasciare aperta la sessione e comunicare `login completato`.
4. Verificare click KPI asset, scroll, lista 11/9, stati senza porte, sezioni IP, export PDF/DOCX e assenza provider.
5. Revocare l'account temporaneo al termine.

## 11. File principali

- Pagina: `src/pages/SurfaceScan360.tsx`
- Exposure: `src/components/surface-scan/SurfaceScanExposureSection.tsx`
- KPI: `src/components/surfacescan/ExposureKpiCards.tsx`
- Filtro report: `src/lib/surfacescan/reportVisibility.ts`
- PDF: `src/lib/surfaceScan360PdfReport.ts`
- DOCX: `src/lib/surfaceScan360DocxReport.ts`
- Engine: `supabase/functions/_shared/surface-scan-engine.ts`
- Adapter: `supabase/functions/_shared/connectsecure-adapter.ts`
- Orchestratore: `supabase/functions/connectsecure-scan/index.ts`
- Summary: `supabase/functions/surface-exposure-summary/index.ts`
- Score V2: `supabase/functions/_shared/exposure-score-v2.ts`
- CVE: `supabase/functions/cve-enrichment/index.ts`
- Report AI: `supabase/functions/surfacescan360-ai-report/index.ts`
- Report mensile: `supabase/functions/surfacescan360-monthly-report/index.ts`
- Manifest: `supabase/config.toml`

## 12. Regole per la prossima sessione

1. Leggere prima questo handoff e i documenti `01`-`05`.
2. Non inserire secrets in file, log, query diagnostiche o chat.
3. Non avviare scansioni su target non autorizzati.
4. Non modificare l'orchestrazione funzionante per rimuovere elementi soltanto visivi.
5. Non includere file sporchi non correlati nei commit.
6. Applicare migrazioni e deploy remoti soltanto sull'ambiente esplicitamente richiesto.
7. Prima della produzione eseguire il runbook completo con `<PROD_PROJECT_REF>` e smoke test autenticati.

## 13. Documenti correlati

- [Architettura, motori e dati](./01-ARCHITETTURA-MOTORI-DATI.md)
- [ConnectSecure, NVD, sottodomini e scoring](./02-CONNECTSECURE-NVD-SUBDOMAIN-SCORING.md)
- [Supabase Edge, SQL e cron](./03-SUPABASE-EDGE-SQL-CRON.md)
- [Runbook DEV -> Produzione](./04-RUNBOOK-DEV-TO-PRODUCTION.md)
- [Data dictionary](./05-DATA-DICTIONARY.md)
