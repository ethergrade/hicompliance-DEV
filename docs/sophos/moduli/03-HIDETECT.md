# HiDetect ← Sophos XDR / MDR / NDR

Dashboard: `HiDetectDashboard.tsx` · Hook: `src/hooks/useDetect.ts`
Tipo: `{ overview, threatSeverityData, weeklyThreatTrend, detectionCategories, realtimeAlerts, endpointStatus, socActivity, detectionRules, hourlyActivity }`

## Novità 18/09/2026 – importante
- Cases REST API e Detections REST API diventano **Classic XDR APIs** (deprecate, ancora disponibili per integrazioni esistenti).
- Nuove **Fusion XDR GraphQL APIs**, da usare per tutte le nuove integrazioni:
  - v2 Detections: ricerca e gestione detection (endpoint, sensori di rete, altre fonti)
  - v2 Cases: casi, evidenze, commenti, file, link
  - v2 Process lineage: fino a 100 processi per chiamata
  - v1 Event details per ID evento
  - v1 osquery-style queries sui dispositivi connessi
- Altre reference GraphQL annunciate "nelle prossime settimane" (ottobre 2026). Live Discover REST resta.
**Decisione per il DEV: implementare direttamente su GraphQL**, non sulle REST classiche.

## Mappatura
| Sezione UI | Fonte consigliata (GraphQL) | Fallback classico | Stato |
|---|---|---|---|
| realtimeAlerts[] (severità, MITRE, device, regola, ora) | Detections v2 | `POST /detections/v1/queries/detections` + `GET .../{runId}/results` | API |
| socActivity (casi, assegnatario, stato) | Cases v2 | `GET /cases/v1/cases` | API (MDR/XDR) |
| overview.avgResponseTime | Cases v2: creato → risolto | idem | Calc |
| overview.totale/critici/aperti | aggregazione detection | — | Calc |
| threatSeverityData | group by severity | — | Calc |
| weeklyThreatTrend / hourlyActivity | bucket per giorno/ora su timestamp | — | Calc |
| detectionCategories | MITRE tactic delle detection | — | Calc |
| detectionRules | valori distinti regola + conteggio | — | Calc |
| endpointStatus (riskScore) | `GET /endpoint/v1/endpoints` + detection aperte per device | — | Calc |
| Dettaglio processo (futuro) | Process lineage v2 / Event details v1 | — | API |
| Query hunting (futuro) | osquery-style v1 | `POST /xdr-query/v1/queries/runs` | API |

## Rete (NDR)
Se il cliente ha Sophos NDR, le detection di rete arrivano nelle stesse Detections v2 (fonte "network sensor"). La topologia di rete non è fornita: va da HiTrack.

## Gap / verifiche
- Schema GraphQL esatto (nomi campi, paginazione, filtri) da prendere dalla reference e dalla migration guide al momento dello sviluppo.
- MDR: `socActivity` disponibile solo con licenza MDR; senza, mostrare solo casi XDR.
