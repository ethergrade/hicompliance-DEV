# DarkRisk360 Discovery Notes

Date: 2026-05-24
Scope: Phase 0 repository discovery for DarkRisk360 refactor.

## Current implementation snapshot

- Route: `/dark-risk` renders `src/pages/DarkRisk360.tsx` behind `ClientSelectionGuard`.
- Existing page was mock-driven (hardcoded KPIs, threats and alerts).
- Existing DarkRisk table in production schema: `public.dark_risk_alerts` (alert configuration, not threat findings).
- Service toggle already available: `organizations.dark_risk360_enabled`.
- Multi-client context available via `useClientOrganization`.

## Reusable data already available

SurfaceScan360 already persists rich external risk data and can be reused as DarkRisk360 baseline:

- `surface_scan_jobs`
- `surface_findings`
- `surface_observations`
- `surface_external_intel`
- `surface_scan_module_results`
- `surface_open_ports`
- `surface_exposure_findings`
- `surface_scan_monitored_ips`

This allows immediate migration from mock UI to real data without waiting for full IntelX schema rollout.

## Existing backend patterns to reuse

From `supabase/functions/_shared/surface-scan-utils.ts`:

- `makeSupabaseClients(req)`
- `getCallerProfile(adminClient, authUserId)`
- `assertCustomerAccess(caller, customerId)`
- shared CORS headers

These enforce authenticated, customer-scoped, server-side aggregation.

## Risks identified

- `dark_risk_alerts` is organization-scoped, while SurfaceScan uses `customer_id` with compatibility fallback.
- Frontend hook `useDarkRiskAlerts` was not filtering by selected customer for admin/sales multi-client workflows.
- No dedicated DarkRisk findings/evidence schema yet, so initial DarkRisk360 overview must use SurfaceScan-derived signals.

## Files touched in Phase 0/MD00 implementation

- `supabase/functions/darkrisk360-overview/index.ts` (new)
- `src/hooks/useDarkRiskOverview.ts` (new)
- `src/hooks/useDarkRiskAlerts.ts` (organization scoped)
- `src/pages/DarkRisk360.tsx` (mock removed, data-driven overview)

## Next steps for following MD files

1. MD01 Product Spec
   - Introduce DarkRisk domain services and tier entitlement model (`standard`/`extended`).
2. MD02 Integration Contracts
   - Add backend adapter interfaces and source orchestration contracts.
3. MD03 Schema
   - Add dedicated DarkRisk entities (`scan_runs`, `evidence`, `findings`, `recommendations`, `reports`, `audit`).
4. MD04+ 
   - Scoring taxonomy, recommendation engine, report snapshots, governance and QA automation.
