# TASK CODEX — SURFACESCAN360 ENGINE ORCHESTRATION + DNSDUMPSTER INTEGRATION

Lavora sul repository SURFACESCAN360.

Obiettivo principale: dobbiamo unificare e orchestrare tutti i motori già presenti in SurfaceScan360, senza duplicarli e senza creare logiche parallele scollegate.

SurfaceScan360 ha già diversi motori implementati o parzialmente implementati, tra cui:

- Shodan
- WebCheck
- PentestTools (che non dovremo mai usare)
- 
- eventuali altri enrichers già presenti nel codice o nei TXT del progetto

Devi controllare tutto il codice esistente e gli allegati txt tutti,, individuare tutti i motori già disponibili e portarli dentro una pipeline unica di orchestrazione.

Non devi creare doppioni di Shodan, WebCheck o altri engine già presenti. Devi adattarli a un contract comune, farli lavorare insieme, deduplicare i risultati, correlare gli asset e mostrare tutto in modo coerente nella dashboard SurfaceScan360 e nel report finale.

## ENV VAR DNSDUMPSTER

Aggiungi questa variabile ambiente:

```env
DNSDUMPSTER_API_KEY=6c77debaf06bc6b79a4f46a3181e9df05d98ac344c741a5330990b2ff6c4ad8e

Nel codice usa sempre:

process.env.DNSDUMPSTER_API_KEY

Non hardcodare la chiave dentro file TypeScript, route, componenti o migration.

DNSDUMPSTER API

Integra DNSDumpster Developer API:

GET https://api.dnsdumpster.com/domain/{domain}
X-API-Key: process.env.DNSDUMPSTER_API_KEY

Gestisci obbligatoriamente:

rate limit: massimo 1 richiesta ogni 2 secondi
risposta 429 con retry/backoff controllato
timeout massimo 10 secondi
fallback non bloccante: se DNSDumpster fallisce, lo scan deve continuare
parsing di DNS records, subdomain, IP, MX, NS, TXT, CNAME, ASN, netblock, country, banner se presenti
salvataggio di source engine, timestamp, evidence e confidence
ARCHITETTURA TARGET

Crea o refactorizza verso un orchestratore centrale.

Struttura consigliata, adattandola al repository esistente:

src/lib/surface/
  orchestrator.ts
  engine-contract.ts
  asset-normalizer.ts
  dedupe.ts
  correlation.ts
  scoring.ts
  evidence.ts
  report-mapper.ts
  engines/
    shodan.ts
    webcheck.ts
    pentesttools.ts
    dnsdumpster.ts
    dns-google.ts
    rdap-whois.ts
    crtsh.ts
    otx.ts
    tor.ts
    ip-geo.ts
    bgp-asn.ts
    cve.ts

Se il repository usa già una struttura diversa, non stravolgere inutilmente. Mantieni la convenzione esistente, ma ottieni comunque un orchestratore unico.

ENGINE CONTRACT UNICO

Tutti i motori, inclusi Shodan e WebCheck già esistenti, devono rispettare un contract comune.

Esempio:

export type SurfaceTargetType =
  | 'domain'
  | 'subdomain'
  | 'ip'
  | 'cidr'
  | 'url'
  | 'asn'
  | 'service'
  | 'technology'
  | 'cve';

export type SurfaceEngineInput = {
  scanId: string;
  target: string;
  targetType: SurfaceTargetType;
  customerId?: string;
  context?: Record<string, unknown>;
};

export type SurfaceEngineResult = {
  engine: string;
  target: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  assets: NormalizedAsset[];
  findings: NormalizedFinding[];
  evidence: NormalizedEvidence[];
  raw?: unknown;
  error?: string;
  durationMs: number;
};

Ogni motore deve restituire asset, findings ed evidence normalizzati.

Non voglio JSON grezzo buttato in dashboard.

PIPELINE DI ORCHESTRAZIONE

Implementa questo flow:

1. Input normalization

Accetta:

domini
sottodomini
IP
CIDR
URL

Normalizza e valida:

root domain
subdomain
public IP
CIDR
URL
rimozione duplicati
blocco SSRF
2. Discovery phase

Esegui i motori adatti al tipo di target:

Per dominio/subdomain:

DNSDumpster
Google DNS
RDAP/WHOIS
Certificate Transparency
WebCheck
OTX domain intelligence
eventuali motori già presenti

Per IP:

Shodan
PentestTools se applicabile
IP Geo / Reputation
BGP / ASN
OTX IP reputation
Tor exit node check
eventuali motori già presenti

Per URL:

WebCheck
Shodan se estraibile IP/host
PentestTools se disponibile
DNS/CT/RDAP sul dominio collegato

Per tecnologia/banner:

CVE Intelligence MITRE/CIRCL
correlazione con servizi pubblici
finding su esposizione o vulnerabilità solo se c’è evidenza
3. Expansion phase

Ogni motore può scoprire nuovi target.

Esempi:

DNSDumpster trova subdomain e IP
crt.sh trova subdomain
Google DNS trova A, AAAA, MX, NS, TXT, CNAME
Shodan trova porte, servizi, tecnologie, banner e CVE
WebCheck trova security headers, DNS info, TLS, redirects, metadata
PentestTools trova porte, tecnologie, vulnerabilità o evidenze
BGP/ASN trova netblock e prefissi

I nuovi asset devono essere inseriti nella queue di orchestrazione, evitando loop infiniti e duplicati.

4. Enrichment phase

Arricchisci ogni asset con:

DNS records
IP pubblici collegati
ASN
netblock
country
provider
hosting/proxy/mobile flag
certificati
subdomain
tecnologie
porte/servizi
CVE
OTX pulse count
Tor exit node
reputation
WHOIS/RDAP metadata
5. Correlation phase

Crea relazioni tra:

Root Domain
  -> Subdomain
    -> IP
      -> ASN
        -> Netblock
      -> Open Service
        -> Technology
          -> CVE
            -> Finding

Ogni relazione deve avere:

source engine
timestamp
confidence
evidence
6. Scoring phase

Calcola:

Surface Exposure Score
External Risk Score
Confidence Score
Severity per finding
Priorità remediation

Regola importante:

Non inventare vulnerabilità. Se manca evidenza tecnica, classifica come exposure o informational.

7. Persist phase

Salva dati parziali anche se uno o più motori falliscono.

Lo scan non deve fallire completamente se DNSDumpster, Shodan, WebCheck o altri engine vanno in errore.

Usa status:

queued
running
completed
partial_failed
failed
SUPABASE DATA MODEL

Controlla le tabelle esistenti. Se mancano campi, crea migration idempotente.

Tabelle minime:

surface_scans
surface_assets
surface_asset_relationships
surface_engine_runs
surface_findings
surface_evidence
surface_report_sections

Ogni surface_engine_runs deve tracciare:

engine_name
target
status
started_at
completed_at
duration_ms
error_message
result_count
quota_cost
raw_summary

Ogni surface_asset deve tracciare:

scan_id
asset_type
value
normalized_value
parent_asset_id
source_engines
first_seen
last_seen
confidence
risk_score
metadata

Ogni surface_finding deve tracciare:

asset_id
title
severity
category
description
evidence
business_impact
recommendation
confidence
source_engines
cve_ids

Mantieni RLS coerente con tenant/customer isolation già presente.

DEDUPE OBBLIGATORIO

Implementa dedupe centrale:

domini lowercase
subdomain lowercase
IP normalizzati
URL normalizzati
stesso IP trovato da Shodan, DNSDumpster, DNS Google e WebCheck deve diventare un asset unico
stesso subdomain trovato da crt.sh, DNSDumpster e WebCheck deve diventare un asset unico
stesso finding non deve essere duplicato se arriva da più motori
source_engines deve diventare array cumulativo

Esempio:

{
  "asset_type": "ip",
  "value": "1.2.3.4",
  "source_engines": ["dnsdumpster", "google_dns", "shodan", "webcheck"]
}
SHODAN

Shodan esiste già: non duplicarlo.

Devi:

individuare il motore Shodan già presente
adattarlo al contract comune
farlo partire su IP e host pubblici
usare i risultati per:
porte aperte
servizi
banner
tecnologie
CVE se presenti
location
ASN
organization
correlare CVE e tecnologie con gli asset
mostrare tutto in dashboard e report
WEBCHECK

WebCheck esiste già: non duplicarlo.

Devi:

individuare il motore WebCheck già presente
adattarlo al contract comune
farlo partire su URL/domain/subdomain
normalizzare output in:
DNS
HTTP info
headers
TLS
redirects
security posture
technologies
metadata
possible findings
non mostrare raw JSON come vista principale
inserire evidenze e finding leggibili
PENTESTTOOLS

PentestTools esiste o è già previsto nel progetto: non duplicarlo.

Devi:

individuare implementazione esistente
adattarla al contract comune
farla partire solo dove appropriato
rispettare quota, costi e rate limit
salvare engine run separato
usare i risultati per porte, tecnologie, vulnerabilità e findings
DASHBOARD SURFACESCAN360

Migliora UI/UX della dashboard SurfaceScan360.

Stile desiderato:

Gotham / Palantir / Darktrace
dark cyber intelligence
ordinata, leggibile, enterprise
non pacchiana
non demo
informazioni dense ma chiare

Sezioni dashboard:

Overview
Attack Surface Map
Assets
Domains & DNS
IP & ASN
Services & Technologies
Threat Intelligence
CVE & Exposure
Findings
Evidence
Engine Health
Report

Cards principali:

Surface Risk Score
Exposure Score
Total Assets
Domains
Subdomains
Public IPs
Open Services
Technologies
CVEs
Critical Findings
High Findings
Engine Coverage
Partial Failures

Componenti richiesti:

filtri per severity
filtri per engine
filtri per asset type
timeline scan
badge engine success/partial/failed
badge confidence
badge severity
tabella asset deduplicata
tabella findings deduplicata
pannello evidence espandibile
raw JSON solo in debug/admin
REPORT SURFACESCAN360

Aggiorna il report finale includendo tutti i dati orchestrati.

Struttura report:

Executive Summary
perimetro
asset totali
score
rischio complessivo
top exposure
top remediation
External Attack Surface
root domain
subdomain
IP pubblici
ASN
netblock
servizi
tecnologie
DNS & Domain Intelligence
DNSDumpster
Google DNS
RDAP/WHOIS
crt.sh
MX/NS/TXT/CNAME
certificate transparency
IP & Network Intelligence
Shodan
BGP/ASN
Geo/Reputation
hosting/proxy/mobile
netblock
Tor exit node
Web & Application Intelligence
WebCheck
headers
TLS
redirects
technologies
exposed panels
weak posture
Vulnerability & CVE Intelligence
CVE correlate
asset impattati
tecnologie
CVSS/severity
references
confidence
Threat Intelligence
OTX pulse count
reputation
suspicious indicators
evidence
Findings
severity
asset
source engines
evidence
business impact
remediation
Appendix
engine execution matrix
raw evidence sintetica
scan timestamps
limiti della scansione
quota/rate limit note
ENGINE HEALTH MATRIX

Aggiungi una matrice nel frontend e nel report:

Engine          Status          Targets          Results          Errors
DNSDumpster     Success         1 domain         27 assets        -
Shodan          Partial         12 IP            8 services       1 timeout
WebCheck        Success         4 URL            22 evidence      -
crt.sh          Success         1 domain         45 subdomains    -
Google DNS      Success         20 hosts         65 records       -
OTX             Success         12 indicators    3 pulses         -
BGP/ASN         Success         8 IP             4 ASN            -
CVE             Partial         9 tech           5 CVE            2 unavailable
SICUREZZA

Obbligatorio:

SSRF guard su target utente
allowlist API esterne note
timeout per engine
rate limit per utente e motore
queue/concurrency limit
Promise.allSettled dove serve
retry/backoff controllato
non loggare API key
non salvare segreti nel DB
non rompere scansioni se un engine fallisce
UX DETTAGLIO FINDING

Ogni finding deve essere leggibile così:

Title: Exposed Remote Access Service
Severity: High
Asset: vpn.example.com / 1.2.3.4
Evidence: Shodan detected port 443 with VPN appliance banner
Source Engines: Shodan, DNSDumpster, Google DNS
Confidence: 88%
Business Impact: Possible external attack path toward remote access infrastructure
Recommendation: Verify exposure, enforce MFA, restrict by IP, patch appliance, monitor logs
CRITERI DI ACCETTAZIONE

La task è completa solo se:

Shodan esistente è orchestrato
WebCheck esistente è orchestrato
PentestTools esistente è orchestrato se presente
tutti gli enrichers TXT sono orchestrati
DNSDumpster è integrato
i motori usano contract comune
gli asset sono deduplicati
i findings sono deduplicati
dashboard mostra dati aggregati e drill-down
report include risultati orchestrati
scan partial_failed funziona
errori engine non bloccano tutto
API key non appare nei log
.env.local contiene DNSDUMPSTER_API_KEY
UI è migliorata in stile Gotham/Palantir/Darktrace
test manuale eseguito su almeno un dominio
OUTPUT RICHIESTO DA CODEX

Alla fine restituisci:

File creati
File modificati
Migration Supabase create/modificate
Env var richieste
Motori trovati nel codice
Motori orchestrati
Nuovo flow scan
Modifiche dashboard
Modifiche report
Test eseguiti
Limiti residui/TODO
NOTA FINALE

Ragiona in modo molto approfondito.

Non fare una semplice integrazione DNSDumpster.

Il vero obiettivo è trasformare SurfaceScan360 in un orchestratore enterprise di external attack surface intelligence, capace di usare tutti i motori esistenti e nuovi in modo armonico, deduplicato, correlato, leggibile e pronto per dashboard e report.
Committa tutto e pusha anche edge sql supabase