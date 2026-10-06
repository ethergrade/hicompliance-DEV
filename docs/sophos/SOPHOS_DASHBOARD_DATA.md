# Sophos Central → dashboard HiSolution: mappatura dei dati

> **Nota importante.** Nel progetto non ci sono risposte reali delle API Sophos né credenziali Sophos salvate.
> Le dashboard oggi mostrano dati di esempio. Questo documento collega i campi usati da ogni dashboard
> agli endpoint pubblici di Sophos Central che, secondo la documentazione Sophos, li forniscono.
> Prima di sviluppare, verificare ogni campo su developer.sophos.com con un tenant reale.

## 0. Autenticazione e tenant (comune a tutti i moduli)

| Passo | Chiamata | Cosa si ottiene |
|---|---|---|
| Token | `POST https://id.sophos.com/api/v2/oauth2/token` (grant_type=client_credentials, scope=token) | `access_token` (scade dopo circa 1 ora) |
| Chi sono | `GET https://api.central.sophos.com/whoami/v1` | `id` tenant/partner, `idType`, `apiHosts.dataRegion` |
| Tenant (solo partner) | `GET /partner/v1/tenants` (header `X-Partner-ID`) | elenco clienti con `id`, `name`, `apiHost` |
| Chiamate successive | header `Authorization: Bearer …` + `X-Tenant-ID` sul `dataRegion` | — |

Regola: client id e secret solo sul server, mai nel frontend. Un tenant Sophos va associato a un cliente HiSolution (`tenant_services.settings`).

Endpoint usati da più moduli:
- `GET /common/v1/alerts` (filtri `category`, `severity`, `product`, `from`): alert per ogni prodotto.
- `GET /siem/v1/events` e `GET /siem/v1/alerts`: eventi storici per i log (cursore `from_date`/`cursor`).

---

## 1. HiEndpoint (Sophos Intercept X / Endpoint Protection)

Dati restituiti dal backend: `{ stats, endpoints[], detectedThreats[], pendingUpdates[] }`

### endpoints[]: `GET /endpoint/v1/endpoints?view=full&pageSize=500`
| Campo UI | Campo Sophos | Regola |
|---|---|---|
| id | `id` | — |
| name | `hostname` | — |
| type | `type` (computer/server) + `os.platform` | computer → Workstation/Laptop, server → Server, mobile → Mobile |
| os | `os.name` + `os.majorVersion` | — |
| lastSeen | `lastSeenAt` | formato locale |
| status | `online` (bool) | Online/Offline |
| protection | `health.overall` (good/suspicious/bad/unknown), `assignedProducts[].status` | good → Protected, bad/suspicious → At Risk, prodotto non aggiornato → Outdated, altrimenti Unknown |
| threats | `health.threats.status` + conteggio alert per `managedAgent.id` | — |
| compliance | calcolata: `tamperProtectionEnabled`, `health.services.status`, prodotti installati | punteggio 0–100 calcolato da noi |

### stats
Calcolate lato server a partire da `endpoints[]`: totale, Protected, At Risk, online/offline, aggiornamenti in sospeso.

### detectedThreats[]: `GET /common/v1/alerts?product=endpoint` (o `/siem/v1/alerts`)
| Campo UI | Campo Sophos |
|---|---|
| id | `id` |
| endpoint | `managedAgent.name` o `location` |
| threatName | `description` / `data.threatName` |
| type | `category` / `type` |
| detectedAt | `raisedAt` |
| severity | `severity` (low/medium/high) → Low/Medium/High; Critical per categoria ransomware |
| status | `allowedActions`, stato di pulizia → Quarantined/Removed/Blocked/Pending |

### pendingUpdates[]
- `GET /endpoint/v1/endpoints/{id}` → `assignedProducts[].version` (versione installata)
- Package/policy di aggiornamento (`/endpoint/v1/settings/…`) → versione più recente
- `daysOutdated` e `priority` calcolati da noi.

Azioni (fase 2): `POST /endpoint/v1/endpoints/{id}/scans`, `…/tamper-protection`, `…/isolation`.

---

## 2. HiFirewall (Sophos Firewall gestito da Central)

Dati restituiti dal backend: `{ stats, blockedThreats[], firewallRules[], connectionLogs[] }`

| Sezione UI | Sorgente Sophos | Note |
|---|---|---|
| Elenco firewall / stato | `GET /firewall/v1/firewalls` (`hostname`, `serialNumber`, `firmwareVersion`, `status.connected`, `cluster`) | da mostrare in una scheda "Apparati" (da aggiungere) |
| Aggiornamenti firmware | `GET /firewall/v1/firewalls/actions/firmware-upgrade-check` | — |
| blockedThreats[] | `GET /siem/v1/events` / `GET /common/v1/alerts?product=firewall` (IPS, ATP, web) | source/destination/type/severity/timestamp |
| firewallRules[] | Non esposte dall'API Central: servono l'API XML on-box del firewall (`/webconsole/APIController`) o i gruppi Central | `hits` solo dall'API on-box |
| connectionLogs[] | Syslog / Sophos Central Reporting o Data Lake (XDR) | Central non fornisce il traffico in tempo reale |
| stats | Calcolate dalle sezioni sopra | — |

---

## 3. HiDetect (Sophos XDR / MDR)

Dati restituiti dal backend: `{ overview, threatSeverityData, weeklyThreatTrend, detectionCategories, realtimeAlerts, endpointStatus, socActivity, detectionRules, hourlyActivity }`

| Sezione UI | Sorgente Sophos |
|---|---|
| realtimeAlerts[] | `POST /detections/v1/queries/detections` → poll `GET …/{runId}/results` (`severity`, `mitreAttacks`, `device`, `detectionRule`, `time`) |
| Casi / attività SOC (socActivity) | `GET /cases/v1/cases` (MDR/XDR): `status`, `assignee`, `createdAt`, `overview` |
| threatSeverityData / weeklyThreatTrend / hourlyActivity | Aggregazioni delle detection per severità/giorno/ora (calcolate da noi) |
| detectionCategories | Raggruppamento per `mitreAttacks[].tactic` |
| detectionRules | Valori distinti di `detectionRule` con conteggio |
| endpointStatus | `GET /endpoint/v1/endpoints` + `riskScore` calcolato da detection aperte |
| overview.avgResponseTime | Media tra creazione e chiusura dei casi |
| Query avanzate | `POST /xdr-query/v1/queries/runs` (Data Lake) |

---

## 4. HiMail (Sophos Email)

Dati restituiti dal backend: `{ stats, recentThreats[], quarantinedEmails[], topSenders[], policyViolations[] }`

| Sezione UI | Sorgente Sophos | Note |
|---|---|---|
| quarantinedEmails[] | `POST /email/v1/quarantine/messages/search` (`from`, `to`, `subject`, `reason`, `receivedAt`); azioni `…/release`, `…/delete` | — |
| recentThreats[] | `GET /common/v1/alerts?product=email` + `/siem/v1/events` (phishing, malware, BEC) | — |
| stats | Contatori dagli eventi SIEM email | il totale di email "processate" potrebbe non essere disponibile via API: da verificare |
| topSenders[] | Aggregazione per dominio mittente dagli eventi | — |
| policyViolations[] | Eventi DLP / content control | — |

---

## 5. HiMobile (Sophos Mobile)

Dati restituiti dal backend: `{ overview, osDistribution, complianceData, enrollmentTrend, deviceInventory, securityPolicies, appInventory, securityEvents }`

| Sezione UI | Sorgente Sophos |
|---|---|
| deviceInventory[] | `GET /mobile/v1/devices` (`name`, `os.platform`, `os.version`, `model`, `owner`/`user`, `compliance`, `lastSyncAt`, `encryption`) |
| Dettaglio dispositivo | `GET /mobile/v1/devices/{id}` (batteria, app installate, profili) |
| securityPolicies[] | `GET /mobile/v1/compliance-policies` / profili, con conteggio dispositivi |
| appInventory[] | App gestite/installate per dispositivo, aggregate |
| securityEvents[] | `GET /common/v1/alerts?product=mobile` |
| overview / osDistribution / complianceData / enrollmentTrend | Calcolati da `deviceInventory` |
| Azioni (fase 2) | Blocco, cancellazione dati, sincronizzazione (`POST /mobile/v1/devices/{id}/actions`): verificare la disponibilità |

---

## 6. Indicazioni per il DEV
1. Un servizio server (Edge Function o Laravel) per ogni modulo: `GET /<modulo>/dashboard?tenant_id=` che restituisce esattamente le strutture `*DashboardData` (vedi `src/hooks/use*.ts`).
2. Cache dei risultati (es. 5–15 min) per rispettare i limiti di chiamate Sophos.
3. Paginazione Sophos: `pageFromKey`/`nextKey` (endpoint) e `cursor` (SIEM).
4. Le dashboard passano ai dati reali da sole quando l'endpoint risponde; per Innovatech restano i dati di esempio.
5. Campi da verificare per primi: regole e traffico firewall, totale email processate, batteria/app mobile.
