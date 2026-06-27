# SurfaceScan360 - Exposure Risk V3 e visualizzazione severity

Ultimo aggiornamento: 27 giugno 2026.

## Obiettivo

Exposure Risk V3 separa l'esposizione Internet dalla vulnerabilita' software. Una porta aperta produce sempre un finding operativo utile, ma non autorizza a dedurre una CVE. Il punteggio evita inoltre che molti servizi ordinari saturino automaticamente il rischio a 100.

La direzione del dato resta invariata:

- `100` = postura ottima;
- `0` = postura peggiore;
- `risk_points = 100 - posture_score` prima dell'arrotondamento finale.

## Matrice condivisa per servizio

| Classe | Esempi | Probabilita' | Impatto | Score | Severity |
|---|---|---:|---:|---:|---|
| Servizio pubblico protetto | HTTPS, SMTPS, IMAPS | 2 | 2 | 4 | Low |
| Pubblico clear-text/alternativo | HTTP, porte web alternative | 3 | 2-3 | 6-9 | Medium |
| Servizio non identificato | Porta generica senza fingerprint | 3 | 3 | 9 | Medium |
| Accesso remoto/amministrativo | SSH, RDP, VNC, pannelli admin | 4 | 4 | 16 | High |
| Protocollo legacy/infrastrutturale | Telnet, FTP, SMB, RPC, SNMP, NFS | 5 | 4 | 20 | High |
| Database/cache/control plane | SQL, Redis, MongoDB, Docker/Kubernetes API | 5 | 5 | 25 | Critical |

La classificazione e' deterministica per `host/IP + porta + protocollo`. La stessa esposizione rilevata da piu' scanner viene deduplicata tramite `service_key` e contribuisce una sola volta al punteggio.

## Aggregazione

```text
primary = 30 * (massimo matrix_score / 25)
breadth = min(10, 1.5 * somma degli altri matrix_score / 25)
uncertainty = min(5, 1 + 0.75 * log2(servizi_unknown + 1))
service_exposure_points = min(45, primary + breadth + uncertainty)
risk_points = min(100, service_exposure + verified_findings + confirmed_cves + candidate_cves + threat_intel + delta)
posture_score = round(100 - risk_points)
```

Le componenti del breakdown non si sovrappongono. TLS/header finding e finding di porta non vengono conteggiati due volte. L'esposizione non verificata e l'incertezza hanno un cap complessivo di 45 punti: per ottenere rischio critico servono CVE, KEV, debolezze tecniche confermate o altre evidenze concrete.

Caso di accettazione: 34 servizi HTTPS senza versione producono 34 finding, zero CVE, circa 17.6 punti rischio, postura `82/100` e rischio `Medio`.

## Contratto dati V3

`surface-exposure-summary` restituisce:

- `score_version: "3.0"`;
- `service_assessments[]` con classe, likelihood, impact, matrix score, severity, stato evidenza e remediation;
- `exposure_findings[]` unificati da porte, finding canonici e finding legacy compatibili;
- `vulnerability_summary.exposure_findings` e `vulnerability_summary.fingerprint_unknown`;
- breakdown non sovrapposto: `service_exposure`, `uncertainty`, `verified_findings`, `confirmed_cves`, `candidate_cves`, `threat_intel`, `delta`.

Le CVE sono ammesse soltanto con correlazione `candidate` o `confirmed` basata su prodotto/versione/CPE. Un CPE esatto senza CVE nota conserva l'esposizione e mostra `nessuna CVE nota`; non viene presentato come servizio sicuro.

## Finding operativo

Ogni `internet_exposed_service` contiene almeno:

- host, porta e protocollo;
- `service_key` stabile;
- classe del servizio e motivazione;
- likelihood, impact e matrix score;
- severity e stato del fingerprint;
- stato dell'evidenza e remediation;
- sorgenti aggregate, senza duplicare il contributo al rischio.

## UI e report

Card, tabella porte, tabella finding, report AI, PDF e DOCX consumano il modello V3. La UI non dipende piu' dalla sola tabella legacy `surface_exposure_findings`.

Il grafico `Distribuzione Severity Exposure` adotta una lettura da console operativa:

- colori severity semantici e stabili;
- pin-point e leader line sui segmenti quando lo spazio lo consente;
- totale o selezione corrente al centro del donut;
- legenda interattiva con conteggio e percentuale;
- focus tastiera, `aria-pressed` e tooltip;
- layout affiancato desktop e impilato mobile.

Il QA visuale e responsivo e' documentato in `design-qa.md`.

## File principali

- Catalogo e remediation: `supabase/functions/_shared/service-exposure-matrix.ts`
- Motore di scoring: `supabase/functions/_shared/exposure-score-v3.ts`
- Test: `supabase/functions/_shared/exposure-score-v3.test.ts`
- API summary: `supabase/functions/surface-exposure-summary/index.ts`
- Tipi frontend: `src/lib/surfacescan/exposureApi.ts`
- Sezione Exposure: `src/components/surface-scan/SurfaceScanExposureSection.tsx`
- Grafici: `src/components/surfacescan/ExposureCharts.tsx`
- Report AI: `supabase/functions/surfacescan360-ai-report/index.ts`
- PDF/DOCX: `src/lib/surfaceScan360PdfReport.ts`, `src/lib/surfaceScan360DocxReport.ts`

## Verifica prima della promozione

```bash
npm run test:deno
npm run check
deno check supabase/functions/surface-exposure-summary/index.ts
deno check supabase/functions/surfacescan360-ai-report/index.ts
npx eslint src/components/surfacescan/ExposureCharts.tsx
git diff --check
```

Scenari obbligatori:

1. 34 HTTPS senza versione: 34 finding, zero CVE, postura circa 82.
2. Database esposto: finding di servizio Critical, aggregato almeno High senza CVE inventate.
3. CVE critica KEV confermata: rischio complessivo Critical.
4. CPE esatto senza CVE: esposizione presente, stato `nessuna CVE nota`.
5. Stessa porta da piu' scanner: un finding e un contributo.
6. TLS/header e porta: nessun doppio conteggio.

## Configurazione locale per lo sviluppo

La root del workspace puo' contenere `.env_per_stefano`, file locale ignorato da Git e leggibile soltanto dall'utente proprietario. Viene composto dalle configurazioni locali gia' autorizzate, senza stampare i valori in console.

Variabili attese quando disponibili:

```text
VITE_SUPABASE_PROJECT_ID
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_URL
VITE_API_BASE_URL
VITE_COMPLIANCE_API_BASE_URL
VITE_AUTH_TOKEN_KEY
NUCLEI_SCAN360_SERVICE_URL
NUCLEI_SCAN360_SHARED_SECRET
NMAP_SCAN360_SERVICE_URL
NMAP_SCAN360_SHARED_SECRET
NIKTO_SCAN360_SERVICE_URL
NIKTO_SCAN360_SHARED_SECRET
NIKTO_SHARED_SECRET
```

Regole:

1. permessi file `600`;
2. mai `git add -f`;
3. mai valori in documentazione, issue, chat, log o screenshot;
4. ruotare i secrets quando cambia il destinatario o termina l'handoff;
5. trasferire i valori di produzione tramite il secret manager, non tramite Git.
