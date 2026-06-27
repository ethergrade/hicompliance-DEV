# 02 - ConnectSecure, NVD, sottodomini e scoring

## Autenticazione ConnectSecure

Secrets globali richiesti:

```text
CS_POD_HOST=<pod-host>
CS_COMPANY_ID=<company-id>
CS_CLIENT_AUTH_TOKEN=<client-auth-token-base64-o-credenziale-raw>
```

Il token client non e' il JWT delle chiamate successive. L'adapter esegue:

```http
POST https://<pod-host>/w/authorize
Accept: application/json
Client-Auth-Token: <valore-normalizzato>

<body vuoto>
```

La risposta contiene `access_token` e `user_id`. Ogni run puntuale, schedulato o di polling rigenera una sessione; su HTTP 401 l'adapter riautorizza e riprova. Le chiamate successive usano `Authorization` e `X-USER-ID` secondo il contratto del pod.

### Precedenza configurazione

1. Secrets globali `CS_*`.
2. Override per organizzazione in `connectsecure_config` se completo.
3. `enabled=false` sull'override blocca esplicitamente l'organizzazione.

`diagnose_auth` restituisce soltanto presenza, lunghezza e hash prefix del token, mai il token o il JWT.

## Workflow ASM asincrono

1. `csAuthorize()` crea la sessione.
2. `csGetOrCreateDomain()` cerca il mapping locale.
3. Se manca, cerca il dominio remoto prima di crearlo.
4. `csScanNow()` avvia lo scan per il dominio registrato.
5. `connectsecure-scan` persiste il job in coda/running.
6. Il cron `poll_pending` interroga i risultati per domain id.
7. Al completamento, mapper e orchestratore aggiornano le tabelle canoniche.
8. CVE enrichment e report refresh vengono accodati in background.

Azioni Edge supportate:

| Action | Scopo |
|---|---|
| `diagnose_auth` | Diagnostica sicura senza scan |
| `test_auth` | Verifica autenticazione |
| `scan` | Avvio per organizzazione/dominio |
| `weekly_all` | Avvio sulle organizzazioni abilitate |
| `poll_pending` | Drain dei job ASM persistenti |

## Mapping dati ASM

| Dato sorgente | Destinazione canonica |
|---|---|
| dominio e domain id | `connectsecure_domain_registry` |
| target IP e host | `surface_assets` |
| port/protocol/service | `surface_open_ports` |
| sottodomini | `surface_assets` + queue interna |
| SPF, DKIM, DMARC, DNS | `surface_observations` e finding validati |
| header HTTP/TLS | osservazioni e tabelle tecniche |
| vulnerabilita' | `surface_findings` / `surface_exposure_findings` |
| credential/hash evidence | `connectsecure_sensitive_data` |

## Sottodomini e orchestrazione

- Tutti i sottodomini scoperti vengono normalizzati e salvati, quindi sono visibili in UI e report.
- Standard: massimo 10 nuovi child job per organizzazione e ciclo.
- Esteso: rispetta i limiti configurati di domini/IP o `SURFACESCAN_SUBDOMAIN_CHILD_JOB_LIMIT`.
- Profondita' massima: 10, con `parent_domain`, `root_domain`, `depth` e `source` persistiti.
- Dedupe: organizzazione + target normalizzato.
- Cooldown predefinito: 24 ore per il child job.
- ConnectSecure scansiona root/scope; i discendenti vengono affidati ai motori interni in queue.

## Correlazione vulnerabilita'

Una porta aperta viene trattata in tre fasi:

1. **Exposure**: porta/protocollo sono confermati ma la vulnerabilita' non e' determinata.
2. **Fingerprint**: prodotto e versione generano un CPE candidato.
3. **Validation**: NVD restituisce CVE realmente applicabili al CPE; FIRST aggiunge EPSS e CISA aggiunge KEV.

Stati match:

- `confirmed`: fingerprint e CPE con confidenza >= 0,90 e CVE compatibile.
- `candidate`: correlazione plausibile ma non ancora sufficientemente forte.
- `unknown`: fingerprint/versione insufficienti; retry in coda.
- `rejected`: CPE esatto verificato senza CVE applicabili.

## Exposure Score V2

Il punteggio mostrato e' un indice di postura:

```text
risk_points = min(100, somma componenti)
posture_score = 100 - risk_points
```

Soglie rischio:

| Risk points | Livello |
|---:|---|
| 0-10,9 | Basso |
| 11-24,9 | Medio |
| 25-59,9 | Alto |
| 60-100 | Critico |

Componenti principali:

| Evidenza | Punti |
|---|---:|
| Web 80/443 | 1 per servizio |
| Web alternativo 8000/8080/8081/8888 | 4 |
| Admin web 2375/2376/6443/8443/9000/9090/9443 | 10 |
| Porta sensibile | 10-25 secondo tabella |
| Finding critical/high/medium/low/info | 25/12/6/2/0,5 |
| CVE confermata | `CVSS * 4 + EPSS percentile * 10 + KEV 25`, cap 60 per servizio |
| CVE candidata | meta' della componente confermata |
| Delta nuove porte | cap 5 |
| Debolezze TLS/header | 3 ciascuna, cap 12 |
| Dato vulnerabilita' mancante | 0,25 per servizio, cap 2 |

I finding che rappresentano soltanto una porta (`open_port_exposed`, `service_fingerprint_exposed`, `sensitive_port_exposed`) non vengono conteggiati una seconda volta nella componente finding.
