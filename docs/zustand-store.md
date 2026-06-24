# ADR: Zustand Store for Shared HiConsole State

**Status:** pilot  
**Date:** 2026-06-24  
**Author:** Frontend team

---

## Problem Statement

HiConsole's current state management relies on React Context (`ClientContext`, `AuthProvider`) for tenant/user selection and `@tanstack/react-query` for server state caching. This leads to:

1. **Duplicate API calls**: multiple components (AppSidebar, ClientProfileSheet, ClientServicesDialog) independently call `tenantServicesApi.listByOrganization()` and recompute the same `orgFlags` (hicompliance_enabled, surface_scan360_enabled, dark_risk360_enabled, hipatch_enabled).
2. **Inconsistent state timing**: React Query cache keys differ between components, causing brief periods where the same logical data differs.
3. **No shared reactive source**: when the selected organization changes, consuming components must manually detect and re-fetch their data.
4. **Prop drilling / context nesting**: `ClientContext` is consumed in many components, creating coupling to Context API and making testing harder.

---

## Decision

**Introduce Zustand** as a lightweight global state manager for **shared derived state**, while keeping React Query as the cache layer for raw server data.

### What goes to Zustand

- Selected organization / tenant
- Selected group
- Tenant services list for the selected org
- Derived organization flags (isServiceEnabled)
- User roles and permissions (future)
- Dashboard assessment metrics (future)

### What stays in React Query

- Raw server data with its own lifecycle (cache, refetch, retry)
- Hook-scoped data where freshness matters more than cross-component consistency
- Data that only one component consumes

### Bridge pattern

A hydration hook (`useHydrateOrganizationServices`) calls the backend API via React Query and writes the result into Zustand. Components read from Zustand (pure, synchronous, reactive) instead of owning their own queries.

```
 Backend API
     │
     ▼
React Query (fetch, cache, retry)
     │
     ▼
useHydrateOrganizationServices ──► Zustand Store
                                        │
                              ┌─────────┼─────────┐
                              ▼         ▼         ▼
                         AppSidebar  ClientIndicator  ServiceDashboard
```

---

## Store Design

### `organizationStore` (pilot)

```typescript
interface OrganizationState {
  selectedOrganization: TenantResource | null;
  organizations: TenantResource[];
  selectedGroup: Group | null;
  groups: Group[];
  tenantServices: TenantServiceResource[];
  orgFlags: OrganizationFlags;
  isLoadingOrganizations: boolean;
  hasFetchedOrganizations: boolean;
  // ... actions
}
```

Features:

- **Persistence**: `selectedOrganization` is persisted to `localStorage` via get/set/clear
- **DevTools**: wrapped in `zustand/middleware/devtools` for debugging
- **Derived flags**: `orgFlags` is computed synchronously from `tenantServices` array, never stale
- **Pure derive function**: `deriveOrganizationFlags(services)` is exported for testing and reuse

---

## Pilot Scope

- `src/stores/organizationStore.ts` — store definition
- `src/hooks/useHydrateOrganizationServices.ts` — React Query → Zustand bridge
- `src/components/layout/AppSidebar.tsx` — migrated from own `useQuery` to `useHydrateOrganizationServices` + `useOrganizationStore`

---

## Migration Plan

### Phase 1 (done — this PR)

1. Install zustand
2. Create `organizationStore` with tenant + services state
3. Create `useHydrateOrganizationServices` bridge hook
4. Wire AppSidebar to use the store (proof of concept)

### Phase 2 (next)

1. Migrate `ClientServicesDialog`’s `listByOrganization` + flag derivation
2. Migrate `ClientProfileSheet`’s `listByOrganization` + flag derivation
3. Add `userRoles` slice (extract from `useUserRoles` hook)

### Phase 3 (future)

1. Add `dashboardMetrics` slice (extract from `useDashboardMetrics`)
2. Add `assessmentTrends` slice (extract from `useAssessmentTrends`)
3. Evaluate whether `ClientContext` can be fully replaced by the store

### Phase 4 (long-term)

1. Migrate remaining per-component React Query calls that overlap across consumers
2. Consider removing `ClientContext` entirely in favor of `useOrganizationStore`

---

## Risks

| Risk | Mitigation |
|------|------------|
| React Query + Zustand devs may write to wrong layer | Bridge hook is the single writer; components only read from Zustand |
| Duplication between ClientContext and store in Phase 1 | Both coexist; store is additive, context still provides canManageMultipleClients and other Context-only fields |
| Migration scope creep | Phased plan with explicit checkpoints; each phase is independently testable |
| Bundle size increase | zustand v5 is ~1.2 KB gzipped; negligible |

---

## Non-Goals

- Replacing React Query (it remains the server-state cache)
- Rewriting `ClientContext` in this PR (it stays)
- Adding middleware beyond devtools (persist, immer, etc. — evaluate later)
- Fixing pre-existing type issues or lint errors unrelated to the store

---

## References

- [Zustand v5 docs](https://zustand.docs.pmnd.rs/)
- [Existing state — ClientContext.tsx](../../src/contexts/ClientContext.tsx)
- [Existing state — AppSidebar.tsx orgFlags query](../../src/components/layout/AppSidebar.tsx)
