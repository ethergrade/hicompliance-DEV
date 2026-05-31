# Codex Prompt - Dashboard e Report DNS Lookup in SurfaceScan360

## Obiettivo UI/UX
Aggiungere alla dashboard SurfaceScan360 un modulo `DNS Posture` semplice da leggere per cliente finale e utile per remediation tecnica.

## Componenti React da creare

```text
src/components/surfacescan/DnsLookupPanel.tsx
src/components/surfacescan/DnsLookupFindingsTable.tsx
src/components/surfacescan/DnsLookupRecordExplorer.tsx
src/lib/surfacescan/dnsLookup.ts
```

## Hook dati
In `src/lib/surfacescan/dnsLookup.ts` creare funzioni:

```ts
export async function fetchDnsLookupResults(scanId: string) {}
export async function fetchDnsLookupFindings(scanId: string) {}
export async function runDnsLookupScan(payload: { scan_id: string; asset_id: string; tenant_id: string; domain: string }) {}
```

Usare `supabase.functions.invoke("dns-lookup-scan", { body: payload })` se il progetto usa già questo pattern.

## Layout dashboard

### Card riepilogo
Titolo: `DNS Posture`

Contenuto:
- grade grande A-F;
- score 0-100;
- badge: SPF, DMARC, CAA, DNSSEC;
- conteggio findings high/medium/low;
- ultimo scan timestamp;
- bottone `Run DNS lookup` solo per ruoli autorizzati.

### Tabs

```text
Overview | Findings | Records | Email Security | Raw Evidence
```

#### Overview
Mostrare:
- dominio;
- resolver;
- A/AAAA/CNAME summary;
- NS summary;
- MX summary;
- score trend se ci sono risultati storici.

#### Findings
Tabella colonne:

```text
Severity | Status | Category | Finding | Evidence | Recommendation
```

Filtri:
- severity;
- status;
- category;
- domain/asset.

#### Records
Accordion per tipo record:

```text
A
AAAA
CNAME
MX
NS
TXT
CAA
SOA
DS
_dmarc TXT
_mta-sts TXT
_smtp._tls TXT
```

Per record TXT lunghi usare collapse/expand e copia in clipboard.

#### Email Security
Mostrare blocchi separati:
- SPF status;
- DMARC status;
- MTA-STS status;
- TLS-RPT status;
- DKIM selector scan se abilitato.

#### Raw Evidence
Mostrare JSON pretty print ma solo ad admin/superadmin se esiste già un sistema ruoli.

## Regole UX
- Non spaventare il cliente con “vulnerabilità critica” quando è solo best practice DNS.
- Usare testo consulenziale:
  - “Da verificare”
  - “Miglioramento raccomandato”
  - “Rischio spoofing email”
  - “Rischio resilienza DNS”
- Evidenziare gli impatti business:
  - phishing/spoofing;
  - deliverability email;
  - continuità DNS;
  - governance certificati TLS;
  - asset discovery più pulita.

## Report SurfaceScan360
Aggiungere una sezione nel report:

```text
DNS Exposure & Email Security Posture
```

Struttura:

```text
Executive summary
- Dominio analizzato
- Score DNS
- Grade
- Principali rischi

DNS inventory
- A/AAAA/CNAME
- MX
- NS
- TXT principali
- CAA
- SOA
- DS

Email security posture
- SPF
- DMARC
- MTA-STS
- TLS-RPT

Certificate policy
- CAA status

DNSSEC posture
- DS status

Remediation plan
- Priorità
- Azione
- Owner suggerito
- Effort stimato
```

## Remediation mapping

| Finding | Priorità report | Owner suggerito | Effort |
|---|---:|---|---:|
| DMARC missing | High | Mail admin / DNS admin | M |
| SPF missing with MX | High | Mail admin / DNS admin | S/M |
| Multiple SPF | High | Mail admin | S |
| SPF +all | High | Mail admin | S |
| SPF >10 lookups | High | Mail admin | M |
| CAA missing | Low | DNS admin | S |
| DS missing | Medium | DNS admin / Registrar | M |
| Single NS | Medium | DNS provider | M |
| Wildcard DNS | Low | DNS/App owner | S |
| Dangling CNAME suspected | Medium/High | DNS/App owner | S/M |

## Acceptance criteria UI/report
- Il modulo si integra con stile shadcn/Tailwind esistente.
- Funziona su mobile e desktop.
- Non blocca il caricamento dashboard se non ci sono ancora risultati DNS.
- Report esporta i finding ordinati per severity.
- Il report non stampa JSON completo nel corpo principale, ma lo mette in appendice.
