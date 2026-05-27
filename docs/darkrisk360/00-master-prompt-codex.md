<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 00 - Master Prompt per Codex

## Obiettivo

Riscrivere il modulo `DarkRisk360` in HICONSOLE trasformando il mockup attuale in un modulo reale, multi-tenant, collegato a:

1. `SurfaceScan360`, per asset discovery, DNS, WHOIS/RDAP, email security, TLS, porte, servizi, tecnologie, CVE e posture esterna.
2. `Intelligence X`, tramite API a pagamento, per ricerche DTI su domini, email, URL, IP, CIDR e altri selector forti.
3. `OpenAI`, con modello `gpt-4o-mini`, per generare executive summary, raccomandazioni e testi consulenziali partendo solo da finding già normalizzati e mascherati.

Il modulo deve distinguere tra:

- `DarkRisk360 Standard`: evidenza di ciò che è stato controllato, finding principali, evidenze mascherate, alert recenti, score e report sintetico.
- `DarkRisk360 Estesa`: maggiore profondità analitica, correlazioni cross-domain, phonebook, stealer log classification, evidence vault, appendici tecniche, workflow analyst e report completo DTI.

## Regole non negoziabili

Codex deve rispettare sempre queste regole:

1. Le chiavi `INTELX_API_KEY`, `OPENAI_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY` devono essere usate solo lato backend.
2. Nessuna richiesta a Intelligence X o OpenAI deve partire dal browser.
3. Nessuna password, token, cookie, dump raw o credenziale in chiaro deve comparire nella UI cliente.
4. Nessun log applicativo deve contenere API key, password, cookie, token, preview raw non mascherate o payload sensibili.
5. Separare sempre `Evidence`, `Finding`, `Alert`, `Recommendation` e `Report`.
6. Ogni finding deve mantenere tracciabilità verso la sorgente e verso il `scan_run_id`.
7. La logica di tier `standard` ed `extended` deve essere gestita tramite entitlement, non con dashboard separate.
8. La tassonomia IntelX, bucket, media e type non deve essere hardcoded nel frontend.
9. La piattaforma deve supportare multi-tenancy per cliente.
10. Il modulo deve essere pensato solo per domini, asset e selector autorizzati dal cliente.

## Pacchetto markdown

Implementare seguendo questi documenti, nell'ordine:

1. `01-product-spec.md`
2. `02-source-integration-contracts.md`
3. `03-database-schema-supabase.md`
4. `04-finding-taxonomy-and-scoring.md`
5. `05-openai-recommendation-engine.md`
6. `06-report-schema-and-generation.md`
7. `07-ui-ux-flows.md`
8. `08-security-governance.md`
9. `09-implementation-roadmap.md`
10. `10-test-plan-and-qa.md`

## Contesto funzionale

Il mockup attuale mostra:

- KPI: minacce attive, credenziali leak, domini monitorati, punteggio rischio.
- Alert recenti: credenziali, database leak, phishing, marketplace dark web.
- Minacce rilevate: credenziali compromesse, carte di credito, database leak, email compromise.

Questa struttura va mantenuta come base visiva, ma deve diventare data-driven.

La nuova UI non deve mostrare solo conteggi. Deve mostrare anche:

- copertura del controllo;
- ultima scansione;
- sorgenti interrogate;
- stato di verifica;
- severità;
- confidenza;
- asset impattato;
- tipo di evidenza;
- stato di remediation;
- differenza tra finding diretto, indiretto, potenziale o confermato.

## Fonti di riferimento interne

Usare come riferimento di prodotto il report DTI esteso allegato, senza copiare credenziali o dati personali in chiaro.

Usare come riferimento tecnico i documenti Intelligence X allegati:

- `Intelligence X Search Tips.pdf`
- `Intelligence X Search API.pdf`

Dai documenti derivano questi vincoli:

- Intelligence X richiede selector forti, non ricerche full text generiche.
- Le API richiedono autenticazione con API key.
- Le chiamate vanno fatte server-side.
- Il flusso Search API prevede submit, polling risultati, preview/view/read e terminate.
- La frequenza di default non deve superare 1 richiesta al secondo, salvo licenza diversa.
- I bucket disponibili dipendono dalla licenza e possono cambiare.
- Le preview vanno preferite per la UI cliente.
- I raw data vanno trattati come evidenza sensibile.

## Assunzioni tecniche

Codex deve prima ispezionare il repository e verificare:

- framework frontend;
- struttura routing;
- sistema auth;
- tabelle cliente esistenti;
- pattern Supabase client;
- Edge Functions già presenti;
- Storage bucket già presenti;
- eventuale modulo `SurfaceScan360` già implementato;
- naming convention del progetto.

Non creare duplicazioni inutili se esistono già tabelle o componenti equivalenti.

## Deliverable finale atteso

Alla fine dell'implementazione devono esistere:

- tabelle Supabase per asset, selector, scan run, evidence, finding, recommendation, alert, report e audit;
- adapter backend per SurfaceScan360;
- adapter backend per Intelligence X;
- job runner con throttling;
- normalizzatore evidence;
- finding engine;
- scoring engine;
- recommendation service con OpenAI;
- dashboard DarkRisk360 data-driven;
- evidence masking;
- report JSON, HTML e PDF o HTML-to-PDF;
- test automatici;
- documentazione `.env.example` aggiornata;
- nessuna secret hardcoded.

## Definition of Done generale

Il lavoro è completato solo se:

- un admin può attivare DarkRisk360 Standard o Estesa su un cliente;
- un admin può lanciare una scansione autorizzata;
- il sistema genera selector da domini, email, IP e asset;
- il sistema interroga le sorgenti server-side;
- i risultati sono normalizzati e deduplicati;
- la dashboard mostra dati reali;
- il report viene generato da dati persistenti;
- le raccomandazioni sono generate con JSON schema valido;
- la UI cliente non mostra raw secrets;
- gli accessi analyst a evidenze sensibili sono auditati;
- i test coprono adapter, parser, scoring, masking, RLS e report generation.
