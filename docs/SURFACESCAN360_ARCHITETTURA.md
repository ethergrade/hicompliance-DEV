# SurfaceScan360 — Architettura e Funzionamento

> Documento tecnico sul modulo External Attack Surface Management (EASM).
> Motori attivi: DNS Lookup, HTTP Headers, TCP Port Probe, ConnectSecure, Shodan, Subdomain Discovery, CVE Enrichment.
> Aggiornato: 2026-06-25

---

## Indice

1. [Panoramica](#1-panoramica)
2. [Motori attivi](#2-motori-attivi)
3. [Flusso end-to-end](#3-flusso-end-to-end)
4. [Edge Functions](#4-edge-functions)
5. [Database](#5-database)
6. [Integrazioni API esterne](#6-integrazioni-api-esterne)
7. [Scheduling e cron](#7-scheduling-e-cron)
8. [Profili di scansione](#8-profili-di-scansione)
9. [Deduplicazione e scoring](#9-deduplicazione-e-scoring)
10. [Componenti UI](#10-componenti-ui)
11. [Guardrail e rate limiting](#11-guardrail-e-rate-limiting)

---

## 1. Panoramica

SurfaceScan360 è il modulo di **External Attack Surface Management (EASM)** della piattaforma HiCompliance. Aggrega dati da 7 motori di ricognizione, li normalizza in un unico schema relazionale e li presenta come findings con severity, CVE enrichment e score di rischio settimanale.

```
                        ┌─────────────────────────────────────────┐
                        │            surface_scan_jobs             │
                        │  queued → running → completed / failed   │
                        └──────────────────┬──────────────────────┘
                                           │
          ┌────────────┬──────────────┬────┴────────┬─────────────┬──────────────┐
          ▼            ▼              ▼              ▼             ▼              ▼
     DNS Lookup   HTTP Headers   TCP Probe    ConnectSecure   Shodan API    Subdomain
     Scanner      Scanner        Scanner      External Scan   Lookup        Discovery
          │            │              │              │             │              │
          └────────────┴──────────────┴──────────────┴─────────────┴──────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                       ▼
           surface_findings        surface_open_ports       surface_assets
                    │
                    ▼
           cve_enrichment_queue
                    │
                    ▼
           cve_intel_cache (NVD + EPSS + CISA KEV)
```

---

## 2. Motori attivi

### 2.1 DNS Lookup Scanner

Ricognizione passiva DNS. Non genera traffico diretto verso il target.

| Check | Severity se assente/errato |
|-------|---------------------------|
| Record A / AAAA / CNAME / NS / CAA / SOA / DS | info |
| Record MX | info |
| SPF (`v=spf1`) | high se assente; medium se `~all` o `?all` |
| DMARC (`_dmarc.dominio`) | high se assente; medium se policy < reject |
| DKIM (selectors: google, selector1, selector2, default, mail, k1, smtp, protonmail, mimecast) | medium se nessun selector risponde |
| Wildcard certificate | info (badge WILDCARD) |
| DNSSEC | info se DS presente |

**Provider tag:** `dns-lookup`

---

### 2.2 HTTP Headers Scanner

Audit della configurazione HTTP/HTTPS esposta dal target.

| Header | Severity se assente |
|--------|---------------------|
| Content-Security-Policy | high |
| Strict-Transport-Security (HSTS) | high |
| X-Frame-Options | medium |
| X-Content-Type-Options | medium |
| Referrer-Policy | low |
| Permissions-Policy | low |
| Server banner con versione | medium |
| Cookie: HttpOnly / Secure / SameSite | medium |

**Provider tag:** `http-headers`

---

### 2.3 TCP Port Probe

Scansione attiva TCP. Timeout 2500ms per porta.

**Porte critiche (severity critical):**

| Porta | Servizio |
|-------|---------|
| 3389 | RDP |
| 5900 | VNC |
| 6379 | Redis |
| 9200 | Elasticsearch |
| 27017 | MongoDB |
| 11211 | Memcached |
| 2375 | Docker API |
| 10250 | Kubelet |
| 1521 | Oracle DB |
| 1433 | MSSQL |

**Porte a rischio medio:** 21 (FTP), 23 (Telnet), 445 (SMB), 3306 (MySQL), 5432 (PostgreSQL), 8080, 8443, 22 (SSH)

Output: `surface_open_ports` + finding `open_port_exposed` per ogni porta aperta  
**Provider tag:** `tcp-probe`

---

### 2.4 ConnectSecure External Scan

**Pod:** `pod401.myconnectsecure.com` | **Company ID:** `13805`

Integrazione con CyberCNS/ConnectSecure per ricognizione esterna certificata.

**Flusso:**

```
1. POST /w/authorize
   Header: Client-Auth-Token: <base64 token>
   ← { access_token (JWT, TTL 3600s), user_id }

2. Per ogni chiamata successiva:
   Header: Authorization: <access_token>
   Header: X-USER-ID: <user_id>

3. Se il dominio non e' presente nel registry:
   POST /w/company/attack_surface_domain
   Body: { data: { name, domain, scanlater: false, company_id: 13805 } }
   ← { status: true, id: <attack_surface_domain_id> }

4. POST /w/attack_surface/scan_now
   Body: { scan_data: [{ name, domain, company_id: 13805, id }] }
   ← { status: true, message: "Initiated Scan" } — asincrono

5. Poll diretto risultati per attack_surface_domain_id:
   GET /r/company/attack_surface_results?condition=attack_surface_domain_id=X&order_by=updated desc
   ← attendi status="Completed"

6. Quando Completed:
   ← target_ips, subdomains, DNS/mail posture, OSINT, buckets, creds/hashes

7. csMapToFindings() → surface_scan_jobs + surface_scan_module_results + surface_assets + surface_findings + surface_open_ports + observations
```

**Grade CS → Severity finding:**

| Grade | Severity |
|-------|----------|
| F / D | critical |
| C | high |
| B | medium |
| A / A+ | info |

**Provider tag:** `connectsecure`

> Il scan è asincrono. Le chiamate UI/cron triggerano lo scan e l'ingest prosegue in background: il token viene rigenerato a ogni run e su eventuale 401. Ogni run ConnectSecure standalone crea un `surface_scan_jobs` con modulo `connectsecure`, così la GUI SurfaceScan360 legge stato e risultati tramite `scan_job_id`. La vista `/r/company/jobs` resta solo diagnostica, perché ConnectSecure può restituire descrizioni generiche non correlate al dominio.
> `CS_CLIENT_AUTH_TOKEN` puo' contenere il valore base64 gia' pronto per l'header `Client-Auth-Token` oppure la credenziale raw `tenant+client:secret`; l'adapter la normalizza prima di chiamare `/w/authorize`. BFS org corrente e BFS globale usano la stessa priorita': secret globali `CS_*`, poi override per-org, con `enabled=false` come blocco esplicito della singola org.

---

### 2.5 Shodan API

Per ogni IP/dominio nello scope:

```
GET https://api.shodan.io/shodan/host/{ip}
  ← porte aperte, servizi, banner, tech stack, CVE esposte

GET https://api.shodan.io/dns/resolve?hostnames={domain}
  ← risoluzione DNS

GET https://api.shodan.io/shodan/host/search?query=net:{cidr}
  ← sweep CIDR
```

Output: `surface_open_ports` + `surface_web_technologies` + findings per servizi critici esposti

**Attribution scoring:** evita false positives su shared hosting / CDN.

| Campo | Descrizione |
|-------|-------------|
| `score` (0–1) | Confidenza attribuzione |
| `confidence` | low / medium / high |
| `reasons[]` | hostname_match, root_domain_alignment, hosting_dedicated, ecc. |

**Provider tag:** `shodan`

---

### 2.6 Subdomain Discovery

**Trigger:** cron settimanale

Fonti passive combinate:

| Fonte | Metodo |
|-------|--------|
| `crt.sh` | Query certificati SSL/TLS pubblici |
| HackerTarget | Passive DNS API |
| DNS passivo | Reverse lookup, PTR records |

I sottodomini scoperti vengono aggiunti automaticamente a `surface_scan_monitored_ips` (`discovered_via='subdomain_dump'`) e diventano target per il ciclo successivo.

**Limite:** max 15 root domains per ciclo. Skip se già presente negli ultimi 7 giorni.

---

### 2.7 CVE Enrichment Pipeline

Arricchimento post-scan dei CVE trovati nei findings.

```
surface_findings.cve[]
  → (trigger automatico su insert)
  → cve_enrichment_queue

cve-enrichment edge function:
  1. Legge coda (max 50 per run, retry 3x)
  2. GET https://services.nvd.nist.gov/rest/json/cves/2.0?cveIds={id}
     → CVSS v3/v2 score + vector, CWE, descrizione, CPE, referenze
  3. GET https://api.first.org/data/v1/epss?cve={id}
     → EPSS score (0–1) + percentile
  4. Query cisa_kev_catalog
     → is_kev, date_added, due_date, required_action
  5. Upsert cve_intel_cache
```

**Throughput:** ~600 CVE/ora con NVD API key, ~8 CVE/ora senza.

---

## 3. Flusso end-to-end

```
AVVIO (manuale o cron)
    │
    ▼
surface_scan_jobs INSERT (status='queued')
    │
    ▼
dispatchSurfaceScanQueue() — max 3 job contemporanei per org
    │
    ▼
runSurfaceScanEnrichment(job)
    │
    ├── 1. DNS Lookup Scanner
    │       └── INSERT surface_findings (provider='dns-lookup')
    │
    ├── 2. HTTP Headers Scanner
    │       └── INSERT surface_findings (provider='http-headers')
    │
    ├── 3. TCP Port Probe
    │       ├── INSERT surface_open_ports
    │       └── INSERT surface_findings (provider='tcp-probe')
    │
    ├── 4. ConnectSecure External Scan (se abilitato per org)
    │       ├── UPSERT surface_assets
    │       ├── INSERT surface_findings (provider='connectsecure')
    │       └── UPSERT surface_open_ports
    │
    ├── 5. Shodan Lookup
    │       ├── UPSERT surface_open_ports
    │       └── UPSERT surface_web_technologies
    │
    ├── 6. BFS Subdomain Traversal (depth max 10)
    │       └── INSERT surface_scan_jobs figli (status='pending')
    │
    ├── 7. CVE Enqueue
    │       └── INSERT cve_enrichment_queue (trigger automatico da surface_findings.cve)
    │
    └── 8. Scoring + Summary
            ├── Calcolo SurfaceScoreBreakdown
            └── UPDATE surface_scan_jobs SET status='completed', summary={...}

POST-CRON (asincrono):
    cve-enrichment drain
        └── UPSERT cve_intel_cache (CVSS, EPSS, KEV)
```

---

## 4. Edge Functions

| Funzione | Trigger | Azioni principali |
|----------|---------|-------------------|
| `surfacescan360-start-scan` | UI / API manuale | Normalizza target, verifica auth, inserisce job, dispatchQueue |
| `surface-scan-cron` | pg_cron weekly (lun 02:00 Rome) | Subdomain discovery, scope scans, queue dispatch, Shodan, exposure sync |
| `connectsecure-scan` | API manuale + cron async | `scan` (org singola), `weekly_all`; `test_auth` / `diagnose_auth` solo diagnostica admin |
| `cve-enrichment` | API manuale + post-cron | Drain coda CVE → NVD + EPSS + KEV |
| `surfacescan360-monthly-report` | pg_cron monthly (1° mese 05:00 UTC) | Genera report PDF mensili per org |

### connectsecure-scan: azioni disponibili

```json
{ "action": "test_auth", "organization_id": "..." }
// ← { ok: true, user_id: "...", pod_host: "pod401.myconnectsecure.com", global_cfg: true }

{ "action": "diagnose_auth", "organization_id": "..." }
// ← { ok, diagnostic: { config_source, pod_host, company_id, token_present, token_length, token_sha256_prefix, auth_ok, user_id? } }

{ "action": "scan", "organization_id": "..." }
// ← { ok: true, status: "triggered", triggered: N, domains: ["example.com"], background: true }

{ "action": "weekly_all" }
// ← { ok: true, orgs_swept: N, results: [{org_id, triggered, domains, background}] }
```

**Autenticazione:** service-role key | `x-surface-internal-secret` | JWT utente Supabase valido

---

## 5. Database

### Tabelle core

#### `surface_scan_jobs`

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `raw_target` | text | Target originale (dominio o IP) |
| `scan_profile` | enum | `domain_exposure`, `ip_exposure`, `safe_recon`, `cve_api_validation` |
| `status` | enum | `pending`, `queued`, `running`, `completed`, `failed` |
| `summary` | jsonb | Score breakdown + conteggi aggregati |

#### `surface_findings`

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `provider` | text | Motore sorgente (`connectsecure`, `shodan`, `dns-lookup`, `http-headers`, `tcp-probe`) |
| `finding_type` | text | `open_port_exposed`, `vulnerability_detected`, `dns_mail_security`, ecc. |
| `severity` | enum | `critical`, `high`, `medium`, `low`, `info` |
| `cve` | text[] | CVE IDs associati |
| `cvss` | float | CVSS score (popolato da NVD post-enrichment) |
| `cisa_kev` | boolean | Exploited in the wild (CISA KEV) |
| `dedup_fingerprint` | text | SHA256 per deduplicazione cross-scan |
| `occurrence_count` | int | Numero occorrenze rilevate |
| `status` | enum | `open`, `resolved`, `false_positive` |

#### `surface_open_ports`

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `host` | text | Hostname o IP |
| `port` | int | Numero porta |
| `exposure_level` | enum | `critical`, `high`, `medium`, `low`, `info` |
| `raw` | jsonb | Sorgente: `{ source: 'connectsecure' \| 'shodan' \| 'tcp-probe' }` |

#### `surface_assets`

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `asset_type` | enum | `domain`, `subdomain`, `ipv4`, `ipv6` |
| `source` | text | Motore che ha scoperto l'asset |
| `confidence` | enum | `low`, `medium`, `high` |

#### `surface_scan_monitored_ips`

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `input_value` | text | Dominio, IP o CIDR |
| `entry_type` | enum | `domain`, `ip`, `ip_range`, `cidr` |
| `discovered_via` | text | `manual` o `subdomain_dump` |

### Tabelle ConnectSecure

| Tabella | Scopo |
|---------|-------|
| `connectsecure_config` | Credenziali CS per org (pod_host, token, company_id, enabled) |
| `connectsecure_domain_registry` | Mapping dominio → cs_domain_id + depth BFS |

### Tabelle CVE Intelligence

| Tabella | Scopo |
|---------|-------|
| `cve_enrichment_queue` | Coda CVE da arricchire (status: queued / processing / failed) |
| `cve_intel_cache` | Cache CVSS v3/v2, EPSS score, CISA KEV, CWE, references |
| `cisa_kev_catalog` | Catalogo CISA Known Exploited Vulnerabilities |

### Tabelle Report

| Tabella | Scopo |
|---------|-------|
| `surface_scan_history` | Snapshot settimanale score + conteggi per org |
| `surface_scan_monthly_reports` | Report PDF mensili per org |

---

## 6. Integrazioni API esterne

| Servizio | URL base | Auth | Uso |
|----------|----------|------|-----|
| **ConnectSecure** | `https://pod401.myconnectsecure.com` | `Client-Auth-Token` → `Authorization` + `X-USER-ID` | Attack Surface Mapper, scan_now, risultati ASM |
| **NVD 2.0** | `https://services.nvd.nist.gov/rest/json/cves/2.0` | `apiKey` query param (secret: `NVD_API_KEY`) | CVSS v3/v2, CWE, descrizioni CVE |
| **EPSS (FIRST.org)** | `https://api.first.org/data/v1/epss` | nessuna | Exploit Prediction Score per CVE |
| **CISA KEV** | `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json` | nessuna | Catalogo vulnerabilità sfruttate attivamente |
| **Shodan** | `https://api.shodan.io` | `key` query param (secret: `SHODAN_API_KEY`) | Port scan passivo, service detection, CVE esposte |
| **crt.sh** | `https://crt.sh` | nessuna | Subdomain discovery via certificati SSL pubblici |
| **HackerTarget** | `https://api.hackertarget.com` | nessuna | Passive DNS |

---

## 7. Scheduling e cron

### Cron settimanale — `surface-scan-cron`

**Frequenza:** ogni lunedì alle 02:00 Europe/Rome (pg_cron)

Sequenza:

```
1. triggerSubdomainDiscovery()
   → crt.sh + HackerTarget per ogni root domain in scope
   → auto-aggiunge sottodomini a surface_scan_monitored_ips

2. triggerWeeklyClassicScopeScans()
   → Per ogni org: inserisce job (queued) per target non scansionati da 7+ giorni
   → max 15 target per org per run

3. dispatchSurfaceScanQueue(maxToStart=3)
   → Avvia max 3 job contemporanei per org

4. syncExposureFromShodanAssets()
   → Aggiorna surface_open_ports + surface_web_technologies da Shodan

5. triggerWeeklyDarkRiskStandardScan()
   → Trigger scan DarkRisk360 correlato

6. connectsecure-scan { action: 'weekly_all' }
   → External scan su tutte le org con ConnectSecure abilitato

7. cve-enrichment { max_per_run: 50 }
   → Drain coda CVE post-scan
```

### Cron mensile — `surfacescan360-monthly-report`

**Frequenza:** 1° di ogni mese alle 05:00 UTC  
**Output:** PDF report in `surface_scan_monthly_reports`

---

## 8. Profili di scansione

| Profilo | DNS | HTTP | TCP | ConnectSecure | Shodan | Uso tipico |
|---------|-----|------|-----|---------------|--------|-----------|
| `safe_recon` | ✓ | ✓ | ✗ | ✗ | ✗ | Ricognizione passiva, no traffico attivo |
| `domain_exposure` | ✓ | ✓ | ✓ | ✓ | ✓ | Full scan su dominio |
| `ip_exposure` | ✓ | ✗ | ✓ | ✗ | ✓ | Full scan su IP |
| `cve_api_validation` | ✗ | ✗ | ✗ | ✗ | ✗ | Solo validazione CVE via NVD |

---

## 9. Deduplicazione e scoring

### Dedup fingerprint

```
dedup_fingerprint = SHA256(
  provider + finding_type + affected_asset + port + protocol + cve[0]
)
```

Se lo stesso finding riappare: incrementa `occurrence_count`, aggiorna `last_seen_at`.

### Surface Score Breakdown

Punteggio 0–100, media ponderata di:

| Dimensione | Peso | Cosa misura |
|------------|------|-------------|
| `transportScore` | 20% | TLS version, cipher weakness, HSTS |
| `dnsScore` | 15% | SPF/DMARC/DNSSEC presenza e validità |
| `httpSecurityScore` | 15% | Security headers |
| `exposureScore` | 25% | Porte critiche aperte, servizi sensibili esposti |
| `reputationScore` | 10% | Listing DNSBL/spam via Shodan |
| `qualityScore` | 5% | IPv6, CAA record |
| `domainHygieneScore` | 10% | Sottodomini abbandonati, wildcard eccessivi |

**Risk level:**

| Score | Livello |
|-------|---------|
| ≥ 85 | Low |
| 70–84 | Medium |
| 50–69 | High |
| < 50 | Critical |

---

## 10. Componenti UI

| Componente | Visibilità | Funzione |
|------------|-----------|----------|
| `SurfaceScanModuleCards` | tutti | Badge per ogni modulo (stato + conteggi) |
| `SecurityFindings` | tutti | Tabella findings con filtro severity, CVE detail (CVSS, EPSS, KEV badge) |
| `SurfaceScanExposureSection` | tutti | KPI porte/techs, tabella porte aperte |
| `SurfaceScanAlertBanner` | tutti | Cert in scadenza, CVE KEV attivi, nuove porte critiche |
| `SurfaceScanActionItems` | tutti | Top-3 azioni urgenti da findings critici/alti |
| `SurfaceScanMailSecurity` | tutti | Stato SPF/DKIM/DMARC per dominio |
| `SurfaceScanTrendline` | tutti | Grafico score settimanale |
| `SurfaceScanReportRepository` | tutti | Download report mensili PDF |
| `SubdomainDumpPanel` | solo admin | Trigger subdomain discovery manuale, tree view risultati |
| `SubdomainDepthTree` | solo admin | BFS tree visualizzazione depth max 10 |
| `ConnectSecureConfigPanel` | solo admin | Abilita/disabilita ConnectSecure, avvia Attack Surface Mapper in background, sweep globale |
| `SurfaceScanJobsPanel` | solo admin | Tabella job live con status e progress |

**`clientReadOnly`:** utenti cliente vedono findings, porte, score, report. Non vedono pannelli di configurazione, scope management o diagnostica.

Flag calcolato in `SurfaceScan360.tsx`:
```typescript
const { isSales, isSuperAdmin } = useUserRoles();
const clientReadOnly = !isAdminUser && !isSuperAdmin && !isSales;
```

---

## 11. Guardrail e rate limiting

| Limite | Valore | Scopo |
|--------|--------|-------|
| Job concorrenti per org | max 3 | Evita saturazione Supabase |
| Job avviati per cron run | max 3 per org | Distribuzione carico |
| Target per cron run | max 15 root domains | Tempo esecuzione entro finestra cron |
| TCP timeout | 2500ms per porta | Evita hang su porte filtrate |
| HTTP timeout | 15s | Evita timeout edge function |
| CVE per enrichment run | max 50 | Rispetto rate limit NVD |
| CVE retry | max 3 tentativi | Gestione errori transitori NVD |
| Shodan delay (con API key) | 250ms | Rate limit API |
| Shodan delay (senza API key) | 6500ms | Rate limit API |
| NVD delay (con API key) | 250ms | 5 req/30s |
| NVD delay (senza API key) | 6500ms | 5 req/30s |
| Subdomain discovery skip | 7 giorni | Evita riduplica |
| BFS max depth | 10 livelli | Evita esplosione combinatoria |
