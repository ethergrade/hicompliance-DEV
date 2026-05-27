<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 01 - Product Spec DarkRisk360

## Visione

DarkRisk360 è il modulo HICONSOLE per il monitoraggio del rischio digitale esterno del cliente, con focus su:

- esposizione di domini, sottodomini, IP e servizi pubblici;
- postura DNS, email security, TLS, web e infrastruttura;
- leak, credenziali, stealer log, paste, dati indicizzati e fonti deep/dark web tramite Intelligence X;
- correlazione con SurfaceScan360;
- generazione di report DTI e remediation prioritarie.

DarkRisk360 non deve essere un semplice widget di "dark web monitoring". Deve diventare un prodotto di `Domain Threat Intelligence` collegato all'anagrafica cliente e al perimetro autorizzato.

## Target utenti

### Cliente finale

Vuole capire:

- cosa è stato controllato;
- cosa è stato trovato;
- quanto è grave;
- quali asset sono impattati;
- cosa deve fare subito;
- quali attività sono già in carico a HiSolution.

La vista cliente deve essere chiara, sintetica, con dati sensibili mascherati.

### Analyst HiSolution

Vuole:

- vedere evidenze tecniche;
- validare finding;
- accedere a preview e raw evidence se autorizzato;
- classificare compromissioni dirette, indirette e potenziali;
- generare report;
- aprire remediation o ticket;
- verificare delta tra scan successive.

### Admin HiSolution

Vuole:

- attivare Standard o Estesa;
- configurare perimetro;
- gestire chiavi e sorgenti;
- vedere consumi, errori API, crediti, throttling;
- gestire retention e audit.

## Tiers commerciali

### DarkRisk360 Standard

La versione Standard deve dare evidenza di ciò che esiste e di ciò che è stato controllato.

Funzioni minime:

- dashboard cliente;
- domini monitorati;
- asset principali da SurfaceScan360;
- scan IntelX su domini principali e selector approvati;
- conteggi per tipologia finding;
- evidenze mascherate;
- alert recenti;
- risk score;
- report sintetico;
- raccomandazioni operative principali;
- trend rispetto all'ultima scansione.

### DarkRisk360 Estesa

La versione Estesa deve aggiungere profondità analitica.

Funzioni aggiuntive:

- phonebook e discovery selector;
- correlazioni cross-domain;
- analisi domini collaterali;
- analisi stealer log;
- classification per data source e file type;
- evidence vault analyst;
- preview controllata;
- export account mascherato;
- appendici tecniche;
- workflow analyst;
- report completo DTI;
- alerting continuo su nuovi risultati;
- delta analysis tra scan.

## Feature matrix

| Area | Standard | Estesa |
|---|---|---|
| Dashboard KPI | Sì | Sì |
| Copertura controlli | Sì | Sì |
| Asset SurfaceScan360 | Sì | Sì |
| IntelX search su dominio principale | Sì | Sì |
| IntelX search su selector estesi | Limitata | Completa |
| Phonebook | No o limitato | Sì |
| Evidenze mascherate | Sì | Sì |
| Raw evidence | No | Solo analyst autorizzato |
| Report sintetico | Sì | Sì |
| Report DTI completo | No | Sì |
| Stealer log classification | Sintesi | Dettaglio |
| Cross-domain correlation | Base | Avanzata |
| Export tecnico | Limitato | Completo e auditato |
| Alerting continuo | Base | Avanzato |

## Oggetti di dominio

### Customer

Cliente HICONSOLE già presente o da collegare a tabella esistente.

Campi attesi:

- `id`
- `name`
- `status`
- `industry`
- `tenant_id` o equivalente
- riferimenti contrattuali e perimetro autorizzato.

### Asset

Un asset è un oggetto osservabile:

- dominio;
- sottodominio;
- URL;
- IP;
- CIDR;
- MX;
- nameserver;
- host;
- servizio;
- certificato;
- email address;
- account aziendale.

### Selector

Un selector è un valore interrogabile su Intelligence X:

- email;
- dominio;
- wildcard domain;
- URL;
- IPv4 o IPv6;
- CIDR;
- phone number;
- MAC address;
- UUID;
- system ID;
- storage ID;
- simhash;
- IBAN;
- credit card number.

Non usare nomi aziendali generici o keyword marketing come selector IntelX.

### ScanRun

Una scansione orchestrata per cliente.

Include:

- tier;
- trigger;
- sorgenti;
- stato;
- inizio;
- fine;
- errore;
- metriche di consumo.

### SourceRecord

Record grezzo normalizzato dalla sorgente, ma non ancora interpretato come finding.

### Evidence

Prova persistente e tracciabile. Può derivare da SurfaceScan360 o IntelX.

Non coincide necessariamente con un problema.

### Finding

Interpretazione operativa derivata da una o più evidence.

Esempio:

- `DMARC non in enforcement`
- `FTP esposto`
- `Credenziale aziendale apparsa in leak`
- `Email aziendale presente in stealer log di terza parte`
- `Dominio collaterale su stesso IP`

### Alert

Evento nuovo o significativo generato da un finding.

Esempio:

- nuovo leak;
- nuova porta aperta;
- peggioramento score;
- nuovo dominio collaterale;
- nuovo selector con evidenze.

### Recommendation

Raccomandazione operativa legata a uno o più finding.

Può essere deterministica o AI-assisted.

### ReportSnapshot

Snapshot immutabile di report generato a una data.

## KPI dashboard

La dashboard deve esporre almeno:

- `Minacce attive`
- `Credenziali leak`
- `Domini monitorati`
- `Punteggio rischio`
- `Ultima scansione`
- `Copertura SurfaceScan360`
- `Copertura IntelX`
- `Finding critici`
- `Finding ad alta priorità`
- `Identità impattate`
- `Servizi esposti`
- `Nuovi alert da ultima scansione`

## Stati finding

Usare una state machine semplice:

- `new`
- `triaged`
- `validated`
- `false_positive`
- `accepted_risk`
- `remediation_in_progress`
- `resolved`
- `suppressed`

Ogni cambio stato deve generare audit log.

## Linguaggio e responsabilità

Non usare "breach confermato" se l'evidenza non dimostra compromissione diretta.

Usare invece:

- "esposizione rilevata";
- "evidenza indicizzata";
- "compromissione indiretta";
- "potenziale riuso credenziale";
- "rischio di impersonation";
- "endpoint terzo compromesso";
- "misconfigurazione".

## Acceptance criteria

- Il modulo mostra dati reali e persistenti, non mock.
- La stessa anagrafica cliente alimenta Standard ed Estesa.
- Il tier modifica profondità, visibilità e workflow, non il modello dati.
- Le evidenze sensibili sono mascherate.
- Ogni KPI è calcolabile da query tracciabili.
- Ogni finding ha sorgente, confidenza e timestamp.
- Ogni report è riproducibile dallo snapshot dati.
