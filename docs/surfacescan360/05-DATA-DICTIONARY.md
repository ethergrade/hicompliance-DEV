# 05 - Data dictionary

## Mapping sorgente -> modello -> UI -> report

| Informazione | Campo sorgente tipico | Tabella canonica | UI | Report |
|---|---|---|---|---|
| Dominio root | target/domain | `surface_scan_jobs`, `surface_assets` | Scope, Asset scansionati | Scope |
| Sottodominio | subdomain/hostname | `surface_assets` | Subdomains | Sottodomini |
| IP correlato | target IP/A record | `surface_assets`, `surface_open_ports` | Asset, reverse IP | Porte/asset |
| Porta | port/number | `surface_open_ports.port` | Exposure, Findings | Porte e servizi |
| Protocollo | protocol/transport | `surface_open_ports.protocol` | badge porta | Porta/protocollo |
| Servizio | service/product/version | `surface_open_ports` | dettaglio asset | Servizio |
| Tecnologia web | technology/version | `surface_web_technologies` | Tecnologie | evidenza tecnica |
| Certificato | issuer/subject/expiry | `surface_ssl_results` | Email/TLS | TLS |
| SPF | record/valid/lookups | `surface_observations` | Email/TLS | Postura email |
| DKIM | selectors/valid | `surface_observations` | Email/TLS | Postura email |
| DMARC | record/valid/policy | `surface_observations` | Email/TLS | Postura email |
| Header HTTP | header/value/status | `surface_observations` | Servizi esposti | Sicurezza web |
| Finding | type/title/severity | `surface_findings` | Findings | Vulnerabilita' |
| CVE | cve id | `surface_service_vulnerability_matches`, `cve_intel_cache` | Findings/CVE dialog | Catalogo CVE |
| CVSS | v3/v2 score | `cve_intel_cache` | Findings | Catalogo CVE |
| EPSS | score/percentile | `cve_intel_cache` | Findings | Catalogo CVE |
| KEV | catalog match | `cve_intel_cache`, `cisa_kev_catalog` | Findings | Catalogo CVE |
| Credenziali/hash | count/evidence | `connectsecure_sensitive_data` | accesso ristretto | aggregato mensile |
| Snapshot mensile | weekly aggregates | `surface_scan_monthly_reports` | Reports | report mensile |

## Chiavi di correlazione

| Entita' | Chiave logica |
|---|---|
| Target | organizzazione + target normalizzato |
| Porta | host + IP + porta + protocollo |
| Tecnologia | host + URL + nome + versione |
| Finding | tipo + titolo + asset + IP + porta + CVE + severity |
| Sottodominio | organizzazione + hostname normalizzato |
| Registry ASM | organizzazione + dominio |
| Report mensile | organizzazione + `YYYY-MM` |

## Stati principali

### Job

- `queued`: accodato.
- `running` / `waiting`: in lavorazione o in attesa provider.
- `completed` / `partial`: dati utilizzabili.
- `retry`: recovery pianificata.
- `failed`: esito tecnico fallito; il summary puo' usare `last_good`.

### Sottodominio

- **Scoperto**: presente in `surface_assets`.
- **Accodato**: child job `subdomain_enrichment` queued/waiting.
- **Scansionato**: child job completato con snapshot.

### Vulnerabilita' servizio

- `confirmed`, `candidate`, `unknown`, `rejected` secondo il contratto descritto in `02-CONNECTSECURE-NVD-SUBDOMAIN-SCORING.md`.

## Regole di presentazione

- I provider raw vengono convertiti in etichette neutre o eliminati.
- Un IP e' mostrato nella sezione dedicata solo se almeno un IP valido esiste.
- La lista asset comprende anche target senza porte aperte.
- Grafici porte/tecnologie non vengono renderizzati con dataset vuoto.
- Una porta aperta senza CVE mostra CVSS/EPSS non disponibili, non valori stimati.
- Le evidenze sensibili non entrano nel payload cliente; il mensile usa solo conteggi aggregati.
