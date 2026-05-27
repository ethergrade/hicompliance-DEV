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
