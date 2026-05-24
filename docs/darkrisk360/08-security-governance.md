<!--
DarkRisk360 Codex Pack
Generated for HICONSOLE / HiSolution.
Target stack assumption: Lovable frontend, React/Vite, Supabase Postgres, Supabase Edge Functions.
Do not paste API keys, passwords, leaked credentials, tokens, cookies, raw dumps or secrets into this repository.
-->

# 08 - Security and Governance

## Obiettivo

Definire i controlli minimi di sicurezza per DarkRisk360.

Il modulo tratta dati altamente sensibili: leak, credenziali, evidenze da stealer log, preview di file, domini, email e metadati di infrastruttura. Deve essere progettato con sicurezza by design.

## Secrets management

Variabili sensibili:

```bash
INTELX_API_KEY=
OPENAI_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Regole:

- mai nel frontend;
- mai in repository;
- mai nei log;
- mai in localStorage;
- mai restituite da API;
- usare secret manager della piattaforma;
- `.env.example` deve avere solo placeholder.

## RBAC

Ruoli minimi:

| Ruolo | Permessi |
|---|---|
| `customer_viewer` | overview, finding mascherati, report autorizzati |
| `customer_admin` | overview, finding, report, acknowledge |
| `hisolution_analyst` | evidence, reveal controllato, report generation |
| `hisolution_admin` | settings, entitlement, sorgenti, audit |
| `service_role` | job backend e scrittura dati |

## Raw evidence policy

Raw evidence deve essere:

- disabilitata di default;
- disponibile solo su tier Estesa;
- accessibile solo ad analyst autorizzato;
- protetta da audit;
- soggetta a retention;
- mai inviata a OpenAI;
- mai mostrata in report cliente;
- mai salvata nei log.

## Audit obbligatorio

Auditare:

- avvio scan;
- modifica perimetro;
- approvazione selector;
- reveal evidence;
- download report;
- esportazione dati;
- modifica tier;
- modifica retention;
- generazione recommendation AI;
- errori API critici;
- accessi negati.

Campi audit:

- actor;
- customer;
- action;
- entity;
- reason;
- timestamp;
- IP;
- user agent;
- metadata non sensibile.

## Data masking

Mascherare:

- email se vista cliente o policy richiesta;
- password sempre;
- token sempre;
- cookie sempre;
- credit card sempre;
- IBAN sempre;
- codice fiscale sempre;
- dati autofill sensibili sempre, salvo analyst e motivo.

## Logging

Nei log consentiti:

- customer ID;
- scan run ID;
- source;
- status;
- conteggi;
- HTTP status;
- durata;
- error code.

Nei log vietati:

- API key;
- selector sensibili non mascherati se non necessario;
- password;
- token;
- cookie;
- raw preview;
- file content;
- prompt completo se contiene dati sensibili.

## OpenAI governance

Prima di chiamare OpenAI:

- sanitizzare input;
- rimuovere password;
- rimuovere token;
- rimuovere cookie;
- mascherare email se richiesto;
- passare solo finding, summary e metadata;
- validare output;
- salvare prompt version, schema version e modello.

Non inviare mai file raw Intelligence X a OpenAI.

## Intelligence X governance

- Usare solo asset autorizzati.
- Usare selector forti.
- Non fare query generiche.
- Terminare search.
- Limitare rate.
- Rispettare licenza e bucket autorizzati.
- Gestire credits.
- Non esporre link deep detail a cliente se non previsto.
- Cautela con file HTML, Office, ZIP o eseguibili.

## Perimetro e autorizzazione

Ogni cliente deve avere:

- perimetro concordato;
- domini approvati;
- IP/CIDR approvati;
- eventuali domini collaterali;
- esclusioni;
- data autorizzazione;
- riferimento contrattuale o manleva;
- owner interno.

I domini collaterali scoperti non devono essere automaticamente considerati autorizzati.

## Retention

Default suggerito:

| Dato | Retention |
|---|---|
| scan run metadata | 24 mesi |
| source metadata | 12 mesi |
| safe preview | 12 mesi |
| raw evidence | 90 giorni o meno |
| report | secondo contratto |
| audit log | 24 mesi o policy aziendale |

La retention deve essere configurabile per cliente.

## Incident workflow

Quando viene rilevata credenziale o stealer log high/critical:

1. creare finding;
2. creare alert;
3. generare recommendation;
4. notificare analyst;
5. non inviare password in email;
6. suggerire reset password;
7. suggerire revoca sessioni e token;
8. suggerire MFA;
9. tracciare stato remediation.

## Export control

Export consentiti:

- PDF report;
- JSON report snapshot;
- CSV findings mascherati;
- CSV asset;
- evidence export solo analyst.

Ogni export deve avere audit.

## Privacy

Principi:

- minimizzazione dati;
- mascheramento di default;
- accesso su necessità;
- retention limitata;
- no raw data in LLM;
- no email con segreti;
- no screenshot di evidenze sensibili in ticket non protetti.

## Acceptance criteria

- RLS attiva.
- Nessun secret client-side.
- Reveal evidence richiede ruolo e motivo.
- Audit log creato.
- Raw evidence non compare nel report cliente.
- Prompt OpenAI sanitizzato.
- Logs redatti.
- Retention implementabile.
