# Baseline

- Commit: 4d29f6bd10e6ed4aef2d6b7395e18ecc7e43f12b
- Prior artifacts used: none (fresh investigation)
- Graphify status: OK (at 2026-06-23)

## Delta (since baseline)

- No DarkRisk-related changes in the last commit
- Last relevant commit: `8ae55b2 fix: align DarkRisk360 entitlement gating with client flags`

## State snapshot

### Files investigated

| File | Path | Lines |
|------|------|-------|
| StandardDarkRiskPage | `src/features/darkrisk/standard/StandardDarkRiskPage.tsx` | 1–113 |
| ExtendedDarkRiskPage | `src/features/darkrisk/extended/ExtendedDarkRiskPage.tsx` | 1–107 |
| DarkRisk360 (route page) | `src/pages/DarkRisk360.tsx` | 1–2525 |
| Entitlement hook | `src/features/darkrisk/shared/useDarkRiskEntitlements.ts` | 1–23 |
| Gateway | `src/features/darkrisk/api/darkRiskGateway.ts` | 1–245 |
| AuthProvider | `src/components/auth/AuthProvider.tsx` | 1–361 |
| DashboardLayout | `src/components/layout/DashboardLayout.tsx` | 1–60 |
| useClientOrganization | `src/hooks/useClientOrganization.ts` | 1–58 |
| useDarkRiskOverview | `src/hooks/useDarkRiskOverview.ts` | 1–240 |
| Router config | `src/App.tsx` | 1–115 |
| CSS theme | `src/index.css` | 1–119 |
| Shared components | `src/features/darkrisk/shared/ReportList.tsx`, `ScopeEditor.tsx` | |
| Entitlement resolver | `src/features/darkrisk/shared/entitlementResolver.ts` | 1–31 |

### Route structure

- `/dark-risk` → `lazy(StandardDarkRiskPage)` wrapped in Suspense + ClientSelectionGuard
- `/dark-risk-esteso` → `lazy(ExtendedDarkRiskPage)` wrapped in Suspense + ClientSelectionGuard
- No route for `DarkRisk360.tsx` — component likely embedded elsewhere

---

## Findings

### CRITICAL: No Error Boundaries (all DarkRisk pages)

**File:** `src/pages/DarkRisk360.tsx`, `src/features/darkrisk/standard/StandardDarkRiskPage.tsx`, `src/features/darkrisk/extended/ExtendedDarkRiskPage.tsx`

None of the DarkRisk pages have React Error Boundaries. The router (`src/App.tsx:84-85`) only wraps them in `<Suspense>` for lazy loading, which catches thrown promises — **not runtime errors**.

If any child component crashes during render (e.g., an API returns unexpected data shape, a hook throws, a child component accesses a property on `undefined`), the error propagates to the React root with **no error boundary to catch it**. React's default behavior is to unmount the entire component tree, leaving only the `DashboardLayout` wrapper with its dark `bg-background` (HSL 220 27% 7%, near-black from `src/index.css:12`). The result: a black/blank page.

**Intermittent trigger:** This would manifest "often" (intermittently) because it depends on API response shapes that vary between organizations or deployment states.

---

### MEDIUM: `useDarkRiskEntitlements` has `retry: false`

**File:** `src/features/darkrisk/shared/useDarkRiskEntitlements.ts:14`

```ts
retry: false,
```

If the entitlements API call (`darkRiskGateway.getEntitlements` at `darkRiskGateway.ts:84-118`) fails, the query is permanently in error state. The component does NOT check `isError` on the entitlements hook — only `isLoading` and `standardEnabled`/`extendedEnabled`.

**Effect:** An entitlement API failure causes `standardEnabled: false` and `extendedEnabled: false`. The StandardPage renders the "DarkRisk360 non attivo" card (line 79-80). The ExtendedPage renders the "DarkRisk360 Esteso non attivo" card (line 79-80). This is a misleading UX state (shows disabled when the feature should work) but not a black page.

---

### MEDIUM: No per-query error handling for scope/overview/reports

**File:** `StandardDarkRiskPage.tsx:29-47`, `ExtendedDarkRiskPage.tsx:29-47`

The scope, overview, and reports queries all lack individual `isError` checks in the render output. If these queries fail:

- `scopeQuery.data` → `undefined` → fallback `{ targets: [] }` (line 87)
- `overviewQuery.data` → `undefined` → cards show `"—"` (lines 56-60)
- `reportsQuery.data` → `undefined` → fallback `[]` (line 107)

**Effect:** The user sees the full dashboard with placeholder/empty values, but no error message. Not a black page, but confusing UX that mimics a data-less state (could be perceived as "broken" by users).

---

### MEDIUM: Race condition during organization switch

**File:** `src/hooks/useClientOrganization.ts:36-37`

```ts
// Non ripiegare su userOrganizationId (che è il groupId, non il companyId):
// durante il cambio gruppo selectedOrganization è null per un breve window
// e gli hook devono skippare le chiamate finché il companyId non è pronto.
```

During an organization/group switch, `organizationId` is `null` for a brief period. The entitlement hooks and data queries are disabled (`enabled: Boolean(organizationId)`). During this window:

- `useDarkRiskEntitlements(null)` → `enabled: false` → `isLoading: false` → `standardEnabled: false` → page shows "non attivo" card
- Then organization loads → queries fire → page updates

This is a transient state that could briefly show incorrect UI but not a black page.

---

### MEDIUM: Dark theme makes empty states appear black

**File:** `src/index.css:12`, `src/components/layout/DashboardLayout.tsx:21`

The theme is dark by default (`--background: 220 27% 7%` — near-black with a hint of blue). The DashboardLayout uses `bg-background` which renders this color.

Any state where the main content area is empty (loading, crash, uncaught error, Suspense fallback without visible content) will display as a dark/black page. The Suspense fallback text (`"Caricamento DarkRisk360…"` at `src/App.tsx:53`) uses `text-muted-foreground` which is `217 19% 63%` — a muted gray that may be hard to see on the near-black background, especially on low-brightness mobile screens.

---

### LOW: AuthProvider black screen fix already applied

**File:** `src/components/auth/AuthProvider.tsx:300-302, 322-326`

The AuthProvider already has explicit fixes for black screen scenarios:

- Fixed: "black screen + repeated 422s after logout" (line 301-302) via `queryClient.clear()`
- Fixed: "black screen that happened because AuthProvider used to drop children without changing the URL" (line 323-326)
- Guard: If not loading and no user, renders minimal context without children for protected routes (line 344-358)

These fixes are already in place, so session-related black pages should not occur.

---

### LOW: `entitlementResolver` defensive against nulls

**File:** `src/features/darkrisk/shared/entitlementResolver.ts:14-32`

```ts
export const resolveDarkRiskEntitlements = (
    api: Partial<DarkRiskEntitlements> | null | undefined,
    hints: DarkRiskEntitlementHints | null | undefined,
): DarkRiskEntitlements => {
```

Handles all null/undefined inputs safely. Even if both `getData` and Supabase hints fail in `darkRiskGateway.getEntitlements`, the resolver returns `{ standardEnabled: false, extendedEnabled: false }`.

---

### LOW: `useDarkRiskOverview` has a safe emptyData fallback

**File:** `src/hooks/useDarkRiskOverview.ts:156-213, 236-239`

```ts
return {
    ...query,
    data: query.data || emptyData,
};
```

`overview` is NEVER `undefined`. Even during loading or error, the component has an `emptyData` object with `tier: 'standard'`, `enabled: false`, and zero-value KPIs. This prevents the crash that would occur at `DarkRisk360.tsx:1560` where `overview.tier` and `overview.enabled` are accessed.

---

## Risk assessment

| Risk | Severity | Cause | User impact |
|------|----------|-------|-------------|
| Runtime crash → black page | **High** | No ErrorBoundary; any child component crash during render unmounts tree | **Black page** — likely the reported issue |
| Entitlement false negative | Medium | `retry: false` on entitlements hook; no error UI | Sees "non attivo" card instead of real content |
| Silent data failure | Medium | No per-query error handling for scope/overview/reports | Dashboard shows `"—"` values, empty lists |
| Brief incorrect state during org switch | Low | `organizationId` null window; entitl. hooks disabled | Transient "non attivo" card |

## Root cause hypothesis

The most likely cause of the intermittent black page is **the absence of error boundaries**. An intermittent runtime error (from an unexpected API response shape, a network timeout at a critical render moment, or a race condition during org switch) crashes a child component during render. Without an `ErrorBoundary`, React unmounts the entire tree, leaving only the `DashboardLayout` dark background visible.

**Chained contributors:**

1. No `ErrorBoundary` at route or page level
2. Dark theme background (`bg-background` = near-black) makes the empty result of an unmounted tree indistinguishable from a "black page"
3. `useDarkRiskEntitlements` has `retry: false` — if it fails on first attempt, the feature appears disabled until manual page refresh, even if the API recovers

## Start Here

**First file to open:** `src/components/layout/DashboardLayout.tsx` — to understand how the dark background wraps all pages and to determine where an `ErrorBoundary` should be inserted (either wrapping each page's content, or at the `DashboardLayout` level to provide a safe fallback UI when child components crash).

Then add an `ErrorBoundary` wrapper in `src/App.tsx:84-85` around the DarkRisk route elements, or add per-page error boundaries in `StandardDarkRiskPage.tsx` and `ExtendedDarkRiskPage.tsx`.

---

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Investigated all requested files + ancillary dependencies (AuthProvider, useClientOrganization, useDarkRiskOverview, App.tsx routing, CSS theme). Identified root cause: missing Error Boundary causes dark page on intermittent render crashes."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git rev-parse HEAD && git log --oneline -5",
      "result": "passed",
      "summary": "Baseline: 4d29f6bd10e6ed4aef2d6b7395e18cce7e43f12b"
    },
    {
      "command": "Reviewed 10+ files via read/grep for error states, null returns, crash vectors",
      "result": "passed",
      "summary": "Full code review completed"
    }
  ],
  "validationOutput": [
    "StandardDarkRiskPage: always renders something (loading/disabled/content). No ErrorBoundary. No per-query error states.",
    "ExtendedDarkRiskPage: same pattern. No ErrorBoundary.",
    "DarkRisk360.tsx: loading + error states present, overview is never undefined via emptyData fallback.",
    "useDarkRiskEntitlements: retry:false can permanently disable feature on first failure. Not checked for isError.",
    "darkRiskGateway: Promise.allSettled handles both API + hints failures gracefully.",
    "AuthProvider: already has black-screen fix for session expiry.",
    "DashboardLayout: bg-background is near-black (HSL 220 27% 7%). Empty/crashed content = black page."
  ],
  "residualRisks": [
    "No ErrorBoundary in DarkRisk pages (primary root cause)",
    "useDarkRiskEntitlements retry:false can cause permanent false-negative entitlements until page refresh"
  ],
  "noStagedFiles": true,
  "diffSummary": "No code changes — investigation-only report",
  "reviewFindings": [
    "no blockers (investigation complete)"
  ],
  "manualNotes": "Report written to context.md. Primary fix: add React ErrorBoundary to StandardDarkRiskPage.tsx and ExtendedDarkRiskPage.tsx (or at route level). Secondary fix: add per-query error UI and/or remove retry:false from useDarkRiskEntitlements."
}
```
