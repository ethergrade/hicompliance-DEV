# Moduli Sophos – contratti per il DEV

Le dashboard HiEndpoint, HiFirewall, HiDetect, HiMail e HiMobile leggono da `src/lib/api/*.ts`.
Per Innovatech Group S.r.l. (demo) gli hook restituiscono mock senza chiamare l'API; per gli altri clienti
chiamano il backend e, se non risponde, mostrano il mock con badge "Demo Data".

| Modulo | Endpoint app | Sorgente Sophos Central | Hook / mock |
|---|---|---|---|
| HiEndpoint | GET /endpoints/dashboard | Endpoint API `GET /endpoint/v1/endpoints` (health, tamperProtectionEnabled, assignedProducts), `GET /common/v1/alerts` | `src/hooks/useEndpoints.ts` |
| HiFirewall | GET /firewall/dashboard | Firewall Management API `GET /firewall/v1/firewalls`, log/eventi via SIEM `GET /siem/v1/events` | `src/hooks/useFirewall.ts` |
| HiDetect | GET /detect/dashboard | XDR Query/Detections `POST /detections/v1/queries/detections`, Network Detection | `src/hooks/useDetect.ts` |
| HiMail | GET /mail/dashboard | Email Security (quarantena, messaggi bloccati), `GET /common/v1/alerts` categoria email | `src/hooks/useMail.ts` |
| HiMobile | GET /mobile/dashboard | Mobile API `GET /mobile/v1/devices`, compliance policies | `src/hooks/useMobile.ts` |

Autenticazione Sophos: OAuth client credentials (`id.sophos.com/api/v2/oauth2/token`), poi `GET /whoami/v1`
per ottenere tenant e data region. Le credenziali vanno solo lato server (mai nel frontend).
Il backend deve restituire esattamente la forma dei tipi `*DashboardData` definiti negli hook.
