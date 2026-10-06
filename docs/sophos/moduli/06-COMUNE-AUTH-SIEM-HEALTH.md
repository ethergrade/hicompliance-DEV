# Comune a tutti i moduli: autenticazione, tenant, SIEM, health score

## 1. Autenticazione (developer.sophos.com → Concepts → Authentication)
1. `POST https://id.sophos.com/api/v2/oauth2/token` – body `grant_type=client_credentials&client_id=…&client_secret=…&scope=token` → `access_token` (~3600 s).
2. `GET https://api.central.sophos.com/whoami/v1` → `id`, `idType` (`tenant` | `partner` | `organization`), `apiHosts.global`, `apiHosts.dataRegion`.
3. Partner/organization: `GET /partner/v1/tenants?pageTotal=true` (header `X-Partner-ID`) → `id`, `name`, `dataRegion`, `apiHost`, `status`.
4. Tutte le chiamate prodotto: `{apiHost}` + header `Authorization: Bearer`, `X-Tenant-ID`.

Mappatura: un tenant Sophos ↔ un cliente HiSolution (`tenant_services.settings.sophos_tenant_id`, `api_host`). Secret solo lato server.

## 2. Paginazione, errori, limiti
- Endpoint/Common: `pageFromKey` + `pages.nextKey`, oppure `page`/`pageSize` con `pageTotal=true`.
- SIEM: `cursor` / `next_cursor` + `has_more`; `from_date` (max 24 h indietro).
- Rate limit per tenant (429 con `Retry-After`): cache lato server 5–15 min per dashboard.

## 3. SIEM (Swagger ufficiale)
Path: `GET /siem/v1/alerts`, `GET /siem/v1/events` (params `limit` ≤1000, `cursor`, `from_date`, `exclude_types`).
`AlertEntity`: `id, severity, category, type, product, description, location, threat, threat_cleanable, source, when, created_at, allowedActions, actionable, data, info, customer_id, event_service_event_id`.
Usato da: HiEndpoint (minacce), HiFirewall (eventi), HiMail (minacce), HiMobile (eventi).

## 4. Common Alerts
`GET /common/v1/alerts` (filtri `product`, `category`, `severity`, `from`, `to`, `sort`) e `POST /common/v1/alerts/{id}/actions` (`acknowledge`, `cleanPua`, `cleanVirus`, …). Preferito al SIEM per lo stato corrente.

## 5. Account Health Check (utile per lo health score)
`GET /account-health-check/v1/health-check` → punteggi per protezione installata, policy, esclusioni, tamper protection.
Proposta: usarlo come componente "hygiene" in `src/lib/serviceHealth.ts` per endpoint/server.

## 6. Contratto backend
`GET /<modulo>/dashboard?tenant_id=` restituisce esattamente il tipo `*DashboardData`. La UI passa ai dati reali da sola; Innovatech resta in demo.
