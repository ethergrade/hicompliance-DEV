# 01 - Architettura, motori e dati

## Obiettivo

SurfaceScan360 consolida la superficie d'attacco esterna di ogni organizzazione in un modello multi-tenant. Lo scope e' l'autorita': nessun motore deve ampliare autonomamente il perimetro oltre le regole consentite.

## Livelli architetturali

| Livello | Responsabilita' | File principali |
|---|---|---|
| Scope | Domini, IP, range, CIDR, tier standard/esteso | `useSurfaceScanMonitoredIps.ts`, `surfaceScopeGuard.ts` |
| Queue | Job, cooldown, retry, dispatch | `surface_scan_jobs`, `surface-scan-cron` |
| Raccolta | DNS, HTTP, TLS, TCP, OSINT, ASM | `_shared/surface-scan-engine.ts`, `connectsecure-scan`, `shodan-scan` |
| Normalizzazione | Asset, porte, tecnologie, finding, osservazioni | tabelle `surface_*` |
| Intelligence | CPE, CVE, CVSS, EPSS, KEV | `cve-enrichment`, `cisa-kev-sync` |
| Presentazione | latest-per-target, score, UI e report | `surface-exposure-summary`, React, PDF/DOCX |

## Motori canonici

### DNS e sicurezza email

Raccoglie A/AAAA/CNAME/MX/NS/CAA/DS, SPF, DKIM e DMARC. I record vengono normalizzati in `surface_observations`; configurazioni realmente deboli producono `surface_findings`. I dati equivalenti ricevuti dall'ASM esterno confluiscono negli stessi moduli, evitando card duplicate.

### HTTP e redirect

Controlla raggiungibilita', catena redirect, header di sicurezza, cookie e informazioni server. Un controllo non valutabile non equivale a un header assente: errori di rete e timeout restano diagnostica, non falsi finding.

### TLS

Raccoglie certificato, issuer, scadenza, protocolli e cifrari deboli. I risultati canonici vivono in `surface_ssl_results` e nelle osservazioni TLS.

### TCP e servizi esposti

Le porte aperte confluiscono in `surface_open_ports`. Dominio, IP, porta, protocollo, servizio e versione formano l'identita' tecnica usata dal fingerprinting e dalla correlazione CVE. Una porta aperta e' evidenza di esposizione, non prova automatica di vulnerabilita'.

### ConnectSecure Attack Surface Mapper

Esegue ASM asincrono sui domini root/configurati. Restituisce IP target, porte/protocolli, sottodomini, record mail/DNS, header, metadati e finding. L'ingestion crea o aggiorna job e righe canoniche; i dati sensibili hanno una tabella con accesso service-role only.

### OSINT rete pubblica

Arricchisce IP e servizi con banner e informazioni pubbliche. Lo scope guard e l'attribution scoring evitano di attribuire al cliente host condivisi, CDN o reverse DNS non coerenti.

### Subdomain discovery

Le fonti passive e i sottodomini ASM confluiscono in `surface_assets`. Tutti i nomi scoperti sono visibili, ma la scansione automatica interna e' limitata e deduplicata. Il provider esterno non viene richiamato ricorsivamente per ogni sottodominio.

### CVE/NVD/EPSS/KEV

Il servizio rilevato viene convertito in CPE quando vendor/prodotto/versione sono sufficienti. Il match viene validato su NVD, arricchito con EPSS e marcato se presente nel catalogo CISA KEV.

## Stato e snapshot

`surface-exposure-summary` usa `scope_latest_per_target`:

1. Raggruppa i job per target normalizzato.
2. Preferisce il job live per lo stato operativo.
3. Per i dati usa l'ultimo job `completed/partial` valido.
4. Restituisce `snapshot_source=live` oppure `last_good`.
5. Unifica i job exposure interni e ASM esterno.

Questo evita che un job appena accodato azzeri temporaneamente porte e asset gia' acquisiti.

## Organizzazione UI

- **Overview**: KPI sintetici e stato generale.
- **Scope**: perimetro autorizzato e reverse IP correlato.
- **Exposure**: KPI, score, lista completa asset, porte e tecnologie.
- **Servizi esposti**: dettaglio normalizzato delle evidenze tecniche.
- **Subdomains**: scoperti, accodati, scansionati e profondita'.
- **Findings**: esposizioni, vulnerabilita' e correlazioni CVE.
- **Email/TLS**: postura SPF/DKIM/DMARC e certificati.
- **Reports**: repository scan e mensili.
- **Live**: stato tecnico dei job per operatori.

Le sezioni senza dati vengono nascoste quando secondarie. Gli asset restano invece sempre elencati: un risultato senza porte e' informazione valida.

## Guardrail

- Normalizzazione hostname/IP prima di dedupe.
- Cooldown per organizzazione + target.
- Queue con batch limitati.
- Profondita' sottodomini massima 10.
- Esclusione shared-hosting/noise con motivazione.
- Segreti letti soltanto da Edge Functions.
- RLS su tutte le tabelle pubbliche e grant Data API espliciti.
