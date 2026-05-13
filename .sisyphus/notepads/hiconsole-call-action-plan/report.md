# HiConsole Demo Readiness Report
## 2026-05-13

### Completed Demo Behaviors

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Baseline inspection | ✅ Done | — |
| 2 | Backend API base via `.env` | ✅ Done (reverted to websoupcloud) | `173b914` |
| 3 | Hide Report/Threat/Incident + HiConsole branding | ✅ Done | `9b7ff9b`, `4135733` |
| 4 | Client create/switch flow verified, services button removed | ✅ Done | (pre-existing) |
| 4b | HiPatch-only services visible | ✅ Done | `c30cf5d` |
| 5 | Assessment functional: NIS values, REST anagrafica, consistenze link | ✅ Done | `4d321f5` |
| 6 | User creation role labels aligned with API | ✅ Done | `fed38fa` |
| 7 | PRODOTTO visual parity | ❌ Cut (nice-to-have) | — |
| 8 | Final cleanup | ✅ Done | This report |

### What Works for the Demo

- **Sidebar**: Shows HiConsole branding. Report, Threat Management, Incident, Reportistica Aggregata hidden.
- **Routes**: `/reports`, `/admin/reporting`, `/threat-management`, `/incident-response`, `/compliance-events` redirect to `/dashboard`.
- **Services**: Only HiPatch visible on Dashboard, Index, and Integrations pages.
- **Clients**: Create/switch flow functional via `/admin/clients`. Services button removed.
- **Assessment**: NIS radio shows `Soggetto Essenziale`, `Soggetto Importante`, `Nessuna delle due`. Anagrafica saves via REST API (`tenantsApi`). "Gestisci Consistenze" button links to `/consistenze`.
- **Users**: Create/edit/delete via REST API. Role labels display correctly (`super_admin` → "Super Admin", `client` → "Cliente", etc.).
- **API**: Points to `https://hiapi.websoupcloud.it` via `VITE_API_BASE_URL` in `.env`.

### Missing Backend Endpoints

- **Consistenze REST**: No REST endpoint found. `useConsistenze.ts` remains Supabase-based. UI is stable and non-crashing.

### Cut Items

- **PRODOTTO visual parity** (Task 7): Intentionally cut as nice-to-have. Current Assessment UI is functional.

### Verification

- `npm run build`: ✅ Passes
- `npm run lint`: Pre-existing errors only (147 errors, all `@typescript-eslint/no-explicit-any` and similar — none introduced by this work)
- Manual QA: Pending user verification

### Demo Credentials

- `admin@admin.com` / `adminadmin`
- `sales@sales.com` / `salessales`
