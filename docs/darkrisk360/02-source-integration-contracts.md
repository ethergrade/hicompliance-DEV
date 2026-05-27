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
