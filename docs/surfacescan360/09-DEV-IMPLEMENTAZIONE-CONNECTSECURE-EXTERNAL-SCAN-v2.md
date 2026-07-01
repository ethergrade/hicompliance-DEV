# 09 - DEV: Implementazione ConnectSecure External Scan in SurfaceScan360

Ultimo aggiornamento: 1 luglio 2026  
Destinatario: DEV SurfaceScan360  
Scopo: implementare **External Scan** come motore orchestrato dentro SurfaceScan360, con UI e report completi, deduplica cross-engine, CVE/EPSS/KEV canonici e remediation plan operativo.

---

## 0. Decisione di prodotto

Implementare ConnectSecure **External Scan** come nuovo modulo di raccolta esterna dentro SurfaceScan360.

Regole non negoziabili:

1. Il nome ConnectSecure può esistere solo in backend/log tecnici sanitizzati, mai in UI cliente e mai nei report cliente.
2. La UI deve mostrare etichette neutre: `External Endpoint`, `External Exposure Scan`, `External Remediation Plan`, `External Asset`.
3. I dati devono confluire nel modello canonico SurfaceScan360: `surface_assets`, `surface_open_ports`, `surface_ssl_results`, `surface_observations`, `surface_findings`, `surface_service_vulnerability_matches`, `cve_intel_cache`.
4. Ogni porta aperta è esposizione, non CVE automatica.
5. Ogni CVE deve passare da normalizzazione + enrichment SurfaceScan360: NVD/CVSS, FIRST EPSS, CISA KEV.
6. I risultati dei diversi motori devono essere deduplicati per chiave logica, non renderizzati come card duplicate.
7. Remediated, suppressed e auto-suppressed devono essere salvati e visibili in tab dedicati, ma non devono aumentare il rischio operativo di default.
8. External Scan deve essere il motore attivo principale per le verifiche esterne, con arricchimenti solo da DNS/HTTP/TLS interni, ASM esistente, Shodan e pipeline CVE canonica.

---

## 1. API ConnectSecure da usare

Dallo Swagger fornito, i path corretti sono con `report_queries`, non `report/queries`.

### 1.1 Configurazione target / External Endpoint

Usare `discovery_settings` come configurazione remota dell'endpoint esterno.

| Operazione | Metodo | Path | Uso |
|---|---:|---|---|
| Lista endpoint/config | GET | `/r/company/discovery_settings` | recupera configurazioni esistenti |
| Dettaglio endpoint/config | GET | `/r/company/discovery_settings/{id}` | legge una configurazione |
| Crea endpoint/config | POST | `/w/company/discovery_settings` | crea endpoint remoto |
| Aggiorna endpoint/config | PATCH | `/w/company/discovery_settings` | aggiorna endpoint remoto |
| Cancella endpoint/config | DELETE | `/d/company/discovery_settings/{id}` | elimina endpoint remoto solo se richiesto |

Campi disponibili nello Swagger per `discovery_settings`:

```ts
type CsDiscoverySetting = {
  id?: number;
  name: string;
  address_type: string;
  address: string;
  mac_address?: string;
  ignore_ports?: string[];
  scan_later?: boolean;
  is_excluded?: boolean;
  manual_tags?: Record<string, unknown>;
  discovery_settings_type?: string;
  mac_address_exclude?: string;
  target_ip?: string;
  custom_profile_id?: number;
  old_profile_id?: string;
  company_id: number;
  tenantid?: number;
  validate_ip?: string;
  created?: string;
  updated?: string;
};
```

### 1.2 Profili scan

Usare `custom_profile` solo se il provider richiede un `custom_profile_id` specifico per Quick/Detailed/Deep.

| Operazione | Metodo | Path | Uso |
|---|---:|---|---|
| Lista profili | GET | `/r/company/custom_profile` | recupera profili disponibili |
| Dettaglio profilo | GET | `/r/company/custom_profile/{id}` | legge profilo |
| Crea profilo | POST | `/w/company/custom_profile` | solo se serve creare profili gestiti |
| Aggiorna profilo | PATCH | `/w/company/custom_profile` | solo manutenzione |
| Cancella profilo | DELETE | `/d/company/custom_profile/{id}` | non usare in runtime standard |

Campi utili:

```ts
type CsCustomProfile = {
  id?: number;
  name: string;
  protocols?: string;
  profile_type?: string;
  profile_value?: string;
  nse_scripts?: string[];
  custom_profile_type?: string;
  is_global?: boolean;
  company_id?: number;
  tenantid?: number;
};
```

Mapping SurfaceScan360:

| UI SurfaceScan360 | Valore interno | Uso |
|---|---|---|
| Quick Scan | `quick` | default settimanale |
| Detailed Scan | `detailed` | per clienti estesi/manuale; dagli screenshot: copre circa le prime 3500 porte IANA / circa 94% risk profile |
| Deep Scan | `deep` | disabilitato di default; solo tenant esteso + conferma manuale |

Creare una tabella locale `connectsecure_external_scan_profiles` per mappare i profili SurfaceScan360 ai `custom_profile_id` remoti, senza hardcodare ID nel codice.

### 1.3 Avvio scan

Avviare lo scan con:

```http
POST /w/company/external_scan
X-USER-ID: <user_id>
Authorization: Bearer <access_token>
Content-Type: application/json
```

Body Swagger:

```json
{
  "company_id": 123,
  "discovery_settings": [456]
}
```

Note operative:

- `company_id` deve essere il `CS_COMPANY_ID`/remote company id del tenant ConnectSecure.
- `discovery_settings` è array di ID remoti creati/recuperati da `/r|/w/company/discovery_settings`.
- La risposta contiene `status` e `message`, non un vero `scan_id`; quindi il nostro registry deve tracciare il job locale e poi pollare i report query per asset aggiornati.

### 1.4 Read-side / report queries da importare

Importare i dati da questi endpoint, con pagination `skip` + `limit` e filtro `condition` quando possibile.

| Priorità | Metodo | Path | Dati principali da importare |
|---:|---:|---|---|
| P0 | GET | `/r/report_queries/external_asset_externalscan` | asset esterni, host, IP, grade, conteggi severity, `vul_count` |
| P0 | GET | `/r/report_queries/external_asset_ports_data` | porte, protocollo, servizio, prodotto, extrainfo, status |
| P0 | GET | `/r/report_queries/external_asset_vulnerabilities` | coppie `key/value` di vulnerabilità per asset |
| P0 | GET | `/r/report_queries/asset_critical_vulnerabilities` | CVE/vulnerabilità critiche con CVSS/EPSS/exploitability/impact |
| P1 | GET | `/r/report_queries/external_asset_ssl_ciphers` | host, IP, porta, versione TLS/SSL, grade cipher |
| P1 | GET | `/r/report_queries/external_asset_ssl_attack` | problemi SSL/TLS, `problem_name`, status |
| P1 | GET | `/r/report_queries/remediation_plan_by_company` | remediation aggregate per prodotto/solution |
| P1 | GET | `/r/asset/get_asset_remediation_plan` | remediation per asset con asset_ids, porte, evidence |
| P1 | GET | `/r/report_queries/remediation_plan_asset_epss_details` | conteggio bucket EPSS |
| P1 | GET | `/r/report_queries/remediation_plan_asset_details_by_epss` | dettaglio asset per bucket EPSS |
| P2 | GET | `/r/report_queries/get_remediation` | remediation dettagliate per asset/company |
| P2 | GET | `/r/report_queries/suppressed_problems` | problemi soppressi |
| P2 | GET | `/r/report_queries/resolved_remediation` | remediation risolte |

La UI e i report devono consumare i dati normalizzati SurfaceScan360, non questi payload raw.

---

## 2. Database da creare/modificare

Creare una migrazione:

```text
supabase/migrations/<timestamp>_connectsecure_external_scan_orchestration.sql
```

### 2.1 `surface_external_endpoints`

Configurazione cliente gestita da SurfaceScan360.

```sql
create table if not exists public.surface_external_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  address_type text not null check (address_type in ('static_ip', 'domain', 'ip_range')),
  address_value text not null,
  normalized_target text not null,
  scan_profile text not null default 'quick' check (scan_profile in ('quick', 'detailed', 'deep')),
  enabled boolean not null default true,
  schedule text not null default 'weekly',
  remote_company_id text,
  remote_discovery_setting_id text,
  remote_custom_profile_id text,
  last_scan_job_id uuid,
  last_scan_at timestamptz,
  next_scan_at timestamptz,
  last_status text,
  last_grade text,
  last_vul_count integer default 0,
  last_critical_count integer default 0,
  last_high_count integer default 0,
  last_medium_count integer default 0,
  last_low_count integer default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, normalized_target, scan_profile)
);

create index if not exists idx_surface_external_endpoints_org_enabled
  on public.surface_external_endpoints (organization_id, enabled, next_scan_at);

create index if not exists idx_surface_external_endpoints_remote
  on public.surface_external_endpoints (remote_discovery_setting_id);
```

RLS:

- `select`: utenti della stessa organizzazione.
- `insert/update/delete`: solo admin/org operator autorizzati.
- `remote_*` visibili in UI solo se utente interno/admin globale; in UI cliente non mostrarli.

### 2.2 `connectsecure_external_scan_registry`

Registry tecnico service-role only.

```sql
create table if not exists public.connectsecure_external_scan_registry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  external_endpoint_id uuid references public.surface_external_endpoints(id) on delete cascade,
  surface_scan_job_id uuid references public.surface_scan_jobs(id) on delete set null,
  remote_company_id text,
  remote_discovery_setting_id text,
  remote_external_asset_ids text[] default '{}',
  remote_status text,
  last_remote_payload_hash text,
  last_started_at timestamptz,
  last_polled_at timestamptz,
  completed_at timestamptz,
  poll_attempts integer not null default 0,
  error_sanitized text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_endpoint_id, surface_scan_job_id)
);

alter table public.connectsecure_external_scan_registry enable row level security;
```

Policy: nessuna lettura/scrittura Data API. Solo service role dentro Edge.

### 2.3 `connectsecure_external_scan_profiles`

Mapping profili Surface -> custom profile ConnectSecure.

```sql
create table if not exists public.connectsecure_external_scan_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  profile_key text not null check (profile_key in ('quick', 'detailed', 'deep')),
  remote_custom_profile_id text,
  remote_profile_name text,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_key)
);
```

Se `organization_id` è null, è mapping globale.

### 2.4 `surface_remediation_actions`

Serve per organizzare perfettamente il remediation plan in UI/report senza duplicare finding.

```sql
create table if not exists public.surface_remediation_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source text not null default 'external_scan',
  solution_id text,
  remediation_key text not null,
  product text,
  title text not null,
  fix text,
  fix_script jsonb not null default '[]'::jsonb,
  url text,
  remediation_action text,
  severity text,
  epss_max numeric,
  epss_bucket text,
  is_patchable boolean,
  critical_count integer default 0,
  high_count integer default 0,
  medium_count integer default 0,
  low_count integer default 0,
  total_count integer default 0,
  affected_assets_count integer default 0,
  affected_asset_ids text[] default '{}',
  affected_service_keys text[] default '{}',
  affected_cves text[] default '{}',
  workflow_status text not null default 'open',
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  evidence_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, remediation_key, workflow_status)
);

create index if not exists idx_surface_remediation_actions_org_status
  on public.surface_remediation_actions (organization_id, workflow_status, severity, epss_bucket);
```

`workflow_status` valori ammessi: `open`, `remediated`, `suppressed`, `auto_suppressed`.

---

## 3. Edge Functions da modificare

### 3.1 File backend

Modificare o aggiungere:

```text
supabase/functions/connectsecure-scan/index.ts
supabase/functions/_shared/connectsecure-adapter.ts
supabase/functions/_shared/surface-scan-engine.ts
supabase/functions/_shared/surface-dedupe.ts              # nuovo
supabase/functions/_shared/external-scan-mapper.ts        # nuovo
supabase/functions/surfacescan360-start-scan/index.ts
supabase/functions/surfacescan360-run-enrichment/index.ts
supabase/functions/surface-scan-cron/index.ts
supabase/functions/surface-exposure-summary/index.ts
supabase/functions/cve-enrichment/index.ts
supabase/functions/surfacescan360-ai-report/index.ts
supabase/functions/surfacescan360-monthly-report/index.ts
```

### 3.2 Nuove action `connectsecure-scan`

Aggiungere queste action:

```ts
type ConnectSecureAction =
  | 'diagnose_auth'
  | 'test_auth'
  | 'scan'                         // ASM già esistente
  | 'poll_pending'                 // da estendere ASM + external
  | 'external_endpoint_upsert'
  | 'external_scan_start'
  | 'external_scan_poll'
  | 'external_scan_import_reports';
```

Contratto action:

```ts
type ExternalEndpointUpsertRequest = {
  action: 'external_endpoint_upsert';
  organization_id: string;
  name: string;
  address_type: 'static_ip' | 'domain' | 'ip_range';
  address_value: string;
  scan_profile: 'quick' | 'detailed' | 'deep';
  enabled?: boolean;
};

type ExternalScanStartRequest = {
  action: 'external_scan_start';
  organization_id: string;
  external_endpoint_id: string;
  triggered_by: 'manual' | 'weekly' | 'retry';
};

type ExternalScanPollRequest = {
  action: 'external_scan_poll';
  organization_id?: string;
  job_id?: string;
  max_jobs?: number;
};
```

### 3.3 Adapter ConnectSecure

Aggiungere wrapper senza rompere l'ASM esistente.

```ts
export async function csListDiscoverySettings(session: CsSession, params: QueryParams) {
  return csGetPaginated<CsDiscoverySetting>(session, '/r/company/discovery_settings', params);
}

export async function csCreateDiscoverySetting(session: CsSession, data: CsDiscoverySetting) {
  return csFetch(session, '/w/company/discovery_settings', {
    method: 'POST',
    body: { data },
  });
}

export async function csUpdateDiscoverySetting(session: CsSession, id: number, data: Partial<CsDiscoverySetting>) {
  return csFetch(session, '/w/company/discovery_settings', {
    method: 'PATCH',
    body: { id, data },
  });
}

export async function csStartExternalScan(session: CsSession, companyId: number, discoverySettingIds: number[]) {
  return csFetch(session, '/w/company/external_scan', {
    method: 'POST',
    body: {
      company_id: companyId,
      discovery_settings: discoverySettingIds,
    },
  });
}

export async function csReportExternalAssets(session: CsSession, params: QueryParams) {
  return csGetPaginated<CsExternalAssetRow>(session, '/r/report_queries/external_asset_externalscan', params);
}

export async function csReportExternalPorts(session: CsSession, params: QueryParams) {
  return csGetPaginated<CsExternalPortRow>(session, '/r/report_queries/external_asset_ports_data', params);
}

export async function csReportExternalVulnerabilities(session: CsSession, params: QueryParams) {
  return csGetPaginated<CsExternalVulnerabilityRow>(session, '/r/report_queries/external_asset_vulnerabilities', params);
}

export async function csReportAssetCriticalVulnerabilities(session: CsSession, params: QueryParams) {
  return csGetPaginated<CsCriticalVulnerabilityRow>(session, '/r/report_queries/asset_critical_vulnerabilities', params);
}

export async function csReportExternalSslCiphers(session: CsSession, params: QueryParams) {
  return csGetPaginated<CsExternalSslCipherRow>(session, '/r/report_queries/external_asset_ssl_ciphers', params);
}

export async function csReportExternalSslAttack(session: CsSession, params: QueryParams) {
  return csGetPaginated<CsExternalSslAttackRow>(session, '/r/report_queries/external_asset_ssl_attack', params);
}
```

`csGetPaginated` deve:

1. usare `limit=500` default;
2. incrementare `skip` finché `data.length === limit`;
3. fare retry con backoff su 429/5xx;
4. su 401: reauthorize una sola volta;
5. non loggare query con token/header.

---

## 4. Orchestrazione esatta

### 4.1 Creazione endpoint dalla UI

Flusso:

```text
UI External Endpoints
  -> surfacescan360-start-scan oppure connectsecure-scan action external_endpoint_upsert
  -> normalizzazione target
  -> surfaceScopeGuard
  -> upsert surface_external_endpoints
  -> authorize ConnectSecure
  -> find/create discovery_settings remoto
  -> salva remote_discovery_setting_id
```

Validazioni:

| Tipo | Validazione obbligatoria |
|---|---|
| `static_ip` | IP pubblico valido, non RFC1918, dentro scope autorizzato |
| `domain` | dominio o sottodominio ammesso dallo scope autorizzato |
| `ip_range` | CIDR valido, dimensione entro limite tenant, interamente autorizzato |

Deep scan:

- bloccare se `organization.external_deep_scan_enabled !== true`;
- bloccare in scheduling settimanale standard;
- consentire solo manuale con audit log.

### 4.2 Start manuale

```text
UI Run now
  -> insert surface_scan_jobs(scan_type='external_scan', status='queued')
  -> surfacescan360-run-enrichment prende il job
  -> connectsecure-scan.external_scan_start
  -> POST /w/company/external_scan
  -> job status = waiting_provider
  -> registry poll_attempts = 0
```

### 4.3 Polling

Estendere `poll_pending` già esistente:

```text
connectsecure-result-poller ogni minuto
  -> prendi max 5 job ASM + external_scan waiting_provider/running/retry
  -> per external_scan:
       - authorize
       - leggi external_asset_externalscan aggiornati
       - per ogni asset_id leggi ports/vulns/ssl/remediation
       - normalizza/upsert canonico
       - se import completo: completed
       - se dati parziali ma utili: partial
       - se timeout/provider error: retry o failed
```

Heuristica completamento:

- se `/w/company/external_scan` non restituisce scan id, considerare completato quando:
  1. esiste almeno un asset report con `updated >= job.started_at - 5min` oppure `created >= job.started_at - 5min`;
  2. ports/vulnerabilities/ssl queries rispondono per gli `asset_id` trovati;
  3. non ci sono variazioni di hash payload per 2 poll consecutivi;
- timeout soft: 30 minuti -> `partial` se ci sono dati;
- timeout hard: 60 minuti -> `failed` se zero dati;
- mai cancellare ultimo snapshot valido.

### 4.4 Scheduling settimanale

Estendere `surface-scan-cron`:

```text
surface-scan-weekly-monday
  -> scope settimanale esistente
  -> external_endpoints enabled=true
  -> next_scan_at <= now() OR last_scan_at is null
  -> max 3 endpoint per org per ciclo
  -> max 20 globali per ciclo
  -> max 1 external_scan running per org
  -> crea job external_scan quick/detailed
  -> NON creare deep scan automatico
```

Cooldown:

```text
organization_id + normalized_target + scan_profile + scan_type='external_scan'
min cooldown = 24h
```

---

## 5. Orchestrazione con gli altri motori SurfaceScan360

External Scan non deve duplicare gli altri motori; deve arricchire il modello canonico.

### 5.1 Ordine motori raccomandato per scan manuale completo

```text
1. Scope guard
2. DNS / HTTP / TLS interni leggeri
3. ConnectSecure External Scan start
4. Poll/import External Scan
5. Shodan enrichment su IP pubblici trovati
6. CVE enrichment canonical: NVD + FIRST EPSS + CISA KEV
7. surface-exposure-summary refresh
8. report refresh
```

### 5.2 Policy cross-engine

| Evidenza | Motore primario | Motori secondari | Regola |
|---|---|---|---|
| Asset/host/IP | Scope + External Scan | ASM esistente, DNS, Shodan | upsert `surface_assets`, no duplicati |
| Porta aperta | External Scan | ASM esistente, Shodan | upsert `surface_open_ports` via `service_key` |
| Banner/prodotto/versione | External Scan | Shodan, HTTP/TLS interno | scegliere fingerprint più completo e più fresco, conservare sorgenti |
| TLS/cipher | TLS interno + External SSL | Shodan | unificare in `surface_ssl_results` + observations |
| HTTP header | HTTP interno | External finding | no doppio conteggio TLS/header + porta |
| CVE | CVE enrichment | provider hint External Scan | CVE canonica solo dopo enrichment |
| Remediation | External remediation + regole SurfaceScan360 | CVE enrichment / KEV / EPSS | dedupe per remediation_key |

### 5.3 Quando non rilanciare motori

- Non lanciare motori attivi aggiuntivi in questa feature: External Scan è l'unico motore attivo esterno orchestrato per questa implementazione.
- Se target è IP range grande, lasciare il controllo attivo a External Scan e applicare batch/cooldown solo sull'orchestrazione External Scan.
- Se Shodan ha dato banner vecchi, non deve sovrascrivere dati freschi External Scan o HTTP/TLS interno.
- Se un provider restituisce CVE ma non servizio/prodotto/versione, registrare come `candidate`, non `confirmed`.

---

## 6. Deduplica obbligatoria

Creare helper:

```text
supabase/functions/_shared/surface-dedupe.ts
```

### 6.1 Chiavi canoniche

```ts
function targetKey(orgId: string, normalizedTarget: string) {
  return `${orgId}|${normalizedTarget.toLowerCase()}`;
}

function assetKey(orgId: string, host?: string, ip?: string) {
  const h = normalizeHostname(host ?? '');
  const i = normalizeIp(ip ?? '');
  return `${orgId}|${h || '-'}|${i || '-'}`;
}

function serviceKey(orgId: string, host: string | null, ip: string | null, port: number, protocol: string) {
  const h = normalizeHostname(host ?? '');
  const i = normalizeIp(ip ?? '');
  const p = String(port);
  const proto = normalizeProtocol(protocol);
  return `${orgId}|${h || '-'}|${i || '-'}|${p}|${proto}`;
}

function findingKey(input: {
  orgId: string;
  findingType: string;
  serviceKey?: string;
  assetKey?: string;
  cveId?: string;
  title?: string;
}) {
  return sha256([
    input.orgId,
    normalizeFindingType(input.findingType),
    input.serviceKey ?? input.assetKey ?? '-',
    normalizeCve(input.cveId ?? ''),
    normalizeTitle(input.title ?? ''),
  ].join('|'));
}

function remediationKey(row: {
  solutionId?: string | number;
  product?: string;
  fix?: string;
  url?: string;
  remediationAction?: string;
}) {
  if (row.solutionId) return `solution:${row.solutionId}`;
  return sha256([
    normalizeTitle(row.product ?? ''),
    normalizeTitle(row.fix ?? ''),
    normalizeUrl(row.url ?? ''),
    normalizeTitle(row.remediationAction ?? ''),
  ].join('|'));
}
```

### 6.2 Upsert porte

Regola:

```text
unique service = organization_id + host/ip + port + protocol
```

Quando arriva la stessa porta da più motori:

- una sola riga in `surface_open_ports`;
- `first_seen` non cambia;
- `last_seen` si aggiorna;
- `metadata.sources[]` aggiunge/aggiorna sorgente;
- `confidence` aumenta se più motori confermano;
- `product/version` si aggiornano solo se il nuovo fingerprint è più completo o più fresco.

Fonte priority per fingerprint:

```text
connectsecure_external_scan > connectsecure_asm > internal_http_tls > shodan > unknown
```

### 6.3 Upsert finding

Regola:

```text
unique finding = finding_key
```

Deduplicare:

- stesso CVE su stessa porta/servizio;
- stesso SSL problem su stesso host:porta;
- stesso remediation item applicabile a più asset: va in `surface_remediation_actions` con lista asset, non come 100 card duplicate.

### 6.4 Stati workflow

Mapping:

| ConnectSecure/UI | SurfaceScan360 |
|---|---|
| Remediation Plan | `open` |
| Remediated | `remediated` |
| Suppressed Remediation | `suppressed` |
| Auto Suppressed | `auto_suppressed` |

Regola score:

- `open`: conta nel rischio.
- `remediated`: non conta nel rischio attuale; appare nello storico/report.
- `suppressed`: non conta nel rischio default; appare in tab dedicato e report appendix.
- `auto_suppressed`: non conta nel rischio default; appare in audit/admin e appendix.

---

## 7. CVE, CVSS, EPSS, KEV e indicatori

### 7.1 Estrazione CVE

Estrarre CVE da questi campi:

| Endpoint | Campi |
|---|---|
| `/r/report_queries/external_asset_vulnerabilities` | `key`, `value` |
| `/r/report_queries/asset_critical_vulnerabilities` | `vul_id`, `id`, `name` |
| `/r/report_queries/get_remediation` | `product`, `fix`, `asset_id`, `port`, eventuali CVE nel testo |
| `/r/report_queries/suppressed_problems` | `problem_name`, `description`, `software_name`, `port` |
| `/r/report_queries/resolved_remediation` | `product`, `fix`, `url`, `solution_id` |

Regex:

```ts
const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;
```

Normalizzare uppercase e deduplicare.

### 7.2 Match states

Usare questi stati in `surface_service_vulnerability_matches`:

| Stato | Quando usarlo |
|---|---|
| `confirmed` | CVE + servizio/prodotto/versione/CPE coerenti o provider row asset-specific + enrichment confermato |
| `candidate` | CVE presente ma prodotto/versione non sufficienti |
| `unknown` | porta/prodotto senza CVE determinabile |
| `rejected` | CPE esatto controllato e CVE non applicabile |

### 7.3 Enrichment canonico

Per ogni CVE:

1. inserire/aggiornare `cve_enrichment_queue`;
2. `cve-enrichment` aggiorna `cve_intel_cache` con:
   - `cvss_v3_score`, `cvss_v3_vector`, `severity`;
   - `epss_score`, `epss_percentile` da FIRST;
   - `kev=true/false` da CISA KEV;
   - `cwe`, references, published/modified;
3. collegare CVE a servizio in `surface_service_vulnerability_matches`.

Il valore EPSS restituito da ConnectSecure (`epss_score`) si salva come evidence provider, ma il valore mostrato in UI/report deve essere quello canonico `cve_intel_cache.epss_score`, salvo fallback esplicitamente marcato.

### 7.4 EPSS categorization UI

Implementare card identica al concetto degli screenshot, ma alimentata da dati canonici:

| Bucket | Label UI | SLA consigliato |
|---|---|---|
| `>= 0.95` | `>= 0.95` | Remediate within 3 days |
| `0.90-0.95` | `0.90-0.95` | Remediate within 15 days |
| `0.85-0.90` | `0.85-0.90` | Remediate within 30 days |
| `0.00-0.85` | `0.00-0.85` | Remediate at your own schedule |

Ogni bucket deve avere:

- conteggio CVE/finding open;
- conteggio asset impattati;
- severità massima;
- bottone `View` che apre tabella filtrata;
- export nel report.

### 7.5 Indicatori da mostrare

In tabella vulnerabilità mostrare:

```text
CVE ID
Titolo/problema
Asset/host/IP
Porta/protocollo
Servizio/prodotto/versione
Severity canonica
CVSS base score
EPSS score
EPSS percentile
EPSS bucket
KEV sì/no
Exploitability score provider, se presente
Impact score provider, se presente
First discovered
Last discovered
Status workflow
Remediation action
Fix
URL/reference
Source confidence
```

---

## 8. Mapping report queries -> tabelle SurfaceScan360

### 8.1 External asset inventory

Endpoint:

```http
GET /r/report_queries/external_asset_externalscan
```

Campi:

```text
id, config_name, name, host_name, ip, grade, critical, high, medium, low, vul_count, created, updated
```

Mapping:

| Campo provider | Tabella Surface | Campo Surface |
|---|---|---|
| `id` | `surface_assets.metadata` | `external_asset_id` |
| `config_name` | `surface_assets.metadata` | `external_config_name` |
| `name` | `surface_assets` | `display_name` o metadata |
| `host_name` | `surface_assets` | `hostname` |
| `ip` | `surface_assets` | `ip_address` / metadata |
| `grade` | `surface_assets.metadata` + summary | `external_grade` |
| `critical/high/medium/low` | endpoint snapshot | counts |
| `vul_count` | endpoint snapshot | total vuln count |
| `created/updated` | evidence | first/last provider time |

### 8.2 Ports and services

Endpoint:

```http
GET /r/report_queries/external_asset_ports_data
```

Campi:

```text
asset_id, port, protocol, service, product, extrainfo, status, total_count
```

Mapping:

| Campo provider | Tabella Surface | Campo Surface |
|---|---|---|
| `asset_id` | `surface_open_ports.metadata` | `external_asset_id` |
| `port` | `surface_open_ports.port` | integer |
| `protocol` | `surface_open_ports.protocol` | normalized tcp/udp |
| `service` | `surface_open_ports.service_name` | normalized service |
| `product` | `surface_open_ports.product` | product |
| `extrainfo` | `surface_open_ports.metadata` | banner/extrainfo |
| `status` | `surface_open_ports.status` | open/closed/filtered normalized |

### 8.3 SSL/TLS ciphers

Endpoint:

```http
GET /r/report_queries/external_asset_ssl_ciphers
```

Campi:

```text
asset_id, host_name, ip, port, version, grade
```

Mapping:

- `surface_ssl_results` per host/ip/port;
- `surface_observations` per cipher/grade evidence;
- `surface_findings` solo se grade/protocol indica debolezza reale.

### 8.4 SSL/TLS attacks/problems

Endpoint:

```http
GET /r/report_queries/external_asset_ssl_attack
```

Campi:

```text
asset_id, problem_name, status
```

Mapping:

- `surface_observations` sempre;
- `surface_findings` se `status` indica problema attivo/open;
- dedupe con TLS interno per stesso `host:port + problem_name`.

### 8.5 Vulnerabilities

Endpoint:

```http
GET /r/report_queries/external_asset_vulnerabilities
GET /r/report_queries/asset_critical_vulnerabilities
```

Campi principali:

```text
asset_id, key, value
vul_id, id, ip, name, host_name, severity, base_score, impact_score, epss_score, exploitability_score,
discovered, last_discovered_time, port, critical_problems, software_name, company_id, tags, manual_tags
```

Mapping:

- `surface_findings` per finding vulnerabilità;
- `surface_service_vulnerability_matches` per CVE-servizio;
- `cve_enrichment_queue` per enrichment canonico;
- `cve_intel_cache` per CVSS/EPSS/KEV finale.

### 8.6 Remediation plan

Endpoint principali:

```http
GET /r/report_queries/remediation_plan_by_company
GET /r/asset/get_asset_remediation_plan
GET /r/report_queries/get_remediation
GET /r/report_queries/remediation_plan_asset_epss_details
GET /r/report_queries/remediation_plan_asset_details_by_epss
```

Campi principali:

```text
solution_id, os_name/os_type, fix, fix_script, url, product, epss_vuls,
remediation_action, is_patchable, severity,
critical_problems, high_problems, medium_problems, low_problems, total_problems,
asset_ids, affected_assets, install_source, ports, patch_status, view_evidence,
evidence, unconfirmed, online/offline/unknown assets
```

Mapping:

- `surface_remediation_actions` per azione aggregata;
- `surface_findings.remediation` per finding collegato;
- `workflow_status='open'` per Remediation Plan.

### 8.7 Remediated / Suppressed

Endpoint:

```http
GET /r/report_queries/suppressed_problems
GET /r/report_queries/resolved_remediation
```

Mapping:

- `surface_findings.workflow_status='suppressed'` o `remediated`;
- `surface_remediation_actions.workflow_status='suppressed'` o `remediated`;
- salvare `suppression_status`, `suppressed_till`, `remediated_on`, `remediation_closer_reason`, `resolution_days` in `evidence_summary`/metadata.

---

## 9. UI SurfaceScan360 da implementare

### 9.1 Area configurazione: External Endpoints

Aggiungere componente:

```text
src/components/surface-scan/ExternalEndpointsPanel.tsx
```

Campi form:

```text
Name *
Address Type *: Static IP | Domain | IP Range
Address Value *
Scan Profile *: Quick Scan | Detailed Scan | Deep Scan
Enabled
Run now
```

Regole UI:

- Deep Scan nascosto o disabled se tenant non abilitato.
- Mostrare messaggio su Detailed Scan: `Covers top 3500 IANA ports / higher coverage`.
- Validare formato prima del submit.
- Se target fuori scope: errore chiaro e nessun job remoto.

Tabella endpoint:

```text
Name
Type
Target
Profile
Enabled
Last scan
Next scan
Status
Grade
Critical
High
Medium
Low
Total vulnerabilities
Actions: Run now, Edit, Disable, View results
```

### 9.2 Risultati: organizzazione UI

Non creare un prodotto parallelo. Integrare nelle sezioni SurfaceScan360 esistenti.

#### Overview / Exposure KPI

Aggiungere KPI:

```text
External endpoints configured
External endpoints scanned
External assets discovered
Open ports
Critical / High / Medium / Low findings
CVE with EPSS >= 0.95
KEV known exploited
Remediation open
Remediated
Suppressed
```

#### Scope

Mostrare gli endpoint autorizzati come parte dello scope:

```text
External Endpoints
- Domain / Static IP / IP Range
- scan profile
- enabled/disabled
- schedule
```

#### Exposure / Asset inventory

Tabella asset esterni normalizzati:

```text
Asset
Host name
IP
Endpoint source
Grade
Open ports
Vulnerabilities
Critical/High/Medium/Low
First seen
Last seen
Snapshot source
```

#### Servizi esposti

Tabella deduplicata cross-engine:

```text
Host/IP
Port
Protocol
Service
Product
Version/Extra info
Status
Sources
Confidence
CVE count
Last seen
Remediation status
```

`Sources` deve mostrare badge neutri o tecnici solo in admin:

- Cliente: `External scan`, `Network enrichment`, `Web check`.
- Admin: `connectsecure_external_scan`, `connectsecure_asm`, `shodan`, `http_tls`.

#### Vulnerability Intelligence

Tabella filtrabile:

```text
CVE / Problem
Severity
CVSS
EPSS
EPSS bucket
KEV
Exploitability
Impact
Asset
Port
Product
Status
Remediation
First seen
Last seen
```

Filtri:

```text
Severity
EPSS bucket
KEV only
Open only
Remediated
Suppressed
Source
Asset
Port
```

#### EPSS Categorization

Implementare card come screenshot:

```text
EPSS Categorization
>= 0.95        Remediate within 3 days
0.90-0.95      Remediate within 15 days
0.85-0.90      Remediate within 30 days
0.00-0.85      Remediate at your own schedule
```

Ogni riga ha bottone `View` e apre dialog/lista CVE.

#### Remediation Plan

Tabs:

```text
Remediation Plan
Remediated
Suppressed Remediation
Auto Suppressed
```

Tab `Remediation Plan` mostra solo `workflow_status='open'`.

Tabella:

```text
Priority
Product / Component
Remediation action
Fix summary
Affected assets
Affected ports
Critical/High/Medium/Low
Max EPSS
KEV count
Patchable
Evidence
Status
```

Azione `View` apre dettaglio:

```text
Affected assets
CVE list
Ports
Evidence
Fix
Reference URL
Source observations
```

#### TLS / SSL

Aggiungere sezione in Email/TLS o Servizi esposti:

```text
TLS / SSL External Evidence
Host
IP
Port
Version
Grade
Weak cipher / SSL attack problem
Status
Finding linked
```

### 9.3 Report UI

Nella pagina Reports aggiungere:

```text
External Exposure Report included: yes/no
External endpoints covered
Last external scan date
External scan completeness: completed/partial/last_good
```

---

## 10. Report PDF/DOCX/AI/mensile

Aggiornare:

```text
src/lib/surfaceScan360PdfReport.ts
src/lib/surfaceScan360DocxReport.ts
supabase/functions/surfacescan360-ai-report/index.ts
supabase/functions/surfacescan360-monthly-report/index.ts
src/lib/surfacescan/reportVisibility.ts
```

### 10.1 Struttura report scan

Ordine sezioni:

1. Executive summary.
2. Scope autorizzato e External Endpoints configurati.
3. Postura complessiva e Exposure Score V3.
4. Asset esterni rilevati.
5. Porte e servizi esposti deduplicati.
6. Vulnerability Intelligence: CVE, CVSS, EPSS, KEV.
7. EPSS Categorization e SLA remediation.
8. Remediation Plan operativo.
9. TLS/SSL findings e cipher evidence.
10. Remediated/Suppressed appendix.
11. Delta rispetto al precedente scan.
12. Note metodologiche senza nomi provider.

### 10.2 Tabelle report obbligatorie

#### External Endpoints

```text
Name | Type | Target | Profile | Last scan | Status | Grade | Vuln count
```

#### Open Ports

```text
Host/IP | Port | Protocol | Service | Product | Source count | CVE count | Severity
```

#### CVE/EPSS/KEV

```text
CVE | Asset | Port | Product | CVSS | Severity | EPSS | EPSS bucket | KEV | Remediation
```

#### Remediation Plan

```text
Priority | Product | Action | Affected assets | CVE count | Max EPSS | KEV | Fix
```

#### TLS/SSL

```text
Host | IP | Port | Version | Grade | Problem | Status
```

### 10.3 Visibilità report

- Non mostrare `ConnectSecure`, `CyberCNS`, `pod401`, path API, remote ids, raw payload.
- Non mostrare sezioni vuote.
- Se scan è `partial`, mostrare nota: `Partial scan: last valid data shown where available`.
- Gli endpoint senza porte restano visibili come asset con `No open ports detected`.
- Suppressed e auto-suppressed solo in appendix, non nel remediation plan principale.

---

## 11. Acceptance criteria tecnici

### 11.1 Backend

```bash
deno check supabase/functions/connectsecure-scan/index.ts
deno check supabase/functions/_shared/connectsecure-adapter.ts
deno check supabase/functions/surface-exposure-summary/index.ts
deno check supabase/functions/cve-enrichment/index.ts
npm run test:deno
npm run check
npm run qa:no-secrets
```

### 11.2 Database smoke

```sql
select id, organization_id, name, address_type, normalized_target, scan_profile, enabled, last_scan_at, next_scan_at
from public.surface_external_endpoints
order by created_at desc
limit 20;

select scan_type, status, count(*)
from public.surface_scan_jobs
where scan_type = 'external_scan'
group by scan_type, status;

select organization_id, remote_status, count(*)
from public.connectsecure_external_scan_registry
group by organization_id, remote_status;

select host, ip, port, protocol, service_name, product, version, metadata->'sources' as sources
from public.surface_open_ports
where metadata::text ilike '%external_scan%'
order by updated_at desc
limit 50;

select cve_id, match_status, count(*)
from public.surface_service_vulnerability_matches
group by cve_id, match_status
order by count(*) desc
limit 50;
```

### 11.3 Scenari obbligatori

1. Static IP autorizzato + Quick Scan:
   - crea endpoint;
   - crea remote discovery setting;
   - start scan;
   - importa asset/ports;
   - UI mostra asset e porte.

2. Dominio autorizzato + Detailed Scan:
   - crea endpoint;
   - detailed profile corretto;
   - risultato in asset/porte/finding;
   - no label provider in UI/report.

3. IP Range autorizzato:
   - validazione CIDR;
   - batch limit;
   - no scan fuori scope.

4. Target fuori scope:
   - blocco prima della chiamata provider;
   - audit log;
   - zero remote scan.

5. Stessa porta da External Scan + ASM/Shodan/HTTP-TLS interno:
   - una riga `surface_open_ports`;
   - `metadata.sources` contiene le sorgenti;
   - score V3 conta una sola volta.

6. CVE presente nel provider:
   - CVE estratta;
   - coda enrichment;
   - CVSS/EPSS/KEV canonici;
   - finding deduplicato.

7. Porta senza CVE:
   - finding `internet_exposed_service`;
   - nessuna CVE inventata;
   - stato fingerprint `unknown` se mancano vendor/prodotto/versione.

8. EPSS buckets:
   - conteggi corretti;
   - View filtra tabella;
   - report include SLA.

9. Remediated/Suppressed:
   - import correttamente mappato;
   - tab dedicati;
   - rischio default non aumenta.

10. Report:
   - PDF/DOCX includono External Endpoints, open ports, CVE/EPSS/KEV, Remediation Plan, TLS/SSL;
   - non contengono provider/raw payload;
   - nessuna sezione vuota.

---

## 12. Sequenza di sviluppo consigliata

### Sprint 1 — Read-side importer e dedupe

1. Creare migrazione DB.
2. Implementare adapter report queries.
3. Implementare `external_scan_import_reports` leggendo dati già presenti.
4. Implementare mapper asset/ports/vuln/ssl/remediation.
5. Implementare dedupe `surface-dedupe.ts`.
6. Popolare `surface_*` e validare summary.

Deliverable: dati External Scan già visibili in SurfaceScan360 senza ancora avviare scan remoto.

### Sprint 2 — Start scan e endpoint management

1. Implementare UI External Endpoints.
2. Implementare upsert discovery setting remoto.
3. Implementare start scan con `/w/company/external_scan`.
4. Implementare polling esteso.
5. Aggiornare status endpoint/job.

Deliverable: Run now funzionante.

### Sprint 3 — CVE/EPSS/KEV e remediation plan

1. CVE extractor cross-field.
2. Queue `cve_enrichment`.
3. UI Vulnerability Intelligence.
4. UI EPSS Categorization.
5. UI Remediation Plan tabs.

Deliverable: CVE/EPSS/KEV/remediation organizzati in UI.

### Sprint 4 — Report e monthly

1. PDF/DOCX.
2. AI report.
3. Monthly report.
4. QA no provider/raw payload.
5. Delta previous scan.

Deliverable: report cliente completo.

---

## 13. Definition of Done

La feature è completa solo quando:

- External Endpoints sono configurabili da UI.
- Quick/Detailed/Deep sono gestiti con policy tenant.
- `/w/company/external_scan` viene orchestrato con job SurfaceScan360.
- I report queries ConnectSecure vengono importati e normalizzati.
- Asset, porte, SSL, CVE, remediation sono in tabelle canoniche.
- Dedupe cross-engine funziona.
- CVSS/EPSS/KEV arrivano dal flusso canonico SurfaceScan360.
- EPSS Categorization è visibile in UI e report.
- Remediation Plan, Remediated, Suppressed, Auto Suppressed sono tab distinti.
- PDF/DOCX/AI/mensile includono tutte le info utili.
- Nessun provider/raw payload/token appare in UI/report/log.
- Tutti i test e smoke passano.

