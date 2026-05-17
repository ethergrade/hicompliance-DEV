# Code Context: Customers (Clients) & Services Frontend

## Files Retrieved

### Route Definitions
1. `src/App.tsx` (lines 1-80) - All route definitions
   - `/admin/clients` → `ClientSelection` page (client/tenant management)
   - `/dashboard/service/:serviceCode` → `ServiceDashboard` (per-service dashboards)

### Pages
2. `src/pages/ClientSelection.tsx` - "Gestione Clienti" page (customer/tenant list, CRUD, service linking)
3. `src/pages/ServiceDashboard.tsx` - Routes to specific service dashboards by `serviceCode` param

### Client/Customer Components
4. `src/components/clients/ClientCrudDialog.tsx` - Create/Edit tenant dialog (uses **REST API**)
5. `src/components/clients/ClientServicesDialog.tsx` - Link/unlink services to clients (uses **Supabase**)
6. `src/components/clients/ClientAssetSheet.tsx` - Asset inventory sheet (uses **Supabase**)
7. `src/components/clients/DeleteClientDialog.tsx` - Delete tenant confirmation (uses **REST API**)

### Service Dashboard Components
8. `src/components/service-dashboards/HiPatchDashboard.tsx`
9. `src/components/service-dashboards/HiFirewallDashboard.tsx`
10. `src/components/service-dashboards/HiEndpointDashboard.tsx`
11. `src/components/service-dashboards/HiMailDashboard.tsx`
12. `src/components/service-dashboards/HiLogDashboard.tsx` (+ `hilog/` subdirectory)
13. `src/components/service-dashboards/HiTrackDashboard.tsx`
14. `src/components/service-dashboards/HiDetectDashboard.tsx`
15. `src/components/service-dashboards/HiMobileDashboard.tsx`

### Context & State
16. `src/contexts/ClientContext.tsx` - Client/organization selection context (uses **REST API**)
17. `src/hooks/useTenantServices.ts` - React Query hook for tenant services (uses **REST API**)

### API Client Setup
18. `src/lib/api-client.ts` - Core HTTP client (custom fetch wrapper, Bearer auth)
19. `src/lib/api/index.ts` - API module exports
20. `src/lib/api/tenants.ts` - Tenant CRUD endpoints
21. `src/lib/api/tenant-services.ts` - Service endpoints
22. `src/lib/api/config.ts` - Config endpoints (roles, statuses)
23. `src/lib/api/auth.ts` - Auth endpoints
24. `src/lib/api/assessment.ts` - Assessment endpoints

### Types
25. `src/types/api.ts` - All API type definitions (TenantResource, TenantServiceResource, etc.)

### Supabase (still referenced)
26. `src/integrations/supabase/client.ts` - Supabase JS client with hardcoded URL + anon key

---

## Key Code

### API Base URL Configuration (`src/lib/api-client.ts`)
```ts
const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const API_BASE_URL = import.meta.env.DEV ? "/api" : configuredBaseUrl || "https://hiapi.websoupcloud.it";
```
- **Dev**: uses `/api` proxy
- **Prod**: uses `VITE_API_BASE_URL` env var or defaults to `https://hiapi.websoupcloud.it`
- **Auth**: Bearer token stored in localStorage under `VITE_AUTH_TOKEN_KEY`
- **CSRF**: `/sanctum/csrf-cookie` endpoint for Laravel Sanctum

### API Module Structure (`src/lib/api/index.ts`)
```ts
export { authApi } from "./auth";
export { tenantsApi } from "./tenants";
export { usersApi } from "./users";
export { assessmentApi } from "./assessment";
export { configApi } from "./config";
export { tenantServicesApi } from "./tenant-services";
```

### Tenant Endpoints (`src/lib/api/tenants.ts`)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/tenants` (paginated) | List all tenants |
| GET | `/tenants/{id}` | Get single tenant |
| POST | `/tenants` | Create tenant |
| PATCH | `/tenants/{id}` | Update tenant |
| DELETE | `/tenants/{id}` | Delete tenant |
| GET | `/tenant` | Get own tenant (auth user) |
| PATCH | `/tenant` | Update own tenant |

### Tenant Service Endpoints (`src/lib/api/tenant-services.ts`)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/tenant-services` | List services (optional `status` param) |
| GET | `/tenant-services/{id}` | Get single service |
| POST | `/tenant-services` | Create service |
| PUT | `/tenant-services/{id}` | Update service |
| DELETE | `/tenant-services/{id}` | Delete service |
| GET | `/config/tenant-services` | Service catalog |

### ClientSelection Page Data Flow (`src/contexts/ClientContext.tsx`)
- Already uses **REST API** via `tenantsApi.listAll()`, `tenantsApi.getOwn()`, `tenantsApi.update()`, etc.
- SuperAdmin/Sales see all tenants; regular users see only their own
- Persists selection in localStorage (`hicompliance_selected_org`)

---

## Architecture

```
App.tsx (routes)
  ├── /admin/clients → ClientSelection.tsx
  │     ├── uses ClientContext (REST API via tenantsApi) ✓
  │     ├── ClientCrudDialog → REST API ✓
  │     ├── DeleteClientDialog → REST API ✓
  │     ├── ClientServicesDialog → ⚠️ SUPABASE (needs migration)
  │     └── ClientAssetSheet → ⚠️ SUPABASE (needs migration)
  │
  ├── /dashboard/service/:serviceCode → ServiceDashboard.tsx
  │     ├── HiPatchDashboard, HiFirewallDashboard, HiEndpointDashboard...
  │     └── Service code map: hi_patch, hi_firewall, hi_endpoint, hi_mail,
  │         hi_log, hi_track, hi_detect, hi_mobile
  │
  └── useTenantServices hook → REST API ✓ (tenantServicesApi)

API Layer:
  api-client.ts (fetch wrapper, Bearer auth)
    └── api/
         ├── tenants.ts       → /tenants, /tenant
         ├── tenant-services.ts → /tenant-services, /config/tenant-services
         ├── users.ts
         ├── auth.ts
         ├── config.ts
         └── assessment.ts

Types:
  src/types/api.ts → TenantResource, TenantServiceResource, Store/Update requests
```

---

## Supabase References (Migration Targets for Clients/Services)

**CRITICAL** — These client/service files still use Supabase directly:

### `src/components/clients/ClientServicesDialog.tsx`
- `supabase.from('hisolution_services').select('*')` — fetch service catalog
- `supabase.from('organization_integrations')` — fetch/create/update/delete service integrations
- Needs: API endpoints for service catalog and organization integrations

### `src/components/clients/ClientAssetSheet.tsx`
- `supabase.from('asset_inventory').select('*').eq('organization_id', ...)` — fetch asset data
- `supabase.from('asset_inventory').insert(...)` / `.update(...)` — save asset data
- Needs: API endpoints for asset_inventory CRUD

### Total Supabase lines across project: ~190 lines in ~30+ files
Full list of files with supabase imports:
- `src/components/clients/ClientAssetSheet.tsx` (3 usages)
- `src/components/clients/ClientServicesDialog.tsx` (5 usages)
- `src/components/service-dashboards/hilog/CorrelationExport.tsx` (2 usages)
- `src/components/forms/DemoRequestForm.tsx` (1 usage)
- `src/components/irp/GovernanceContactsTable.tsx` (8 usages)
- `src/components/irp/IRPContactForm.tsx` (4 usages)
- `src/components/emergency/EmergencyContactForm.tsx` (3 usages)
- `src/components/integrations/IntegrationAuditLog.tsx` (2 usages)
- `src/components/documents/DocumentPreviewDialog.tsx` (1 usage)
- `src/hooks/useAICiso.ts` + many other hooks (dozens of usages)

---

## Start Here

1. **`src/lib/api-client.ts`** — Core API client; understand the HTTP layer before anything else
2. **`src/lib/api/tenants.ts`** + **`src/lib/api/tenant-services.ts`** — Existing REST endpoints for tenants/services
3. **`src/types/api.ts`** — All type definitions (TenantResource, TenantServiceResource, request/response types)
4. **`src/components/clients/ClientServicesDialog.tsx`** — PRIMARY migration target (Supabase → REST)
5. **`src/components/clients/ClientAssetSheet.tsx`** — SECONDARY migration target (Supabase → REST)

---

## Open Questions / Constraints

1. **Missing API endpoints**: The backend may not yet have REST equivalents for:
   - `hisolution_services` (service catalog) — partially exists at `/config/tenant-services` but returns a string
   - `organization_integrations` (linking services to tenants)
   - `asset_inventory` (client asset data)

2. **ClientServicesDialog** currently queries `hisolution_services` table directly. The `tenantServicesApi.catalog()` endpoint returns a `string`, not a structured service list — this may need backend changes.

3. **ClientSelection.tsx** references functions (`openProfile`, `openAsset`, `openServices`) that appear to be defined in the component but the actual dialog components (sheets) need proper wiring — `ClientProfileSheet` is imported but not shown in the read.

4. **Auth model**: The project uses Laravel Sanctum Bearer tokens. Supabase auth (`supabase.auth.getUser()`) is still used in several components — these need to be replaced with the token-based auth from `api-client.ts`.
