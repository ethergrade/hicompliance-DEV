# Codex Master Plan - Porting DNS Lookup Scanner in SurfaceScan360

## Obiettivo
Integrare un modulo DNS Lookup Scanner dentro SurfaceScan360, prendendo ispirazione dal progetto didattico `PROJECTS/beginner/dns-lookup` del repo `CarterPerez-dev/Cybersecurity-Projects`, ma trasformandolo in un componente production-ready per HiCompliance / SurfaceScan360.

Il modulo deve:
- scansionare record DNS pubblici di domini nel perimetro autorizzato;
- normalizzare record A, AAAA, CNAME, MX, NS, TXT, CAA, SOA, DS;
- eseguire controlli email security su SPF, DMARC, MTA-STS, TLS-RPT;
- eseguire controlli certificate policy su CAA;
- eseguire controlli DNSSEC tramite record DS;
- generare score, grade, findings e remediation;
- salvare risultati in Supabase;
- mostrarli nella dashboard SurfaceScan360;
- includerli nel report PDF/HTML/MD SurfaceScan360.

## Prima di modificare codice
Codex deve prima ispezionare il repo attuale e trovare la struttura reale di SurfaceScan360.

Cerca nel repository:

```bash
rg -i "SurfaceScan|surface scan|SurfaceScan360|shodan|web-check|pentest|scan_job|scan_results|report" src supabase
rg -i "supabase.functions.invoke|functions/v1|report|pdf|jspdf|html2canvas" src supabase
find supabase/functions -maxdepth 2 -type f | sort
find supabase/migrations -maxdepth 1 -type f | sort
```

Non creare duplicati se esistono già:
- tabelle scan jobs;
- tabelle findings;
- Edge Functions di orchestrazione SurfaceScan360;
- componenti dashboard già dedicati ai moduli Shodan, PentestTools, WebCheck.

## Architettura raccomandata

```text
SurfaceScan360 scan job
  -> asset domain autorizzato
  -> Edge Function dns-lookup-scan
  -> DNS resolver DoH o Deno.resolveDns
  -> normalized records + findings + score
  -> Supabase tables
  -> dashboard widgets
  -> report section
```

## File da aggiungere o modificare

Aggiungere:

```text
supabase/functions/dns-lookup-scan/index.ts
supabase/functions/_shared/dnsLookupScanner.ts
supabase/migrations/YYYYMMDDHHMMSS_add_surface_dns_lookup_results.sql
src/components/surfacescan/DnsLookupPanel.tsx
src/components/surfacescan/DnsLookupFindingsTable.tsx
src/components/surfacescan/DnsLookupRecordExplorer.tsx
src/lib/surfacescan/dnsLookup.ts
```

Modificare, solo se esistono:

```text
src/pages/SurfaceScan360.tsx
src/components/surfacescan/SurfaceScanDashboard.tsx
src/components/surfacescan/SurfaceScanReport.tsx
src/lib/surfacescan/reportBuilder.ts
supabase/functions/surface-scan-orchestrator/index.ts
```

## Regole di sicurezza
- Eseguire lookup solo su asset presenti nel perimetro del cliente.
- Non permettere input libero non autorizzato in produzione.
- Bloccare domini interni, localhost, `.local`, `.lan`, `.internal`, IP privati e input non normalizzabili.
- Applicare rate limit per scan job e tenant.
- Logging senza dati sensibili.
- Salvare il resolver usato e il timestamp.

## Record minimi
Il primo rilascio deve supportare:

```text
A, AAAA, CNAME, MX, NS, TXT, CAA, SOA, DS
_dmarc.<domain> TXT
_mta-sts.<domain> TXT
_smtp._tls.<domain> TXT
wildcard DNS check con sottodominio casuale
```

## Findings minimi
- A/AAAA/CNAME assenti
- CNAME senza risoluzione finale
- NS mancanti o meno di 2
- MX presenti ma SPF assente
- SPF multipli
- SPF +all
- SPF ~all o ?all
- SPF lookup estimate > 10
- MX presenti ma DMARC assente
- DMARC p=none
- DMARC multipli
- DMARC senza rua
- CAA assente
- DS assente come indicatore DNSSEC non delegato
- wildcard DNS rilevata
- record TXT di verifica dominio rilevati

## UX desiderata
Nella dashboard SurfaceScan360 aggiungere una card `DNS Posture` con:
- score A-F;
- numero di finding high/medium/low;
- badge SPF, DMARC, CAA, DNSSEC;
- tabella record DNS;
- tabella remediation.

Nel report aggiungere sezione:

```text
DNS Exposure & Email Security Posture
1. Executive summary
2. Record inventory
3. Security findings
4. Email authentication posture
5. Certificate issuance policy
6. DNSSEC posture
7. Remediation plan
```

## Acceptance criteria
- Scansione dominio singolo completata in meno di 10 secondi in condizioni normali.
- Errori DNS per record singolo non interrompono tutto lo scan.
- Findings sempre collegati a evidenza e raccomandazione.
- Dashboard filtra per severity e categoria.
- Report mostra massimo 10 record per tipo, con opzione “full raw evidence” in appendice.
- Build TypeScript senza errori.
- RLS attiva sulle tabelle nuove.
