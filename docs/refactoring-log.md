# Refactoring Log — Migrazione API & Cleanup

## Fase 1 — API Client Layer (`fbd64ef`)

Creato layer API tipizzato per connettere il frontend all'API REST HiConsole (Laravel).

**File creati:**
- `src/lib/api-client.ts` — Client HTTP con Bearer token, CSRF, gestione errori (`ApiError`)
- `src/lib/api/auth.ts` — Endpoint auth (login, logout, me, changePassword)
- `src/lib/api/tenants.ts` — CRUD tenant + tenant proprio
- `src/lib/api/users.ts` — CRUD utenti
- `src/lib/api/assessment.ts` — Assessment CRUD + report mensili
- `src/lib/api/config.ts` — Config (roles, assessment statuses)
- `src/lib/api/index.ts` — Barrel export
- `src/types/api.ts` — Tipi TypeScript derivati da OpenAPI spec

---

## Fase 1b — Env Vars (`e0ab211`)

Rimossi tutti i valori hardcoded. API base URL e token key ora letti da `.env`.

**File modificati:**
- `.env` — Aggiunto `VITE_API_BASE_URL`, `VITE_AUTH_TOKEN_KEY`
- `src/lib/api-client.ts` — Usa `import.meta.env.VITE_*`

---

## Fase 2 — Migrazione Auth (`c9bb9ed`)

Riscritto intero flusso auth da Supabase a REST API. **-475 righe**.

**File riscritti:**
- `src/components/auth/AuthProvider.tsx` — Da 460 a ~100 righe. Rimossi: credenziali admin hardcoded, auto-signup fallback, `ensureUserDataIntegrity`, dipendenza Supabase Auth. Ora usa `authApi.login()`, `authApi.me()`, `authApi.logout()`
- `src/components/auth/LoginPage.tsx` — Rimosso tab signup, semplificato
- `src/hooks/useUserRoles.ts` — Rimossa RPC Supabase, parsing ruoli da `user.roles`

**File aggiornati (consumatori):**
- `src/contexts/ClientContext.tsx` — `userProfile` → `user.tenant_id`
- `src/pages/Dashboard.tsx` — `userProfile` → `user`
- `src/pages/Settings.tsx` — `useAuth()` → `useUserRoles()` per isAdmin
- `src/pages/SurfaceScanSettings.tsx` — idem
- `src/pages/AssetInventory.tsx` — `userProfile.organization_id` → `user.tenant_id`
- `src/components/layout/AppSidebar.tsx` — `userProfile.full_name` → `user.name`
- `src/components/dark-risk/AlertConfigDialog.tsx` — `useAuth()` → `useUserRoles()`
- `src/components/surface-scan/SurfaceScanAlertConfigDialog.tsx` — idem
- `src/hooks/useServiceIntegrations.ts` — `userProfile.organization_id` → `user.tenant_id`

---

## Fase 3 — Hook Cleanup (`db33489`)

Unificati hook duplicati, creata utility debounce, migrato users a API. **-204 righe**.

**File creati:**
- `src/hooks/useAlerts.ts` — Hook factory generico per alert CRUD + realtime subscription Supabase
- `src/hooks/useDebouncedCallback.ts` — Utility riutilizzabile per debounce async

**File riscritti:**
- `src/hooks/useDarkRiskAlerts.ts` — Da 210 a 15 righe (thin wrapper su `useAlerts`)
- `src/hooks/useSurfaceScanAlerts.ts` — Da 210 a 15 righe (thin wrapper su `useAlerts`)
- `src/hooks/useOrganizationUsers.ts` — Da 55 a 14 righe, migrato da Supabase a HiConsole API via React Query

**File aggiornati:**
- `src/components/dark-risk/AlertConfigDialog.tsx` — `auth_user_id`/`full_name` → `id`/`name`
- `src/components/surface-scan/SurfaceScanAlertConfigDialog.tsx` — idem

---

## Fase 4 — Migrazione ClientContext & Tenant CRUD

Migrato gestione organizzazioni/tenant da Supabase a HiConsole tenants API. Tipo `Organization` sostituito con `TenantResource` ovunque.

**File modificati:**
- `src/lib/api/tenants.ts` — Aggiunto `listAll()` per fetch tutte le pagine (admin/sales)
- `src/contexts/ClientContext.tsx` — Rimosso import Supabase, `Organization` → `TenantResource`, usa `tenantsApi.listAll()` per admin/sales e `tenantsApi.getOwn()` per client
- `src/components/clients/ClientCrudDialog.tsx` — Riscritto: Supabase → `tenantsApi.create()`/`tenantsApi.update()`, campo `code` → `ms_tenant_id`
- `src/components/clients/DeleteClientDialog.tsx` — Supabase → `tenantsApi.delete()`
- `src/pages/ClientSelection.tsx` — `org.code` → `org.ms_tenant_id`, tipo crudOrg aggiornato, filtro ricerca aggiornato

**Verifiche downstream (0 errori):** Tutti i consumatori di ClientContext usano solo `.id` e `.name` — cambio tipo trasparente.

---

## Stato attuale

### Migrati a HiConsole API
- Auth (login/logout/me)
- Users (lista utenti)
- ClientContext (lista tenant, selezione organizzazione)
- Client CRUD (creazione, modifica, eliminazione tenant)

### Ancora su Supabase (no endpoint API corrispondente)
- `useConsistenze` / `useConsistenzeRisk`
- `useContactDirectory`
- `useOrganizationProfile` — API manca campi: `fiscal_code`, `legal_address`, `pec`, `nis2_classification`, `ciso_substitute`
- `useCriticalInfrastructure`
- `useRiskAnalysis`
- `useAssessmentSnapshots`
- `useACNFeeds` (Supabase Edge Function)
- `useCorrelationReports`
- `useServiceIntegrations`

### Riferimenti residui a Supabase `organizations`
- `src/pages/AdminReporting.tsx` — query diretta
- `src/hooks/useIRPDocument.ts` — fetch org name
- `src/components/asset-inventory/ClientSelector.tsx` — lista organizzazioni per selettore

### Note
- `src/integrations/supabase/client.ts` — Non toccato, serve ancora per hook non migrati
- `src/components/ui/` — Non modificato (shadcn primitives)
