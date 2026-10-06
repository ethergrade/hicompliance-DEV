# HiEndpoint ← Sophos Intercept X / Server Protection

Dashboard: `src/components/service-dashboards/HiEndpointDashboard.tsx` · Hook: `src/hooks/useEndpoints.ts`
Tipo: `EndpointDashboardData = { stats, endpoints[], detectedThreats[], pendingUpdates[] }`

## Lettura della dashboard
Sezioni: KPI (totale, protetti, a rischio, online/offline, update), tabella dispositivi con filtro protezione e paginazione, minacce rilevate, aggiornamenti in sospeso.

## API Sophos
| API | Uso |
|---|---|
| `GET /endpoint/v1/endpoints?view=full&pageSize=500&pageTotal=true` | inventario e salute |
| `GET /endpoint/v1/endpoints/{id}` | dettaglio, `assignedProducts[].version` |
| `GET /endpoint/v1/endpoints/{id}/tamper-protection` | stato tamper |
| `GET /endpoint/v1/endpoint-groups` | raggruppamenti (filtro futuro) |
| `GET /endpoint/v1/settings/...` / Packages guide | versioni software disponibili |
| `GET /common/v1/alerts?product=endpoint,server` | minacce |
| `GET /account-health-check/v1/health-check` | igiene configurazione |

## endpoints[]
| Campo UI | Campo Sophos | Stato | Regola |
|---|---|---|---|
| id | `id` | API | |
| name | `hostname` | API | |
| type | `type` (computer/server/securityVm) | API+Calc | server→Server; computer + `os.isServer=false` → Workstation/Laptop (laptop non distinto da API: usare tag/gruppo) |
| os | `os.name` / `os.platform` + `os.majorVersion.minorVersion` | API | |
| lastSeen | `lastSeenAt` | API | |
| status | `online` | API | true→Online |
| protection | `health.overall` (good/suspicious/bad/unknown) + `assignedProducts[].status` | Calc | good→Protected; bad/suspicious→At Risk; prodotto `notInstalled`/vecchio→Outdated |
| threats | `health.threats.status` + conteggio alert aperti per `managedAgent.id` | Calc | |
| compliance | `tamperProtectionEnabled`, `health.services.status`, `health.threats.status`, `isolation.status`, `encryption` | Calc | 100 − penalità (tamper off −25, servizi bad −25, minacce −30, prodotto mancante −20) |

Campi extra disponibili non ancora in UI: `ipv4Addresses`, `macAddresses`, `associatedPerson.viaLogin`, `group.name`, `isolation`, `cloud.provider`, `encryption.volumes[]`.

## stats
Tutti **Calc** da `endpoints[]` (`pendingUpdates` = conteggio di `pendingUpdates[]`).

## detectedThreats[]
| Campo UI | Campo Sophos | Stato |
|---|---|---|
| id | `id` | API |
| endpoint | `managedAgent.name` / `location` | API |
| threatName | `description` o `threat` (SIEM) | API |
| type | `category` (`malware`, `pua`, `runtimeDetections`, …) / `type` | API |
| detectedAt | `raisedAt` (`when` in SIEM) | API |
| severity | `severity` low/medium/high | API+Calc (Critical = categoria ransomware/CryptoGuard) |
| status | `allowedActions` + `threat_cleanable` + eventi pulizia | Calc |

## pendingUpdates[]
`assignedProducts[].version` vs versione corrente del pacchetto (Packages guide) → `daysOutdated`, `priority` **Calc**. Data di rilascio pacchetto: **Verif**.

## Azioni (fase 2)
`POST /endpoint/v1/endpoints/{id}/scans`, `POST /endpoint/v1/endpoints/{id}/update-checks`, `POST /endpoint/v1/endpoints/isolation`, `POST .../tamper-protection`.

## Gap
- Laptop vs Workstation non nativo.
- "Mobile" non è un endpoint Central: rimuovere dal filtro o prendere da HiMobile.
