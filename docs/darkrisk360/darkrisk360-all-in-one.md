# DarkRisk360 Codex Pack - All in One

<!-- FILE: 00-master-prompt-codex.md -->

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

---

<!-- FILE: 01-product-spec.md -->

<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 01 - Product Spec DarkRisk360

## Visione

DarkRisk360 è il modulo HICONSOLE per il monitoraggio del rischio digitale esterno del cliente, con focus su:

- esposizione di domini, sottodomini, IP e servizi pubblici;
- postura DNS, email security, TLS, web e infrastruttura;
- leak, credenziali, stealer log, paste, dati indicizzati e fonti deep/dark web tramite Intelligence X;
- correlazione con SurfaceScan360;
- generazione di report DTI e remediation prioritarie.

DarkRisk360 non deve essere un semplice widget di "dark web monitoring". Deve diventare un prodotto di `Domain Threat Intelligence` collegato all'anagrafica cliente e al perimetro autorizzato.

## Target utenti

### Cliente finale

Vuole capire:

- cosa è stato controllato;
- cosa è stato trovato;
- quanto è grave;
- quali asset sono impattati;
- cosa deve fare subito;
- quali attività sono già in carico a HiSolution.

La vista cliente deve essere chiara, sintetica, con dati sensibili mascherati.

### Analyst HiSolution

Vuole:

- vedere evidenze tecniche;
- validare finding;
- accedere a preview e raw evidence se autorizzato;
- classificare compromissioni dirette, indirette e potenziali;
- generare report;
- aprire remediation o ticket;
- verificare delta tra scan successive.

### Admin HiSolution

Vuole:

- attivare Standard o Estesa;
- configurare perimetro;
- gestire chiavi e sorgenti;
- vedere consumi, errori API, crediti, throttling;
- gestire retention e audit.

## Tiers commerciali

### DarkRisk360 Standard

La versione Standard deve dare evidenza di ciò che esiste e di ciò che è stato controllato.

Funzioni minime:

- dashboard cliente;
- domini monitorati;
- asset principali da SurfaceScan360;
- scan IntelX su domini principali e selector approvati;
- conteggi per tipologia finding;
- evidenze mascherate;
- alert recenti;
- risk score;
- report sintetico;
- raccomandazioni operative principali;
- trend rispetto all'ultima scansione.

### DarkRisk360 Estesa

La versione Estesa deve aggiungere profondità analitica.

Funzioni aggiuntive:

- phonebook e discovery selector;
- correlazioni cross-domain;
- analisi domini collaterali;
- analisi stealer log;
- classification per data source e file type;
- evidence vault analyst;
- preview controllata;
- export account mascherato;
- appendici tecniche;
- workflow analyst;
- report completo DTI;
- alerting continuo su nuovi risultati;
- delta analysis tra scan.

## Feature matrix

| Area | Standard | Estesa |
|---|---|---|
| Dashboard KPI | Sì | Sì |
| Copertura controlli | Sì | Sì |
| Asset SurfaceScan360 | Sì | Sì |
| IntelX search su dominio principale | Sì | Sì |
| IntelX search su selector estesi | Limitata | Completa |
| Phonebook | No o limitato | Sì |
| Evidenze mascherate | Sì | Sì |
| Raw evidence | No | Solo analyst autorizzato |
| Report sintetico | Sì | Sì |
| Report DTI completo | No | Sì |
| Stealer log classification | Sintesi | Dettaglio |
| Cross-domain correlation | Base | Avanzata |
| Export tecnico | Limitato | Completo e auditato |
| Alerting continuo | Base | Avanzato |

## Oggetti di dominio

### Customer

Cliente HICONSOLE già presente o da collegare a tabella esistente.

Campi attesi:

- `id`
- `name`
- `status`
- `industry`
- `tenant_id` o equivalente
- riferimenti contrattuali e perimetro autorizzato.

### Asset

Un asset è un oggetto osservabile:

- dominio;
- sottodominio;
- URL;
- IP;
- CIDR;
- MX;
- nameserver;
- host;
- servizio;
- certificato;
- email address;
- account aziendale.

### Selector

Un selector è un valore interrogabile su Intelligence X:

- email;
- dominio;
- wildcard domain;
- URL;
- IPv4 o IPv6;
- CIDR;
- phone number;
- MAC address;
- UUID;
- system ID;
- storage ID;
- simhash;
- IBAN;
- credit card number.

Non usare nomi aziendali generici o keyword marketing come selector IntelX.

### ScanRun

Una scansione orchestrata per cliente.

Include:

- tier;
- trigger;
- sorgenti;
- stato;
- inizio;
- fine;
- errore;
- metriche di consumo.

### SourceRecord

Record grezzo normalizzato dalla sorgente, ma non ancora interpretato come finding.

### Evidence

Prova persistente e tracciabile. Può derivare da SurfaceScan360 o IntelX.

Non coincide necessariamente con un problema.

### Finding

Interpretazione operativa derivata da una o più evidence.

Esempio:

- `DMARC non in enforcement`
- `FTP esposto`
- `Credenziale aziendale apparsa in leak`
- `Email aziendale presente in stealer log di terza parte`
- `Dominio collaterale su stesso IP`

### Alert

Evento nuovo o significativo generato da un finding.

Esempio:

- nuovo leak;
- nuova porta aperta;
- peggioramento score;
- nuovo dominio collaterale;
- nuovo selector con evidenze.

### Recommendation

Raccomandazione operativa legata a uno o più finding.

Può essere deterministica o AI-assisted.

### ReportSnapshot

Snapshot immutabile di report generato a una data.

## KPI dashboard

La dashboard deve esporre almeno:

- `Minacce attive`
- `Credenziali leak`
- `Domini monitorati`
- `Punteggio rischio`
- `Ultima scansione`
- `Copertura SurfaceScan360`
- `Copertura IntelX`
- `Finding critici`
- `Finding ad alta priorità`
- `Identità impattate`
- `Servizi esposti`
- `Nuovi alert da ultima scansione`

## Stati finding

Usare una state machine semplice:

- `new`
- `triaged`
- `validated`
- `false_positive`
- `accepted_risk`
- `remediation_in_progress`
- `resolved`
- `suppressed`

Ogni cambio stato deve generare audit log.

## Linguaggio e responsabilità

Non usare "breach confermato" se l'evidenza non dimostra compromissione diretta.

Usare invece:

- "esposizione rilevata";
- "evidenza indicizzata";
- "compromissione indiretta";
- "potenziale riuso credenziale";
- "rischio di impersonation";
- "endpoint terzo compromesso";
- "misconfigurazione".

## Acceptance criteria

- Il modulo mostra dati reali e persistenti, non mock.
- La stessa anagrafica cliente alimenta Standard ed Estesa.
- Il tier modifica profondità, visibilità e workflow, non il modello dati.
- Le evidenze sensibili sono mascherate.
- Ogni KPI è calcolabile da query tracciabili.
- Ogni finding ha sorgente, confidenza e timestamp.
- Ogni report è riproducibile dallo snapshot dati.

---

<!-- FILE: 02-source-integration-contracts.md -->

<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 02 - Source Integration Contracts

## Obiettivo

Definire i contratti implementativi per integrare:

- `SurfaceScan360`
- `Intelligence X`
- eventuali sorgenti future

Tutte le sorgenti devono essere isolate tramite adapter backend. Il frontend non deve mai conoscere chiavi, endpoint sensibili o payload raw.

## Principio architetturale

Ogni sorgente deve produrre `SourceRecord` normalizzati.

Il flusso è:

```text
Customer scope
  -> Asset registry
  -> Selector registry
  -> ScanRun
  -> Source adapter
  -> SourceRecord
  -> Evidence
  -> Finding
  -> Alert
  -> Recommendation
  -> Report
```

## Interfaccia adapter comune

Creare una interfaccia TypeScript simile:

```ts
export type SourceName = "surfacescan360" | "intelx";

export interface SourceAdapterContext {
  customerId: string;
  scanRunId: string;
  tier: "standard" | "extended";
  requestedBy: string;
  entitlement: DarkRiskEntitlement;
}

export interface SourceAdapterResult {
  source: SourceName;
  recordsCreated: number;
  evidenceCreated: number;
  warnings: string[];
  errors: SourceAdapterError[];
  creditsUsed?: number;
  startedAt: string;
  completedAt: string;
}

export interface SourceAdapter {
  name: SourceName;
  run(ctx: SourceAdapterContext): Promise<SourceAdapterResult>;
}
```

## SurfaceScan360 Adapter

### Scopo

SurfaceScan360 alimenta DarkRisk360 con la postura tecnica del perimetro esterno.

### Input

- domini del cliente;
- sottodomini già noti;
- IP pubblici;
- CIDR autorizzati;
- URL;
- MX;
- nameserver;
- asset già scoperti in precedenti run.

### Output atteso

Normalizzare almeno queste categorie:

| Categoria | Esempi |
|---|---|
| DNS | A, AAAA, MX, TXT, SPF, DMARC, DKIM selector, MTA-STS, SOA, NS |
| WHOIS/RDAP | registrar, expiration, lock, DNSSEC, contacts redacted, country |
| Web | status, redirect, headers, default page, tecnologia, CMS, framework |
| TLS | CN, SAN, issuer, scadenza, mismatch, cipher, HSTS |
| Porte | porta, protocollo, servizio, banner, stato, esposizione |
| CVE | CVE candidate, CVSS, prodotto, versione, confidence |
| Email security | SPF, DMARC, DKIM, MTA-STS, TLS-RPT, MX banner |
| Reputation | blacklist, web reputation, SMTP reputation |
| Co-hosting | domini su stesso IP, blast radius |
| Provider | ASN, hosting provider, geolocation |

### DTO minimo

```ts
export interface SurfaceScanRecord {
  asset: string;
  assetType: "domain" | "subdomain" | "ip" | "url" | "cidr" | "mx" | "ns";
  category: "dns" | "whois" | "web" | "tls" | "port" | "cve" | "email_security" | "reputation" | "cohosting" | "provider";
  observedAt: string;
  severityHint?: "info" | "low" | "medium" | "high" | "critical";
  confidence: "low" | "medium" | "high";
  title: string;
  description?: string;
  raw: Record<string, unknown>;
}
```

### Regole

- Non duplicare scansioni già presenti se il modulo SurfaceScan360 esiste.
- Collegare i risultati tramite `scan_run_id`.
- Non fare lookup non autorizzati fuori perimetro.
- I domini collaterali trovati vanno classificati come `candidate_asset` e non automaticamente come in-scope, salvo regola o approvazione.
- Le porte aperte diventano finding solo se rilevanti rispetto alla policy.

## Intelligence X Adapter

### Scopo

Intelligence X alimenta il layer DTI con evidenze su leak, paste, log, web archive, whois, darknet, file e altri bucket accessibili dalla licenza.

### Vincoli principali

- Usare solo selector forti.
- Non usare ricerche full text generiche.
- Chiamare l'API solo server-side.
- Usare header `x-key`.
- Impostare `User-Agent` identificativo.
- Limitare a 1 richiesta al secondo, salvo licenza diversa.
- Gestire `401 Unauthorized` come problema di permesso o bucket.
- Gestire `402 Payment Required` come crediti esauriti.
- Terminare le search non più necessarie.
- Preferire preview e metadata per la UI cliente.
- Conservare raw solo se necessario e con accesso analyst.

### Selector ammessi

Implementare validatori per:

- email address;
- domain;
- wildcard domain, esempio `*.example.com`;
- URL;
- IPv4;
- IPv6;
- CIDRv4;
- CIDRv6;
- phone number;
- Bitcoin address;
- MAC address;
- IPFS hash;
- UUID;
- storage ID;
- system ID;
- simhash;
- credit card number, solo se autorizzato e mascherato;
- IBAN, solo se autorizzato e mascherato.

### Flusso Search API

```text
1. POST /intelligent/search
2. attendere almeno 400 ms
3. GET /intelligent/search/result
4. ripetere fino a status 1 oppure timeout controllato
5. per record rilevanti chiamare /file/preview
6. solo per ruoli analyst e tier extended valutare /file/view o /file/read
7. GET /intelligent/search/terminate se necessario
```

### Request search

```json
{
  "term": "example.com",
  "buckets": [],
  "lookuplevel": 0,
  "maxresults": 1000,
  "timeout": 0,
  "datefrom": "",
  "dateto": "",
  "sort": 2,
  "media": 0,
  "terminate": []
}
```

### Mapping sort

| Sort | Significato |
|---|---|
| 0 | no sorting |
| 1 | xscore asc |
| 2 | xscore desc |
| 3 | date asc |
| 4 | date desc |

Default consigliato:

- `sort: 2` per overview;
- `sort: 4` per alerting su nuovi record;
- `maxresults` configurabile per tier.

### Record result da salvare

Salvare almeno:

- `systemid`;
- `storageid`;
- `instore`;
- `size`;
- `accesslevel`;
- `type`;
- `media`;
- `added`;
- `date`;
- `name`;
- `description`;
- `xscore`;
- `simhash`;
- `bucket`;
- `tags`;
- `relations`;
- `accesslevelh`;
- `mediah`;
- `typeh`;
- `randomid`;
- `selector_id`;
- `scan_run_id`.

### Preview

Usare `/file/preview` per creare una evidenza sicura.

La preview deve essere:

- limitata;
- mascherata;
- salvata separatamente da raw;
- non usata come unica prova di compromissione diretta se non contiene elementi sufficienti.

### View e read

Usare `/file/view` e `/file/read` solo per:

- tier extended;
- ruolo analyst;
- workflow esplicito;
- audit log obbligatorio;
- retention controllata.

### Phonebook

Usare Phonebook per Estesa:

```text
POST /phonebook/search
GET /phonebook/search/result
```

Obiettivi:

- email aziendali;
- sottodomini;
- URL;
- selector aggiuntivi.

I selector ottenuti da Phonebook devono entrare come `discovered`, non automaticamente `approved`.

### Buckets

Non hardcodare la lista bucket.

Creare tabella config:

```text
darkrisk_source_bucket_map
```

Campi:

- `source`
- `bucket`
- `label`
- `source_family`
- `default_evidence_class`
- `requires_extended`
- `enabled`
- `risk_weight`
- `notes`

### API client TypeScript

Creare client backend:

```ts
export class IntelXClient {
  constructor(private config: IntelXConfig) {}

  async submitSearch(req: IntelXSearchRequest): Promise<IntelXSearchResponse> {}
  async getSearchResults(searchId: string, limit: number): Promise<IntelXSearchResult> {}
  async terminateSearch(searchId: string): Promise<void> {}
  async submitPhonebook(req: IntelXSearchRequest): Promise<IntelXSearchResponse> {}
  async getPhonebookResults(searchId: string, limit: number): Promise<IntelXPhonebookResult> {}
  async previewFile(req: IntelXPreviewRequest): Promise<IntelXPreviewResult> {}
  async viewFile(req: IntelXViewRequest): Promise<IntelXViewResult> {}
  async readFile(req: IntelXReadRequest): Promise<IntelXReadResult> {}
}
```

### Throttling

Implementare throttling centralizzato.

Requisiti:

- massimo 1 request/sec per default;
- backoff su errori 429, 5xx, timeout;
- stop su 401;
- stop su 402;
- retry massimo configurabile;
- log senza segreti.

### Environment variables

```bash
INTELX_API_BASE_URL=https://2.intelx.io
INTELX_API_KEY=
INTELX_USER_AGENT=HiSolution-HICONSOLE-DarkRisk360/1.0 security@hisolution.it
INTELX_DEFAULT_MAX_RESULTS=1000
INTELX_REQUESTS_PER_SECOND=1
INTELX_ENABLE_FILE_READ=false
OPENAI_API_KEY=
OPENAI_RECOMMENDATION_MODEL=gpt-4o-mini
```

Verificare API base URL reale da contratto/licenza Intelligence X.

## Backend endpoints HICONSOLE

Creare o adattare endpoint server-side:

| Endpoint | Metodo | Ruolo | Scopo |
|---|---|---|---|
| `/api/darkrisk360/customers/:id/entitlement` | GET | admin, analyst | Legge tier attivo |
| `/api/darkrisk360/customers/:id/scan` | POST | admin, analyst | Avvia scan |
| `/api/darkrisk360/scan-runs/:id` | GET | admin, analyst | Stato scan |
| `/api/darkrisk360/customers/:id/overview` | GET | customer, analyst | KPI dashboard |
| `/api/darkrisk360/customers/:id/findings` | GET | customer, analyst | Lista finding |
| `/api/darkrisk360/findings/:id` | GET | customer, analyst | Dettaglio finding mascherato |
| `/api/darkrisk360/evidence/:id/reveal` | POST | analyst | Reveal auditato |
| `/api/darkrisk360/customers/:id/reports` | POST | analyst | Genera report |
| `/api/darkrisk360/reports/:id/download` | GET | authorized | Download report |

## Acceptance criteria

- IntelX non viene chiamato dal frontend.
- SurfaceScan360 e IntelX producono `SourceRecord`.
- Search IntelX viene terminata quando non serve.
- Preview viene usata per customer UI.
- Raw read è disabilitato di default.
- Rate limit è testabile.
- 401, 402, 400 e 404 sono gestiti con errori chiari.
- Ogni record ha `source`, `scan_run_id`, `selector_id` o `asset_id`.

---

<!-- FILE: 03-database-schema-supabase.md -->

<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 03 - Database Schema Supabase

## Obiettivo

Creare lo schema dati Supabase per DarkRisk360.

Il modello deve supportare:

- multi-tenancy;
- Standard ed Estesa;
- asset e selector;
- scan run;
- source record;
- evidence;
- finding;
- recommendation;
- alert;
- report snapshot;
- audit;
- masking e raw evidence controllata.

## Convenzioni

Prima di creare nuove tabelle, Codex deve verificare se nel repository esistono già:

- `customers`
- `profiles`
- `organizations`
- `tenants`
- `assets`
- `scan_runs`
- `reports`

Se esistono, usare FK verso tabelle esistenti.

Gli esempi seguenti assumono una tabella `customers(id uuid primary key)`.

## Estensioni

```sql
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
```

## Enum

```sql
do $$ begin
  create type darkrisk_tier as enum ('standard', 'extended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_source as enum ('surfacescan360', 'intelx', 'openai', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_scan_status as enum ('queued', 'running', 'completed', 'completed_with_warnings', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_asset_type as enum ('domain', 'subdomain', 'url', 'ip', 'cidr', 'email', 'mx', 'ns', 'host', 'service', 'certificate', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_selector_type as enum ('email', 'domain', 'wildcard_domain', 'url', 'ipv4', 'ipv6', 'cidrv4', 'cidrv6', 'phone', 'bitcoin', 'mac', 'ipfs', 'uuid', 'storageid', 'systemid', 'simhash', 'credit_card', 'iban');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_severity as enum ('info', 'low', 'medium', 'high', 'critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_confidence as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_finding_status as enum ('new', 'triaged', 'validated', 'false_positive', 'accepted_risk', 'remediation_in_progress', 'resolved', 'suppressed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type darkrisk_visibility as enum ('customer', 'analyst', 'admin');
exception when duplicate_object then null; end $$;
```

## Entitlements

```sql
create table if not exists darkrisk_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  tier darkrisk_tier not null default 'standard',
  enabled boolean not null default true,
  scan_frequency text not null default 'manual',
  max_intelx_results_per_selector integer not null default 1000,
  enable_phonebook boolean not null default false,
  enable_raw_evidence boolean not null default false,
  enable_ai_recommendations boolean not null default true,
  retention_days integer not null default 365,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id)
);
```

## Asset registry

```sql
create table if not exists darkrisk_assets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  asset_type darkrisk_asset_type not null,
  value text not null,
  normalized_value text not null,
  source darkrisk_source not null default 'manual',
  scope_status text not null default 'approved',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id, asset_type, normalized_value)
);

create index if not exists idx_darkrisk_assets_customer on darkrisk_assets(customer_id);
create index if not exists idx_darkrisk_assets_value on darkrisk_assets(normalized_value);
```

## Selector registry

```sql
create table if not exists darkrisk_selectors (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  asset_id uuid references darkrisk_assets(id) on delete set null,
  selector_type darkrisk_selector_type not null,
  value text not null,
  normalized_value text not null,
  source darkrisk_source not null default 'manual',
  status text not null default 'approved',
  sensitivity text not null default 'normal',
  discovered_from uuid references darkrisk_selectors(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id, selector_type, normalized_value)
);

create index if not exists idx_darkrisk_selectors_customer on darkrisk_selectors(customer_id);
create index if not exists idx_darkrisk_selectors_status on darkrisk_selectors(status);
```

## Scan runs

```sql
create table if not exists darkrisk_scan_runs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  tier darkrisk_tier not null,
  status darkrisk_scan_status not null default 'queued',
  trigger_type text not null default 'manual',
  requested_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  sources jsonb not null default '[]',
  stats jsonb not null default '{}',
  warnings jsonb not null default '[]',
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_scan_runs_customer_created on darkrisk_scan_runs(customer_id, created_at desc);
create index if not exists idx_darkrisk_scan_runs_status on darkrisk_scan_runs(status);
```

## Source records

```sql
create table if not exists darkrisk_source_records (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  scan_run_id uuid not null references darkrisk_scan_runs(id) on delete cascade,
  source darkrisk_source not null,
  asset_id uuid references darkrisk_assets(id) on delete set null,
  selector_id uuid references darkrisk_selectors(id) on delete set null,
  source_record_key text,
  source_system_id text,
  source_storage_id text,
  source_bucket text,
  source_media text,
  source_type text,
  source_score numeric,
  source_date timestamptz,
  source_added_at timestamptz,
  source_simhash text,
  title text,
  description text,
  raw_metadata jsonb not null default '{}',
  safe_preview text,
  preview_hash text,
  created_at timestamptz not null default now(),
  unique(source, source_record_key, scan_run_id)
);

create index if not exists idx_darkrisk_source_records_customer on darkrisk_source_records(customer_id);
create index if not exists idx_darkrisk_source_records_scan on darkrisk_source_records(scan_run_id);
create index if not exists idx_darkrisk_source_records_system_id on darkrisk_source_records(source_system_id);
create index if not exists idx_darkrisk_source_records_simhash on darkrisk_source_records(source_simhash);
```

## Evidence

```sql
create table if not exists darkrisk_evidence (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  scan_run_id uuid not null references darkrisk_scan_runs(id) on delete cascade,
  source_record_id uuid references darkrisk_source_records(id) on delete set null,
  source darkrisk_source not null,
  evidence_class text not null,
  asset_id uuid references darkrisk_assets(id) on delete set null,
  selector_id uuid references darkrisk_selectors(id) on delete set null,
  title text not null,
  summary text,
  masked_value text,
  severity_hint darkrisk_severity not null default 'info',
  confidence darkrisk_confidence not null default 'medium',
  observed_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visibility darkrisk_visibility not null default 'customer',
  contains_sensitive_data boolean not null default false,
  raw_evidence_ref text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_evidence_customer on darkrisk_evidence(customer_id);
create index if not exists idx_darkrisk_evidence_class on darkrisk_evidence(evidence_class);
create index if not exists idx_darkrisk_evidence_observed on darkrisk_evidence(observed_at desc);
```

## Findings

```sql
create table if not exists darkrisk_findings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  scan_run_id uuid references darkrisk_scan_runs(id) on delete set null,
  finding_type text not null,
  title text not null,
  description text,
  affected_asset_id uuid references darkrisk_assets(id) on delete set null,
  affected_selector_id uuid references darkrisk_selectors(id) on delete set null,
  severity darkrisk_severity not null,
  confidence darkrisk_confidence not null default 'medium',
  status darkrisk_finding_status not null default 'new',
  risk_score integer not null default 0 check (risk_score >= 0 and risk_score <= 100),
  risk_dimensions jsonb not null default '{}',
  evidence_ids uuid[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_findings_customer_status on darkrisk_findings(customer_id, status);
create index if not exists idx_darkrisk_findings_customer_severity on darkrisk_findings(customer_id, severity);
create index if not exists idx_darkrisk_findings_type on darkrisk_findings(finding_type);
```

## Recommendations

```sql
create table if not exists darkrisk_recommendations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  finding_id uuid references darkrisk_findings(id) on delete cascade,
  source darkrisk_source not null default 'openai',
  title text not null,
  priority text not null,
  why_it_matters text,
  actions jsonb not null default '[]',
  expected_outcome text,
  confidence darkrisk_confidence not null default 'medium',
  model text,
  prompt_version text,
  output_schema_version text,
  grounded_on_evidence_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_recommendations_customer on darkrisk_recommendations(customer_id);
```

## Alerts

```sql
create table if not exists darkrisk_alerts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  finding_id uuid references darkrisk_findings(id) on delete set null,
  alert_type text not null,
  title text not null,
  message text,
  severity darkrisk_severity not null,
  status text not null default 'open',
  occurred_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_alerts_customer_occurred on darkrisk_alerts(customer_id, occurred_at desc);
```

## Report snapshots

```sql
create table if not exists darkrisk_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  scan_run_id uuid references darkrisk_scan_runs(id) on delete set null,
  tier darkrisk_tier not null,
  title text not null,
  classification text not null default 'confidential',
  status text not null default 'draft',
  report_json jsonb not null,
  html_storage_path text,
  pdf_storage_path text,
  generated_by uuid,
  generated_at timestamptz not null default now(),
  model_metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_reports_customer_generated on darkrisk_report_snapshots(customer_id, generated_at desc);
```

## Audit log

```sql
create table if not exists darkrisk_audit_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_darkrisk_audit_customer_created on darkrisk_audit_log(customer_id, created_at desc);
create index if not exists idx_darkrisk_audit_entity on darkrisk_audit_log(entity_type, entity_id);
```

## Raw evidence references

Non salvare raw evidence in tabelle leggibili dalla UI.

```sql
create table if not exists darkrisk_raw_evidence_refs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  evidence_id uuid not null references darkrisk_evidence(id) on delete cascade,
  storage_provider text not null default 'supabase',
  storage_path text not null,
  encryption_context jsonb not null default '{}',
  sha256 text,
  size_bytes bigint,
  retention_until timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(evidence_id)
);

create index if not exists idx_darkrisk_raw_refs_customer on darkrisk_raw_evidence_refs(customer_id);
```

## Source config

```sql
create table if not exists darkrisk_source_config (
  id uuid primary key default gen_random_uuid(),
  source darkrisk_source not null,
  key text not null,
  value jsonb not null,
  enabled boolean not null default true,
  requires_extended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source, key)
);
```

## RLS

Abilitare RLS su tutte le tabelle.

Esempio:

```sql
alter table darkrisk_assets enable row level security;
alter table darkrisk_selectors enable row level security;
alter table darkrisk_scan_runs enable row level security;
alter table darkrisk_source_records enable row level security;
alter table darkrisk_evidence enable row level security;
alter table darkrisk_findings enable row level security;
alter table darkrisk_recommendations enable row level security;
alter table darkrisk_alerts enable row level security;
alter table darkrisk_report_snapshots enable row level security;
alter table darkrisk_audit_log enable row level security;
alter table darkrisk_raw_evidence_refs enable row level security;
```

Codex deve adattare le policy al sistema auth esistente.

Policy concettuali:

- customer user vede solo dati del proprio cliente;
- customer user non vede raw evidence;
- analyst vede clienti assegnati;
- admin vede tutto;
- service role può scrivere da Edge Function.

## Helper masking

Creare funzioni applicative, non necessariamente SQL, per:

- `maskEmail("name.surname@example.com") -> "n***@example.com"`
- `maskPassword("anything") -> "[REDACTED]"`
- `maskToken("abc...") -> "[TOKEN_REDACTED]"`
- `maskCreditCard("4111111111111111") -> "411111******1111"`
- `maskIban("IT...") -> "IT** **** **** ****"`

## Acceptance criteria

- Migrazione idempotente.
- Nessuna tabella espone password raw.
- Evidence e finding sono separati.
- Ogni finding può referenziare più evidence.
- Report snapshot è immutabile.
- Raw evidence ha retention e audit.
- RLS impedisce accessi cross-customer.

---

<!-- FILE: 04-finding-taxonomy-and-scoring.md -->

<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 04 - Finding Taxonomy and Scoring

## Obiettivo

Definire tassonomia, scoring, deduplica, confidenza e stato dei finding DarkRisk360.

Il finding engine deve trasformare evidenze normalizzate in problemi operativi comprensibili e prioritizzabili.

## Principi

1. Un'evidenza non è sempre un finding.
2. Un finding può derivare da più evidenze.
3. Un finding deve avere severità, confidenza e stato.
4. La parola "compromissione" va usata solo se supportata.
5. Lo score deve essere spiegabile.
6. La ricorrenza cross-dataset aumenta il rischio.
7. La presenza di raw leak non va mostrata al cliente senza mascheramento.
8. Le misconfigurazioni SurfaceScan360 e i leak IntelX devono contribuire a dimensioni diverse dello score.

## Classi finding

### Identity exposure

| Finding type | Descrizione | Default severity |
|---|---|---|
| `credential_leak_confirmed` | Credenziale aziendale rilevata con pattern user/password o evidenza equivalente | critical |
| `credential_leak_possible` | Dominio o email presente in collection, ma credenziale non visibile in preview | high |
| `email_exposure` | Email aziendale esposta in lista, paste, web o dataset | medium |
| `stealer_log_identity` | Email, autofill, cookie o browser artifact in contesto stealer | high |
| `third_party_endpoint_exposure` | Email aziendale trovata in dump di endpoint terzo | medium |
| `credential_reuse_pattern` | Stessa identità o password pattern ricorre in più dataset | critical |
| `sensitive_personal_data_exposure` | Dati personali o autofill sensibili collegati a email aziendale | critical |

### Domain and brand risk

| Finding type | Descrizione | Default severity |
|---|---|---|
| `domain_in_leak_dataset` | Dominio citato in dataset leak o collection | medium |
| `cross_domain_leakage` | Evidenze su domini collaterali o affiliati | high |
| `brand_phishing_indicator` | Evidenza di phishing o impersonation | high |
| `suspicious_lookalike_domain` | Dominio typosquatting o lookalike | high |
| `darknet_reference` | Riferimento in bucket darknet | high |

### Surface exposure

| Finding type | Descrizione | Default severity |
|---|---|---|
| `public_admin_service` | Porta o servizio admin esposto | high |
| `ftp_exposed` | FTP o FTPS esposto pubblicamente | high |
| `ssh_exposed` | SSH esposto pubblicamente | medium |
| `unknown_service_exposed` | Porta non documentata o servizio non classificato | high |
| `default_web_page` | Pagina default server o vhost misconfigurato | medium |
| `outdated_service_version` | Banner o tecnologia obsoleta | high |
| `cve_candidate` | Possibile CVE associata a versione rilevata | high |
| `cohosted_blast_radius` | Più domini sullo stesso host/IP | medium |

### Email security

| Finding type | Descrizione | Default severity |
|---|---|---|
| `dmarc_missing` | Nessun record DMARC | high |
| `dmarc_monitor_only` | DMARC presente con `p=none` | high |
| `spf_too_complex` | SPF con rischio lookup eccessivi o include non governati | medium |
| `dkim_not_verified` | DKIM non verificato o assente | medium |
| `mta_sts_missing` | MTA-STS assente | low |
| `smtp_open_relay_suspected` | Open relay sospetto da validare | critical |
| `smtp_banner_mismatch` | rDNS/banner mismatch | medium |

### DNS, WHOIS and TLS

| Finding type | Descrizione | Default severity |
|---|---|---|
| `dnssec_unsigned` | Zona non firmata DNSSEC | low |
| `domain_expiring_soon` | Dominio in scadenza entro soglia | high |
| `registrar_lock_missing` | Lock trasferimento assente | high |
| `tls_certificate_mismatch` | Certificato non coerente con host | high |
| `tls_expiring_soon` | Certificato in scadenza | high |
| `tls_weak_configuration` | Cipher, protocollo o policy deboli | medium |
| `certificate_ca_true_anomaly` | Certificato server con Basic Constraints anomalo | medium |

### Reputation

| Finding type | Descrizione | Default severity |
|---|---|---|
| `domain_blacklisted` | Dominio in blacklist | critical |
| `ip_blacklisted` | IP in blacklist | high |
| `smtp_reputation_issue` | Problema reputazionale email | high |
| `malware_reputation_indicator` | Indicatori malware su dominio/IP | critical |

## Risk dimensions

Ogni finding deve popolare cinque dimensioni:

```json
{
  "surface_posture": 0,
  "identity_exposure": 0,
  "email_trust": 0,
  "evidence_confidence": 0,
  "freshness_trend": 0
}
```

Range per dimensione: `0-100`.

### surface_posture

Contribuiscono:

- porte esposte;
- servizi admin;
- CVE candidate;
- TLS mismatch;
- co-hosting;
- default page;
- tecnologia obsoleta.

### identity_exposure

Contribuiscono:

- credential leak;
- email exposure;
- stealer log;
- credential reuse;
- dati personali.

### email_trust

Contribuiscono:

- DMARC;
- SPF;
- DKIM;
- MTA-STS;
- MX;
- SMTP relay;
- spoofing risk.

### evidence_confidence

Contribuiscono:

- sorgente;
- xscore;
- preview presente;
- ricorrenza;
- presenza di dati strutturati;
- validazione analyst.

### freshness_trend

Contribuiscono:

- data più recente;
- nuovo rispetto alla scansione precedente;
- aumento occorrenze;
- ricomparsa dopo resolved;
- ricorrenza su dataset recenti.

## Formula base

Implementare una funzione spiegabile:

```ts
type Severity = "info" | "low" | "medium" | "high" | "critical";

const severityBase: Record<Severity, number> = {
  info: 5,
  low: 20,
  medium: 45,
  high: 70,
  critical: 90,
};

export function calculateFindingRiskScore(input: {
  severity: Severity;
  confidence: "low" | "medium" | "high";
  freshnessDays: number | null;
  recurrenceCount: number;
  affectedAssetCriticality: "low" | "medium" | "high";
  isDirectCompromise: boolean;
  isThirdPartyOnly: boolean;
}): number {
  let score = severityBase[input.severity];

  if (input.confidence === "high") score += 5;
  if (input.confidence === "low") score -= 10;

  if (input.freshnessDays !== null) {
    if (input.freshnessDays <= 7) score += 10;
    else if (input.freshnessDays <= 30) score += 6;
    else if (input.freshnessDays <= 180) score += 2;
    else score -= 5;
  }

  if (input.recurrenceCount >= 10) score += 10;
  else if (input.recurrenceCount >= 3) score += 5;

  if (input.affectedAssetCriticality === "high") score += 5;
  if (input.affectedAssetCriticality === "low") score -= 5;

  if (input.isDirectCompromise) score += 10;
  if (input.isThirdPartyOnly) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}
```

## Severity mapping

| Score | Severity |
|---|---|
| 0-19 | info |
| 20-39 | low |
| 40-59 | medium |
| 60-79 | high |
| 80-100 | critical |

## Deduplica

### IntelX

Usare:

- `systemid` come chiave primaria record;
- `storageid` per contenuto;
- `simhash` per similarità;
- `selector_id`;
- `bucket`;
- `date`;
- `added`.

Regole:

1. Stesso `systemid` per stesso cliente non deve creare record duplicato nello stesso scan.
2. Stesso `simhash` e stessa classe evidenza può contribuire a ricorrenza.
3. Stessa email mascherata in più dataset può creare un solo finding aggregato con `recurrence_count`.
4. Stessa credenziale non deve essere mostrata più volte al cliente.
5. Cross-domain leakage deve aggregare domini collegati.

### SurfaceScan360

Usare:

- asset;
- categoria;
- porta;
- protocollo;
- fingerprint;
- CVE;
- record DNS;
- timestamp.

Regole:

- stessa porta aperta già nota aggiorna `last_seen_at`;
- nuova porta genera alert;
- porta chiusa può risolvere finding se confermata da scansioni successive;
- DMARC/SPF/TLS sono finding persistenti finché non risolti.

## Confidenza

| Livello | Criterio |
|---|---|
| low | evidenza indiretta, preview assente, sorgente generica |
| medium | evidenza coerente ma non validata manualmente |
| high | preview coerente, ricorrenza, validazione analyst o sorgente forte |

## Direct vs indirect

Aggiungere metadati:

```json
{
  "compromise_type": "direct|indirect|potential|misconfiguration|unknown",
  "third_party_involved": true,
  "requires_validation": true
}
```

Esempi:

- email in stealer log di endpoint partner: `indirect`
- password aziendale in leak: `potential` o `direct` solo se account confermato
- FTP esposto: `misconfiguration`
- DMARC p=none: `misconfiguration`

## Alert generation

Generare alert quando:

- finding critical nuovo;
- finding high nuovo;
- nuovo credential leak;
- nuovo stealer log;
- nuova porta esposta high;
- peggioramento risk score di almeno 15 punti;
- asset critico entra in stato high/critical;
- report generation fallisce;
- API IntelX esaurisce crediti.

## Acceptance criteria

- Ogni finding ha motivazione e sorgente.
- Lo score è riproducibile.
- Le ricorrenze non gonfiano i conteggi in modo artificiale.
- Le evidenze di terze parti sono distinte da breach diretto.
- La dashboard può filtrare per tipo, severità, confidenza, asset, sorgente e stato.
- Le raccomandazioni si collegano ai finding, non alle evidenze raw.

---

<!-- FILE: 05-openai-recommendation-engine.md -->

<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 05 - OpenAI Recommendation Engine

## Obiettivo

Usare `gpt-4o-mini` per generare testi consulenziali e raccomandazioni operative partendo da finding già normalizzati.

Il modello non deve scoprire finding. Il finding engine scopre finding. OpenAI spiega, prioritizza e trasforma i finding in raccomandazioni leggibili.

## Principi

1. Usare OpenAI solo lato backend.
2. Non inviare password, token, cookie, dump raw o segreti.
3. Usare Structured Outputs con JSON Schema.
4. Validare sempre l'output.
5. Salvare modello, prompt version e schema version.
6. Usare fallback deterministico se OpenAI non risponde.
7. Ogni raccomandazione deve essere collegata a finding ed evidence già persistenti.
8. Nessuna affermazione deve essere generata senza finding di supporto.

## Environment

```bash
OPENAI_API_KEY=
OPENAI_RECOMMENDATION_MODEL=gpt-4o-mini
OPENAI_RECOMMENDATION_PROMPT_VERSION=darkrisk360-reco-v1
OPENAI_RECOMMENDATION_SCHEMA_VERSION=1.0.0
```

## Input payload

Creare payload già bonificato.

```ts
export interface RecommendationInput {
  report_id?: string;
  customer: {
    id: string;
    display_name: string;
    industry?: string;
    tier: "standard" | "extended";
  };
  scan_run: {
    id: string;
    started_at: string;
    completed_at: string;
    sources: string[];
  };
  coverage: {
    domains_count: number;
    selectors_count: number;
    intelx_queries_count: number;
    surfacescan_assets_count: number;
    limitations: string[];
  };
  findings: Array<{
    id: string;
    finding_type: string;
    title: string;
    description: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    confidence: "low" | "medium" | "high";
    risk_score: number;
    risk_dimensions: Record<string, number>;
    affected_asset_masked?: string;
    affected_selector_masked?: string;
    evidence_summary: string[];
    first_seen_at: string;
    last_seen_at: string;
    compromise_type: "direct" | "indirect" | "potential" | "misconfiguration" | "unknown";
    remediation_status: string;
  }>;
  requested_sections: Array<"executive_summary" | "recommendations" | "technical_notes" | "limitations">;
}
```

## Dati vietati nel prompt

Non inviare mai:

- password in chiaro;
- cookie;
- token OAuth;
- session ID;
- dump raw;
- allegati IntelX completi;
- file read raw;
- carta di credito completa;
- IBAN completo;
- codice fiscale completo;
- dati sanitari;
- dati personali non necessari.

## Masking obbligatorio

Esempi:

```ts
maskEmail("mario.rossi@example.com") => "m***@example.com"
maskDomain("example.com") => "example.com"
maskPassword("Qwer1234") => "[PASSWORD_REDACTED]"
maskToken("abc123") => "[TOKEN_REDACTED]"
maskIp("192.0.2.44") => "192.0.2.44"
```

## Output JSON Schema

Creare schema stretto.

```json
{
  "name": "darkrisk360_recommendations",
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["summary", "recommendations", "limitations", "confidence_note"],
    "properties": {
      "summary": {
        "type": "object",
        "additionalProperties": false,
        "required": ["risk_level", "executive_text", "top_drivers", "coverage_note"],
        "properties": {
          "risk_level": {
            "type": "string",
            "enum": ["low", "medium", "high", "critical"]
          },
          "executive_text": {
            "type": "string"
          },
          "top_drivers": {
            "type": "array",
            "items": { "type": "string" },
            "maxItems": 5
          },
          "coverage_note": {
            "type": "string"
          }
        }
      },
      "recommendations": {
        "type": "array",
        "maxItems": 20,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["finding_id", "title", "priority", "why_it_matters", "actions", "expected_outcome", "confidence"],
          "properties": {
            "finding_id": { "type": "string" },
            "title": { "type": "string" },
            "priority": {
              "type": "string",
              "enum": ["immediate", "short_term", "mid_term", "long_term"]
            },
            "why_it_matters": { "type": "string" },
            "actions": {
              "type": "array",
              "items": { "type": "string" },
              "minItems": 1,
              "maxItems": 8
            },
            "expected_outcome": { "type": "string" },
            "confidence": {
              "type": "string",
              "enum": ["low", "medium", "high"]
            }
          }
        }
      },
      "limitations": {
        "type": "array",
        "items": { "type": "string" }
      },
      "confidence_note": {
        "type": "string"
      }
    }
  }
}
```

## System prompt

Usare un prompt simile:

```text
Sei un consulente senior di Cyber Threat Intelligence per HiSolution.
Devi generare raccomandazioni per il modulo DarkRisk360.
Usa solo i finding forniti nel JSON.
Non inventare evidenze.
Non citare password, token, cookie o segreti.
Non dichiarare breach diretto se il campo compromise_type non è direct.
Se l'evidenza è indiretta o di terza parte, esplicitalo.
Scrivi in italiano professionale, chiaro, adatto a CIO, CISO e IT Manager.
Prioritizza remediation concrete e verificabili.
Restituisci solo JSON valido conforme allo schema.
```

## User prompt

```text
Genera executive summary e raccomandazioni operative per questo scan DarkRisk360.
Rispetta il tier indicato.
Per tier standard mantieni sintesi e nessun dettaglio raw.
Per tier extended includi più contesto tecnico, ma senza segreti.
Input JSON:
{{sanitized_payload}}
```

## Service design

Creare servizio backend:

```ts
export async function generateDarkRiskRecommendations(input: RecommendationInput): Promise<RecommendationOutput> {
  const sanitized = sanitizeRecommendationInput(input);
  validateNoSecrets(sanitized);

  const response = await openai.responses.create({
    model: process.env.OPENAI_RECOMMENDATION_MODEL ?? "gpt-4o-mini",
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(sanitized) }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "darkrisk360_recommendations",
        schema: DARKRISK_RECOMMENDATION_SCHEMA,
        strict: true
      }
    }
  });

  const parsed = parseAndValidate(response);
  return parsed;
}
```

Adattare alla versione SDK presente nel repository.

## Fallback deterministic

Se OpenAI fallisce:

- generare raccomandazioni da template;
- loggare errore senza payload sensibile;
- mostrare label `AI unavailable, deterministic recommendation used`.

Esempi template:

| Finding type | Azione |
|---|---|
| `credential_leak_confirmed` | Reset password, revoca sessioni, MFA, audit accessi |
| `dmarc_missing` | Pubblicare DMARC p=none con reporting, poi quarantine/reject |
| `dmarc_monitor_only` | Passare gradualmente a quarantine e reject |
| `ftp_exposed` | Chiudere FTP o limitare con allowlist/VPN, preferire SFTP |
| `ssh_exposed` | Limitare a VPN/bastion, key-only, no password login |
| `tls_certificate_mismatch` | Correggere certificato SAN/SNI e validare redirect HTTPS |
| `stealer_log_identity` | Verificare account, reset, revoca token, awareness endpoint partner |

## Storage output

Salvare in `darkrisk_recommendations`:

- `finding_id`
- `title`
- `priority`
- `why_it_matters`
- `actions`
- `expected_outcome`
- `confidence`
- `model`
- `prompt_version`
- `output_schema_version`
- `grounded_on_evidence_ids`
- `metadata`

## Quality gates

Prima di salvare output:

- validare JSON;
- verificare che ogni `finding_id` esista;
- verificare che nessuna action contenga segreti;
- verificare che il modello non abbia introdotto finding non presenti;
- limitare lunghezza testi;
- salvare `model_metadata`.

## Acceptance criteria

- OpenAI viene chiamata solo server-side.
- Il prompt non contiene raw credentials.
- L'output rispetta JSON Schema.
- Ogni recommendation è legata a finding.
- Esiste fallback deterministic.
- I test includono casi con finding diretto, indiretto e misconfigurazione.

---

<!-- FILE: 06-report-schema-and-generation.md -->

<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 06 - Report Schema and Generation

## Obiettivo

Generare report DarkRisk360 coerenti con la struttura del report DTI esteso esistente, ma alimentati da dati normalizzati.

Il report deve essere prodotto da `ReportSnapshot`, non da chiamate live ai provider.

## Tipologie report

### Standard

Report sintetico per cliente.

Sezioni:

1. Frontespizio
2. Executive summary
3. Perimetro monitorato
4. Copertura controlli
5. KPI rischio
6. Finding principali
7. Evidenze mascherate
8. Raccomandazioni operative
9. Limitazioni e note
10. Appendice asset

### Estesa

Report completo DTI.

Sezioni:

1. Frontespizio
2. Classificazione documento
3. Accordo di servizio e scope
4. OSINT e CLOSINT
5. Standard HiSolution
6. Perimetro concordato
7. Domini collaterali e asset osservabili
8. DNS, WHOIS/RDAP e domain health
9. Email security
10. Provider, hosting e blast radius
11. Porte, servizi, TLS e tecnologie
12. CVE e posture SurfaceScan360
13. Contesto Domain Threat Intelligence
14. Intelligence X results per data source
15. Intelligence X results per file type
16. Identity exposure e credential risk
17. Stealer log e compromissioni indirette
18. Risk assessment
19. Raccomandazioni operative
20. Appendici tecniche
21. Glossario
22. Limitazioni

## Classificazione

Supportare:

- `Pubblico`
- `Privato`
- `Confidenziale`

Default: `Confidenziale`.

Nel report scrivere sempre:

```text
Il presente documento contiene informazioni riservate. Non distribuire a soggetti non autorizzati. Le evidenze sensibili sono mascherate salvo diversa autorizzazione.
```

## Report JSON

Creare una struttura persistente:

```ts
export interface DarkRiskReportJson {
  report_id: string;
  customer_id: string;
  tier: "standard" | "extended";
  classification: "public" | "private" | "confidential";
  generated_at: string;
  generated_by: string;
  scan_run_id: string;
  document_metadata: {
    product_name: string;
    document_type: string;
    status: string;
    version: string;
    owner: string;
    reviewed_by?: string[];
    customer_name: string;
  };
  scope: {
    authorized_assets: string[];
    excluded_assets: string[];
    discovered_candidate_assets: string[];
    limitations: string[];
  };
  executive_summary: {
    risk_level: "low" | "medium" | "high" | "critical";
    risk_score: number;
    text: string;
    top_drivers: string[];
  };
  coverage: {
    surfacescan360: Record<string, unknown>;
    intelx: Record<string, unknown>;
    openai: Record<string, unknown>;
  };
  findings: ReportFinding[];
  recommendations: ReportRecommendation[];
  statistics: {
    by_source: Array<{ source: string; count: number; percentage: number }>;
    by_file_type: Array<{ file_type: string; count: number; percentage: number }>;
    by_severity: Array<{ severity: string; count: number }>;
    by_finding_type: Array<{ finding_type: string; count: number }>;
  };
  appendices: Record<string, unknown>;
}
```

## ReportFinding

```ts
export interface ReportFinding {
  id: string;
  title: string;
  type: string;
  severity: string;
  confidence: string;
  risk_score: number;
  affected_asset: string;
  affected_selector_masked?: string;
  first_seen_at: string;
  last_seen_at: string;
  source_names: string[];
  evidence_summary: string[];
  interpretation: string;
  status: string;
}
```

## ReportRecommendation

```ts
export interface ReportRecommendation {
  finding_id: string;
  priority: "immediate" | "short_term" | "mid_term" | "long_term";
  title: string;
  why_it_matters: string;
  actions: string[];
  expected_outcome: string;
}
```

## Mapping sezioni dal report attuale

Il report esistente contiene sezioni importanti che vanno trasformate in componenti generabili:

| Sezione report esistente | Nuova sorgente dati |
|---|---|
| Perimetro concordato | `darkrisk_assets`, `darkrisk_selectors` |
| Inventario asset osservabili | SurfaceScan360 records |
| DNS, WHOIS/RDAP | SurfaceScan360 records |
| Criticità SPF/DMARC/MX | Finding engine email security |
| Reputation score | SurfaceScan360 + scoring |
| Porte aperte | SurfaceScan360 port records |
| TLS observations | SurfaceScan360 TLS records |
| DTI sintesi evidenze | IntelX source records + findings |
| Results per data source | IntelX bucket aggregation |
| Results per file type | IntelX media/type aggregation |
| Password in chiaro | Non mostrare in chiaro, usare mascheramento |
| Stealer log | Finding `stealer_log_identity` |
| Raccomandazioni | OpenAI + fallback deterministic |

## Mascheramento report

### Standard

- email: mascherata;
- password: sempre `[REDACTED]`;
- token/cookie: sempre `[REDACTED]`;
- raw preview: non inclusa;
- systemid: non mostrato;
- storageid: non mostrato.

### Estesa

- email: visibile solo se policy lo consente;
- password: mai in chiaro nel report cliente;
- token/cookie: mai in chiaro;
- systemid: visibile in appendice analyst;
- storageid: visibile solo in evidence vault, non nel PDF cliente;
- preview: estratto breve e sanitizzato.

## Template executive summary

```markdown
## Executive Summary

L'analisi DarkRisk360 sul perimetro autorizzato del cliente {{customer_name}} ha evidenziato un livello di rischio complessivo {{risk_level}}.

I principali driver di rischio sono:

{{top_drivers}}

La valutazione combina:
- postura infrastrutturale rilevata da SurfaceScan360;
- esposizioni identity e leak rilevate tramite Intelligence X;
- configurazione DNS ed email security;
- freshness e ricorrenza delle evidenze;
- confidenza associata ai finding.

Le raccomandazioni operative sono ordinate per priorità e collegate ai finding rilevati.
```

## Template finding

```markdown
### {{finding.title}}

| Campo | Valore |
|---|---|
| Severità | {{finding.severity}} |
| Confidenza | {{finding.confidence}} |
| Risk score | {{finding.risk_score}} |
| Asset impattato | {{finding.affected_asset}} |
| Prima rilevazione | {{finding.first_seen_at}} |
| Ultima rilevazione | {{finding.last_seen_at}} |
| Stato | {{finding.status}} |

**Interpretazione**

{{finding.interpretation}}

**Evidenze**

{{finding.evidence_summary}}

**Azioni consigliate**

{{recommendation.actions}}
```

## Generazione HTML/PDF

Implementare pipeline:

```text
report_json
  -> renderer markdown/html
  -> HTML sanitizzato
  -> PDF
  -> Supabase Storage
  -> darkrisk_report_snapshots
```

Opzioni tecniche:

- HTML server-side e browser print se ambiente lo supporta;
- servizio serverless con Playwright se disponibile;
- libreria PDF già presente nel repository;
- generazione solo HTML in MVP e PDF in fase successiva.

## Storage

Bucket suggeriti:

```text
darkrisk-reports
darkrisk-evidence-private
```

Policy:

- `darkrisk-reports`: accesso firmato, scadenza link.
- `darkrisk-evidence-private`: solo service role e analyst autorizzati.

## Report versioning

Ogni report deve salvare:

- `report_schema_version`;
- `prompt_version`;
- `model`;
- `scan_run_id`;
- `finding_ids`;
- `recommendation_ids`;
- `generated_at`.

Il report non deve cambiare se i finding successivamente cambiano stato.

## Acceptance criteria

- Report generato da snapshot dati.
- Nessun segreto in chiaro nel report.
- Standard ed Estesa usano stesso schema.
- Estesa ha sezioni aggiuntive.
- Report scaricabile e tracciato.
- Ogni sezione è riproducibile.
- Le raccomandazioni AI sono grounded sui finding.

---

<!-- FILE: 07-ui-ux-flows.md -->

<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 07 - UI and UX Flows

## Obiettivo

Riscrivere la UI DarkRisk360 partendo dal mockup esistente e collegandola a dati reali.

La UI deve essere coerente con HICONSOLE, dark mode e stile cyber enterprise.

## Route suggerite

```text
/customers/:customerId/darkrisk360
/customers/:customerId/darkrisk360/assets
/customers/:customerId/darkrisk360/findings
/customers/:customerId/darkrisk360/identity
/customers/:customerId/darkrisk360/surface
/customers/:customerId/darkrisk360/evidence
/customers/:customerId/darkrisk360/reports
/customers/:customerId/darkrisk360/settings
```

## Layout generale

Header:

- nome modulo: `DarkRisk360`
- sottotitolo: `Monitoraggio minacce, esposizione digitale e Domain Threat Intelligence`
- cliente attivo
- badge tier: `Standard` o `Estesa`
- pulsante `Nuova scansione`
- pulsante `Genera report`
- pulsante `Cambia cliente`

## Overview dashboard

### KPI cards

Sostituire i KPI mock con dati reali:

1. `Minacce attive`
2. `Credenziali leak`
3. `Domini monitorati`
4. `Punteggio rischio`
5. `Ultima scansione`
6. `Copertura controlli`
7. `Finding critici`
8. `Nuovi alert`

Ogni card deve avere:

- valore;
- delta rispetto alla precedente scansione;
- icona;
- colore severity;
- tooltip con spiegazione;
- link al dettaglio filtrato.

### Copertura controlli

Aggiungere sezione:

| Controllo | Stato | Ultima esecuzione | Sorgente |
|---|---|---|---|
| DNS | completato | data | SurfaceScan360 |
| WHOIS/RDAP | completato | data | SurfaceScan360 |
| Email security | completato | data | SurfaceScan360 |
| Porte e servizi | completato | data | SurfaceScan360 |
| Intelligence X dominio | completato | data | IntelX |
| Intelligence X selector | completato | data | IntelX |
| Phonebook | solo Estesa | data | IntelX |

Questo evita che il cliente percepisca il prodotto come vuoto se non ci sono alert.

## Alert recenti

Mantenere stile del mockup, ma con dati reali.

Campi:

- severity;
- titolo;
- asset;
- tipo;
- tempo;
- stato;
- CTA `Vedi finding`.

Esempi di titoli:

- `Nuova evidenza di credential leak per dominio aziendale`
- `Nuova porta amministrativa rilevata`
- `DMARC non in enforcement`
- `Nuovo selector da validare tramite Phonebook`
- `Nuovo risultato IntelX su dominio monitorato`

## Minacce rilevate

La sezione del mockup va trasformata in grouped findings.

Categorie:

- `Credenziali compromesse`
- `Email esposte`
- `Database leak`
- `Stealer log`
- `Phishing e brand abuse`
- `Servizi esposti`
- `Email security`
- `DNS e TLS`
- `Reputation`

Ogni riga mostra:

- icona;
- titolo;
- descrizione;
- conteggio;
- severità;
- trend;
- CTA dettaglio.

## Page: Assets

Tabella asset:

- tipo;
- valore;
- scope status;
- sorgente;
- prima rilevazione;
- ultima rilevazione;
- finding collegati;
- azioni.

Filtri:

- domain;
- subdomain;
- IP;
- URL;
- email;
- candidate asset;
- approved asset.

Per domini collaterali:

- mostrare badge `candidate`;
- richiedere approvazione analyst prima di scansioni profonde.

## Page: Findings

Tabella finding:

- severity;
- risk score;
- title;
- asset;
- finding type;
- confidence;
- status;
- first seen;
- last seen;
- source;
- actions.

Filtri:

- severity;
- status;
- source;
- finding type;
- tier;
- direct/indirect/potential/misconfiguration;
- new since last scan.

Dettaglio finding:

- sintesi;
- timeline;
- evidenze collegate;
- raccomandazioni;
- stato remediation;
- audit.

## Page: Identity

Visibile in Standard con sintesi, Estesa con dettaglio maggiore.

Widget:

- identità impattate;
- domini email;
- ricorrenza dataset;
- stealer log;
- credential reuse risk;
- MFA priority.

La tabella deve mascherare email per utenti cliente se configurato.

Colonne:

- email masked;
- dominio;
- classi evidenza;
- ricorrenza;
- prima vista;
- ultima vista;
- severità;
- stato.

## Page: Surface

Mostrare risultati SurfaceScan360:

- domini;
- IP;
- porte;
- servizi;
- tecnologie;
- CVE candidate;
- TLS;
- email security;
- DNS;
- co-hosting;
- provider.

Componenti:

- tabella porte aperte;
- card email security score;
- tabella DNS issues;
- TLS issues;
- blast radius map semplice.

## Page: Evidence Vault

### Standard

Mostrare solo:

- evidence summary;
- metadata non sensibili;
- preview mascherata se sicura;
- messaggio `Dettaglio raw disponibile solo in modalità Estesa e per ruoli autorizzati`.

### Estesa

Per analyst:

- evidence metadata;
- source;
- system id;
- bucket;
- media;
- type;
- xscore;
- preview;
- reveal request;
- audit reason.

Reveal flow:

1. click `Reveal controlled evidence`;
2. modal con motivo obbligatorio;
3. conferma;
4. audit log;
5. mostra evidenza solo per sessione;
6. non copiare in log.

## Page: Reports

Funzioni:

- lista report;
- stato;
- data generazione;
- tier;
- scan run;
- download;
- rigenera;
- preview HTML.

CTA:

- `Genera report Standard`
- `Genera report Esteso`
- `Scarica PDF`
- `Scarica JSON`

## Page: Settings

Solo admin.

Campi:

- tier;
- enable/disable;
- scan frequency;
- selector max results;
- enable phonebook;
- enable raw evidence;
- retention days;
- notification email;
- scope assets;
- excluded assets.

Non mostrare mai API key in UI.

## Componenti React suggeriti

```text
DarkRiskOverview.tsx
DarkRiskKpiCard.tsx
DarkRiskCoverageMatrix.tsx
DarkRiskRecentAlerts.tsx
DarkRiskThreatGroups.tsx
DarkRiskFindingsTable.tsx
DarkRiskFindingDetailDrawer.tsx
DarkRiskAssetsTable.tsx
DarkRiskIdentityExposure.tsx
DarkRiskSurfaceExposure.tsx
DarkRiskEvidenceVault.tsx
DarkRiskReports.tsx
DarkRiskSettings.tsx
TierBadge.tsx
SeverityBadge.tsx
ConfidenceBadge.tsx
FindingStatusBadge.tsx
```

## UX copy

Evitare allarmismo non supportato.

Usare:

- `Evidenza rilevata`
- `Richiede verifica`
- `Rischio potenziale`
- `Compromissione indiretta`
- `Misconfigurazione`
- `Azione consigliata`
- `Nuovo rispetto all'ultima scansione`

Evitare:

- `sei stato violato`
- `password rubate confermate` senza validazione
- `dark web ha tutto`
- `breach certo` se non provato.

## Empty states

Se nessun finding:

```text
Nessuna minaccia critica rilevata nell'ultima scansione.
Sono stati comunque controllati domini, selector e postura esterna secondo il perimetro autorizzato.
```

Se IntelX non ha risultati:

```text
Nessun risultato IntelX rilevante per i selector approvati in questa scansione.
```

Se SurfaceScan360 non disponibile:

```text
I dati SurfaceScan360 non sono disponibili per questa scansione. Verificare integrazione o rilanciare il job.
```

## Acceptance criteria

- Nessun dato mock hardcoded.
- Dashboard funziona con dati reali e empty state.
- Tier badge condiziona le sezioni.
- Cliente non vede raw evidence.
- Analyst vede workflow di reveal auditato.
- Ogni elemento cliccabile porta al dettaglio filtrato.
- UI mostra copertura e non solo problemi.

---

<!-- FILE: 08-security-governance.md -->

<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 08 - Security and Governance

## Obiettivo

Definire i controlli minimi di sicurezza per DarkRisk360.

Il modulo tratta dati altamente sensibili: leak, credenziali, evidenze da stealer log, preview di file, domini, email e metadati di infrastruttura. Deve essere progettato con sicurezza by design.

## Secrets management

Variabili sensibili:

```bash
INTELX_API_KEY=
OPENAI_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Regole:

- mai nel frontend;
- mai in repository;
- mai nei log;
- mai in localStorage;
- mai restituite da API;
- usare secret manager della piattaforma;
- `.env.example` deve avere solo placeholder.

## RBAC

Ruoli minimi:

| Ruolo | Permessi |
|---|---|
| `customer_viewer` | overview, finding mascherati, report autorizzati |
| `customer_admin` | overview, finding, report, acknowledge |
| `hisolution_analyst` | evidence, reveal controllato, report generation |
| `hisolution_admin` | settings, entitlement, sorgenti, audit |
| `service_role` | job backend e scrittura dati |

## Raw evidence policy

Raw evidence deve essere:

- disabilitata di default;
- disponibile solo su tier Estesa;
- accessibile solo ad analyst autorizzato;
- protetta da audit;
- soggetta a retention;
- mai inviata a OpenAI;
- mai mostrata in report cliente;
- mai salvata nei log.

## Audit obbligatorio

Auditare:

- avvio scan;
- modifica perimetro;
- approvazione selector;
- reveal evidence;
- download report;
- esportazione dati;
- modifica tier;
- modifica retention;
- generazione recommendation AI;
- errori API critici;
- accessi negati.

Campi audit:

- actor;
- customer;
- action;
- entity;
- reason;
- timestamp;
- IP;
- user agent;
- metadata non sensibile.

## Data masking

Mascherare:

- email se vista cliente o policy richiesta;
- password sempre;
- token sempre;
- cookie sempre;
- credit card sempre;
- IBAN sempre;
- codice fiscale sempre;
- dati autofill sensibili sempre, salvo analyst e motivo.

## Logging

Nei log consentiti:

- customer ID;
- scan run ID;
- source;
- status;
- conteggi;
- HTTP status;
- durata;
- error code.

Nei log vietati:

- API key;
- selector sensibili non mascherati se non necessario;
- password;
- token;
- cookie;
- raw preview;
- file content;
- prompt completo se contiene dati sensibili.

## OpenAI governance

Prima di chiamare OpenAI:

- sanitizzare input;
- rimuovere password;
- rimuovere token;
- rimuovere cookie;
- mascherare email se richiesto;
- passare solo finding, summary e metadata;
- validare output;
- salvare prompt version, schema version e modello.

Non inviare mai file raw Intelligence X a OpenAI.

## Intelligence X governance

- Usare solo asset autorizzati.
- Usare selector forti.
- Non fare query generiche.
- Terminare search.
- Limitare rate.
- Rispettare licenza e bucket autorizzati.
- Gestire credits.
- Non esporre link deep detail a cliente se non previsto.
- Cautela con file HTML, Office, ZIP o eseguibili.

## Perimetro e autorizzazione

Ogni cliente deve avere:

- perimetro concordato;
- domini approvati;
- IP/CIDR approvati;
- eventuali domini collaterali;
- esclusioni;
- data autorizzazione;
- riferimento contrattuale o manleva;
- owner interno.

I domini collaterali scoperti non devono essere automaticamente considerati autorizzati.

## Retention

Default suggerito:

| Dato | Retention |
|---|---|
| scan run metadata | 24 mesi |
| source metadata | 12 mesi |
| safe preview | 12 mesi |
| raw evidence | 90 giorni o meno |
| report | secondo contratto |
| audit log | 24 mesi o policy aziendale |

La retention deve essere configurabile per cliente.

## Incident workflow

Quando viene rilevata credenziale o stealer log high/critical:

1. creare finding;
2. creare alert;
3. generare recommendation;
4. notificare analyst;
5. non inviare password in email;
6. suggerire reset password;
7. suggerire revoca sessioni e token;
8. suggerire MFA;
9. tracciare stato remediation.

## Export control

Export consentiti:

- PDF report;
- JSON report snapshot;
- CSV findings mascherati;
- CSV asset;
- evidence export solo analyst.

Ogni export deve avere audit.

## Privacy

Principi:

- minimizzazione dati;
- mascheramento di default;
- accesso su necessità;
- retention limitata;
- no raw data in LLM;
- no email con segreti;
- no screenshot di evidenze sensibili in ticket non protetti.

## Acceptance criteria

- RLS attiva.
- Nessun secret client-side.
- Reveal evidence richiede ruolo e motivo.
- Audit log creato.
- Raw evidence non compare nel report cliente.
- Prompt OpenAI sanitizzato.
- Logs redatti.
- Retention implementabile.

---

<!-- FILE: 09-implementation-roadmap.md -->

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

---

<!-- FILE: 10-test-plan-and-qa.md -->

<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 10 - Test Plan and QA

## Obiettivo

Definire test automatici e controlli QA per DarkRisk360.

## Test strategy

Copertura minima:

- unit test;
- integration test;
- API mock test;
- RLS/security test;
- UI smoke test;
- report snapshot test;
- no-secret regression test.

## Unit test

### Selector validation

Testare:

- email valida;
- dominio valido;
- wildcard domain valido;
- URL valido;
- IPv4;
- IPv6;
- CIDR;
- generic term non valido;
- stringa marketing non valida;
- phone number;
- UUID;
- storage ID;
- system ID.

### Masking

Testare:

- email;
- password;
- token;
- cookie;
- credit card;
- IBAN;
- preview con pattern user:password;
- prompt OpenAI senza segreti.

### Scoring

Testare:

- critical credential leak;
- high stealer log;
- medium third party exposure;
- FTP exposed;
- DMARC missing;
- TLS mismatch;
- risk score bounds 0-100;
- severity mapping.

### Deduplica

Testare:

- stesso systemid;
- stesso simhash;
- stessa email in più dataset;
- stessa porta in due scansioni;
- finding risolto se porta chiusa in scan successive.

## Integration test

### IntelX client mock

Mock endpoint:

- `/intelligent/search`;
- `/intelligent/search/result`;
- `/intelligent/search/terminate`;
- `/file/preview`;
- `/phonebook/search`;
- `/phonebook/search/result`.

Casi:

- successo con status 0 e poi 1;
- status 3 keep trying;
- 401 unauthorized;
- 402 payment required;
- 404 item not found;
- timeout;
- softselectorwarning true;
- preview unavailable.

### SurfaceScan360 fixture

Creare fixture synthetic:

- dominio con DMARC p=none;
- dominio senza DMARC;
- FTP 21 aperto;
- SSH 22 aperto;
- HTTPS con certificate mismatch;
- pagina default Apache;
- porta 8080 aperta;
- DNSSEC unsigned;
- dominio in scadenza.

## Security test

### RLS

Verificare:

- customer A non legge customer B;
- customer non legge raw evidence;
- analyst legge solo clienti assegnati;
- admin legge tutto;
- service role scrive.

### No secret in frontend

Automated check:

- bundle non contiene `INTELX_API_KEY`;
- bundle non contiene `OPENAI_API_KEY`;
- bundle non contiene `SUPABASE_SERVICE_ROLE_KEY`;
- nessuna env server-only importata in componenti React.

### Logs

Testare log redaction:

- API key;
- password;
- token;
- cookie;
- raw preview.

## OpenAI tests

### Schema validation

- output valido;
- output con finding_id inesistente rifiutato;
- output con recommendation senza action rifiutato;
- output con testo troppo lungo rifiutato.

### Grounding

- se finding non contiene breach diretto, recommendation non deve dire "breach confermato";
- se evidence è terza parte, testo deve dire "compromissione indiretta" o equivalente;
- se input è vuoto, output deve indicare evidence insufficiente o nessuna raccomandazione critica.

### Fallback

- OpenAI timeout;
- errore 401;
- errore 429;
- invalid JSON;
- schema mismatch.

## UI tests

Smoke test:

- overview carica;
- KPI mostrano valori;
- empty state funziona;
- tier Standard nasconde evidence raw;
- tier Estesa mostra tab evidence vault per analyst;
- customer non vede reveal;
- report list carica;
- nuova scansione crea scan run.

## Report tests

Snapshot test:

- report Standard contiene sezioni previste;
- report Estesa contiene appendici;
- report non contiene `[PASSWORD_RAW]`;
- report non contiene token/cookie;
- report contiene classification;
- report contiene scan_run_id;
- report contiene generated_at;
- report è riproducibile.

## Synthetic fixture

Creare un cliente fittizio:

```json
{
  "customer": "Cliente Demo DarkRisk360",
  "domains": ["example.com", "example.net"],
  "ips": ["192.0.2.10"],
  "findings": [
    "dmarc_monitor_only",
    "ftp_exposed",
    "tls_certificate_mismatch",
    "credential_leak_possible",
    "stealer_log_identity"
  ]
}
```

Non usare credenziali reali nei test.

## Manual QA checklist

Prima del rilascio:

- [ ] API key non visibile in frontend
- [ ] scan run manuale completato
- [ ] dashboard aggiornata
- [ ] finding generati
- [ ] alert recenti generati
- [ ] report generato
- [ ] customer vede solo dati mascherati
- [ ] analyst reveal auditato
- [ ] OpenAI prompt sanitizzato
- [ ] RLS verificata
- [ ] 401 IntelX gestito
- [ ] 402 IntelX gestito
- [ ] empty state pulito
- [ ] tier Standard ed Estesa verificati

## Performance

Target iniziali:

- overview load sotto 2 secondi con dati già aggregati;
- findings table paginata;
- scan IntelX asincrona;
- nessuna query pesante lato frontend;
- aggregazioni salvate o indicizzate.

## Acceptance criteria

- Test suite eseguibile.
- Fixture senza dati reali.
- Nessun dato sensibile nei test.
- Security test inclusi.
- Report test impedisce leak di password.
- QA checklist completata.