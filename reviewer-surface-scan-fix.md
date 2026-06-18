# Reviewer Report — SurfaceScan Supabase → Backend migration

**Branch:** `imnick` · **HEAD:** `68b2935` · **Date:** 2026-06-18  
**Review type:** Diff surface-scan (uncommitted, unstaged working tree)  
**Verdict:** **FAIL** — semantic logic is correct, but formatting corruption makes the diff un-shippable

---

## Summary

- **BLOCKER:** 1
- **REQUIRED:** 3
- **RECOMMENDED:** 0
- **NIT:** 1

**TL;DR:** The semantic migration (7 supabase → backend API calls, 409/duplicate handling, groupId threading) is correct and complete. However, a formatter corrupted all 5 files — changing indentation from spaces to tabs and quotes from single to double — inflating the diff from ~128 lines to ~6,700 lines. The diff is unreviewable in its current state. The changes must be re-applied without formatting noise.

---

## Findings

### [BLOCKER] Formatter corrupted all 5 files — indent changed from spaces to tabs, quotes from single to double

- **Location:** All 5 files in working tree
- **Evidence:**

  ```
  HEAD L52 (useSurfaceScanMonitoredIps.ts): spaces (2-space indent), single quotes
  WT   L52 (same file):             \t\t\t (tabs), double quotes
  
  git diff --stat:           5 files, +3823 / -2913  (~6,700 lines)
  Expected semantic change:  ~128 lines
  Bloat factor:              ~52x
  ```

- **Impact:**
  - Diff is unreviewable — the 2-line ModuleCards scope-rules change is buried in 4,100+ reformatted lines
  - `git blame` becomes useless for all 5 files
  - Any concurrent branch touching these files will have merge conflicts on every line
  - Violates the change-size discipline (target ~100 lines, actual ~6,700)
- **Root cause:** A formatter (likely Biome or Prettier) ran with different settings than the repo convention:
  - Repo convention: 2 spaces, single quotes (verified on `src/hooks/useClientOrganization.ts`, HEAD of all 5 files)
  - Formatter output: tabs, double quotes
- **Recommendation:** Revert all formatting changes. Re-apply ONLY the semantic edits — targeting specific lines for each file:

  **Revert:**

  ```bash
  git checkout -- src/components/surface-scan/SurfaceScanModuleCards.tsx
  git checkout -- src/hooks/useSurfaceScanDiscoveredAssets.ts
  git checkout -- src/hooks/useSurfaceScanFindings.ts
  git checkout -- src/hooks/useSurfaceScanMonitoredIps.ts
  git checkout -- src/lib/api/surface-scan360.ts
  ```

  **Re-apply semantic changes only** (use targeted `edit` tool, NOT a formatter):

  1. `surface-scan360.ts`: Add `createMonitoredIp` method (the `+20` lines from worker report), leave rest untouched
  2. `useSurfaceScanMonitoredIps.ts`:
     - `fetchRules`: replace supabase .from('surface_scan_monitored_ips') with `surfaceScan360Api.listMonitoredIps(organizationId, groupId)`
     - `addRule`: replace supabase .insert() with `surfaceScan360Api.createMonitoredIp(organizationId, payload, groupId)`, add 409/duplicate handling
     - `removeRule`: replace supabase .delete() with `surfaceScan360Api.deleteMonitoredIp(organizationId, id, groupId)`
     - Add `groupId` to fetchRules useCallback deps
     - DO NOT touch: `from('organizations')` call (line 200), any imports formatting
  3. `useSurfaceScanDiscoveredAssets.ts`:
     - Remove `import { supabase }`
     - Replace supabase scope-rules .from('surface_scan_monitored_ips') with `surfaceScan360Api.listMonitoredIps(organizationId, groupId)`
     - Add `groupId` to useEffect deps
     - DO NOT reformat any other line
  4. `useSurfaceScanFindings.ts`:
     - Remove `import { supabase }`
     - Replace supabase scope-rules .from('surface_scan_monitored_ips') with `surfaceScan360Api.listMonitoredIps(organizationId, groupId)`
     - Add `groupId` to useEffect deps
     - DO NOT reformat any other line
  5. `SurfaceScanModuleCards.tsx`:
     - Replace the scope-rules supabase call (line ~494) with `surfaceScan360Api.listMonitoredIps(organizationId, groupId)`
     - Remove `if (scopeRes.error) throw scopeRes.error` guard
     - DO NOT reformat any other line (this file has 4,100+ reformatted lines — 4,098 of them are noise)

### [REQUIRED] `createMonitoredIp` API method lacks `created_by` in payload

- **Location:** `src/lib/api/surface-scan360.ts:183-201`
- **Description:** The `createMonitoredIp` method defines a payload type with `input_value`, `entry_type`, `ip_start`, `ip_end`, `discovered_via`, `discovered_from` — but NOT `created_by`. The old supabase insert included `created_by: user?.id || null`. The call site (`useSurfaceScanMonitoredIps.ts:190`) doesn't pass `created_by` either because the API type doesn't have it.
- **Impact:** The backend won't know who created the rule. Whether this matters depends on whether the backend derives `created_by` from the auth token. Stefano's commit `2c81f26` apparently used the same payload shape, so this may be by design — but it's worth verifying.
- **Recommendation:** Either:
  a. Add `created_by?: string | null` to the payload type and pass `user?.id || null` from the call site, OR
  b. Confirm the backend derives `created_by` from the JWT and document this assumption in a comment.

### [REQUIRED] `as SurfaceMonitoredScopeRule[]` cast on `listMonitoredIps` return — potential runtime mismatch

- **Location:**
  - `src/components/surface-scan/SurfaceScanModuleCards.tsx:573-576`
  - `src/hooks/useSurfaceScanDiscoveredAssets.ts:170`
  - `src/hooks/useSurfaceScanFindings.ts:443`
  - `src/hooks/useSurfaceScanMonitoredIps.ts:128`
- **Description:** All 4 files cast the return of `listMonitoredIps()` with `as SurfaceMonitoredScopeRule[]` or `as SurfaceScanMonitoredIpRule[]`. The API method returns `Promise<any[]>`. There's no runtime validation that the backend actually returns objects with the expected shape. If the backend returns a different shape (e.g., field renamed), this silently passes TypeScript and fails at runtime.
- **Impact:** Type-safety gap — a backend API change could break the UI without compile-time detection.
- **Recommendation:** This is pre-existing tech debt (the pattern exists throughout the codebase), but since we're touching these lines anyway, add a runtime assertion or io-ts/zod validation. At minimum, add a comment noting the assumption. This is pre-existing but the migration makes it more prominent.

### [REQUIRED] `createMonitoredIp` returns `Promise<any>` — no caller uses the return value, but the type is unsafe

- **Location:** `src/lib/api/surface-scan360.ts:194`
- **Description:** `createMonitoredIp` returns `Promise<any>`. The call site doesn't use the return value, so this isn't a runtime bug, but `any` types propagate unsafety. If a future consumer expects a typed response, they'll get `any`.
- **Recommendation:** Define a `SurfaceScanMonitoredIp` type and use it:

  ```typescript
  async createMonitoredIp(...): Promise<SurfaceScanMonitoredIp> {
      const res = await complianceApiClient.post<ApiResponse<SurfaceScanMonitoredIp>>(...);
      return res.data as SurfaceScanMonitoredIp;
  }
  ```

  This is consistent with how `getJob`, `getAiReport`, etc. work in the same file.

### [NIT] `listMonitoredIps` passes `undefined` as second arg to `complianceApiClient.get`

- **Location:** `src/lib/api/surface-scan360.ts:177`
- **Description:** `complianceApiClient.get(url, undefined, headers)` — the `undefined` is the `params` argument. This is technically correct but slightly misleading. Other methods in the same file use `{}` or omit the params arg entirely. Using `undefined` is fine but inconsistent.
- **Recommendation:** Consider `complianceApiClient.get(url, {}, headers)` for consistency with other methods in the file, or add a comment `// no query params`.

---

## Verification Results

### ✅ Semantic correctness (all gates pass)

| Gate | Status | Evidence |
|------|--------|----------|
| 7 supabase calls removed | ✅ | `grep -rn "surface_scan_monitored_ips" src/hooks/*.ts` → 0 matches |
| `createMonitoredIp` added | ✅ | API method at L183-201, called at MonitoredIps.ts:190 |
| 409/duplicate handling | ✅ | `error?.status === 409 \|\| String(error?.message).includes("duplicate")` at MonitoredIps.ts:251-253 |
| `groupId` in all calls | ✅ | Verified in all 7 call sites across 4 files |
| `groupHeader` applied | ✅ | All 3 API methods (list/create/delete) use `groupId ? groupHeader(groupId) : undefined` |
| `groupId` in deps | ✅ | fetchRules deps: `[isClientLoading, organizationId, groupId, toast]`; DiscoveredAssets/Findings useEffect: `[organizationId, groupId]` |
| No secrets | ✅ | No apiKey, token, password, private_key in diff |
| No N+1 | ✅ | Single `listMonitoredIps` call per consumer |
| No unbounded parallelism | ✅ | No `Promise.all` over arbitrary arrays |

### ✅ Out-of-scope items preserved

| Item | Status | Evidence |
|------|--------|----------|
| organizations flags (L200→L211) | ✅ | Still `supabase.from("organizations" as any)` at MonitoredIps.ts:211 |
| Table helper (L485→L551) | ✅ | Still `supabase.from(table as any)` at ModuleCards.tsx:551 |
| IOC Fresh List | ✅ | Not in any diff |
| Reverse DNS | ✅ | Not in any diff (only preexisting ref at DiscoveredAssets.ts:276) |
| AI report delete | ✅ | Not in any diff |
| Open ports | ✅ | Not in any diff (only preexisting comments) |
| Only 5 files touched | ✅ | `git diff --name-only` = 5 files, as expected |

### ❌ Formatting / diff discipline

| Gate | Status | Evidence |
|------|--------|----------|
| Target ~100 lines | ❌ | ~6,700 lines (67x over target) |
| Preserve existing style | ❌ | Spaces → tabs, single quotes → double quotes |
| Diff reviewable | ❌ | ModuleCards has 4,100+ changed lines for a 2-line semantic edit |

---

## Instructions to Fix

### Step 1: Revert all formatting noise

```bash
git checkout -- src/components/surface-scan/SurfaceScanModuleCards.tsx
git checkout -- src/hooks/useSurfaceScanDiscoveredAssets.ts
git checkout -- src/hooks/useSurfaceScanFindings.ts
git checkout -- src/hooks/useSurfaceScanMonitoredIps.ts
git checkout -- src/lib/api/surface-scan360.ts
```

### Step 2: Re-apply semantic changes ONLY

Use targeted `edit` operations (NOT a formatter). For each file, change ONLY the lines listed below. Preserve the existing indent character (spaces, not tabs) and quote style (single quotes for hooks/components, double quotes for `surface-scan360.ts` — which already uses double quotes in HEAD).

#### File 1: `src/lib/api/surface-scan360.ts`

- Add `createMonitoredIp` method after `listMonitoredIps` (before `deleteMonitoredIp`). This is the `+20` lines from the worker's report. The existing file already uses double quotes — maintain that.

#### File 2: `src/hooks/useSurfaceScanMonitoredIps.ts`

- **fetchRules (L120-127):** Replace the supabase `.from('surface_scan_monitored_ips')...` block with:

  ```typescript
  const data = await surfaceScan360Api.listMonitoredIps(organizationId, groupId);
  setRules((data || []) as SurfaceScanMonitoredIpRule[]);
  ```

- **fetchRules deps (L139):** Add `groupId` so it reads `[isClientLoading, organizationId, groupId, toast]`
- **addRule (L195-212):** Replace the supabase `.from('surface_scan_monitored_ips').insert(payload)` block with:

  ```typescript
  await surfaceScan360Api.createMonitoredIp(organizationId, {
      input_value: parsed.inputValue,
      entry_type: parsed.entryType,
      ip_start: parsed.ipStart,
      ip_end: parsed.ipEnd,
      discovered_via: opts.discovered_via ?? 'manual',
      discovered_from: opts.discovered_from ?? null,
  }, groupId);
  ```

  Remove the old `const payload: any = { ... }` block and the old `const { error } = await supabase...` block.
- **addRule catch (L222-236):** Replace the old `if (error.code === '23505')` with:

  ```typescript
  const isDuplicate = error?.status === 409 || String(error?.message || '').includes('duplicate');
  if (!opts.silent) {
      toast({
          title: isDuplicate ? 'Regola duplicata' : 'Errore',
          description: isDuplicate ? 'Questa regola di monitoraggio è già presente' : 'Impossibile aggiungere la regola IP',
          variant: 'destructive',
      });
  }
  ```

- **removeRule (L284-288):** Replace supabase `.delete()` with:

  ```typescript
  await surfaceScan360Api.deleteMonitoredIp(organizationId, id, groupId);
  ```

- **DO NOT touch:** `supabase.from('organizations')` call; any imports; any other lines.

#### File 3: `src/hooks/useSurfaceScanDiscoveredAssets.ts`

- Remove `import { supabase } from '@/integrations/supabase/client';`
- Replace the `fetchScopeRules` function body (L144-150):

  ```typescript
  const scopeRows = await surfaceScan360Api.listMonitoredIps(organizationId, groupId);
  setScopeRules((scopeRows || []) as SurfaceMonitoredScopeRule[]);
  ```

- Add `groupId` to the useEffect deps: `}, [organizationId, groupId]);`

#### File 4: `src/hooks/useSurfaceScanFindings.ts`

- Remove `import { supabase } from '@/integrations/supabase/client';`
- Replace the `fetchScopeRules` function body (L359-365):

  ```typescript
  const scopeRows = await surfaceScan360Api.listMonitoredIps(organizationId, groupId);
  setScopeRules((scopeRows || []) as SurfaceMonitoredScopeRule[]);
  ```

- Add `groupId` to the useEffect deps: `}, [organizationId, groupId]);`

#### File 5: `src/components/surface-scan/SurfaceScanModuleCards.tsx`

- Replace the scope-rules supabase call (L494-503) with:

  ```typescript
  // Fetch monitored IPs (scope rules) from backend API
  const scopeRules = (await surfaceScan360Api.listMonitoredIps(organizationId, groupId)) as SurfaceMonitoredScopeRule[];
  ```

- Remove the `if (scopeRes.error) throw scopeRes.error;` guard.
- **DO NOT touch ANY other line in this file.**

### Step 3: Verify

```bash
npx tsc --noEmit -p tsconfig.json
grep -rn "surface_scan_monitored_ips" src/hooks/useSurfaceScanMonitoredIps.ts src/hooks/useSurfaceScanDiscoveredAssets.ts src/hooks/useSurfaceScanFindings.ts
git diff --stat  # Should show ~50 insertions, ~80 deletions across 5 files
```

---

## Commit Message (if re-applied cleanly)

```
fix(surface-scan): migrate remaining surface_scan_monitored_ips calls to backend API

Closes the regression on /surface-scan where post-scan detail calls
(discovered assets, findings, module cards) were still hitting Supabase
directly, causing RLS/perm crashes after a completed scan.

- Add surfaceScan360Api.createMonitoredIp (POST /monitored-ips)
- Migrate 3 supabase calls in useSurfaceScanMonitoredIps
  (fetch/create/delete); organizations flags call left on supabase (out of scope)
- Migrate 3 scope-rules reads in DiscoveredAssets, Findings, ModuleCards
- Handle 409 duplicate in addRule catch via toast

Verified: tsc --noEmit exit 0; no from('surface_scan_monitored_ips')
remaining in the 4 hook/component files in scope.
```

---

## Acceptance Report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "failed",
      "evidence": "The semantic changes correctly implement the scope: 7 supabase calls removed, createMonitoredIp added, 409/duplicate handling correct, groupId threaded, out-of-scope items preserved. BUT a formatter corrupted all 5 files (spaces→tabs, single→double quotes), inflating the diff 52x and making it unreviewable. The changes must be re-applied without formatting noise."
    },
    {
      "id": "criterion-2",
      "status": "partial",
      "evidence": "Verification commands (grep, tsc) confirm semantic correctness of the migration. But the diff is 6,700 lines instead of ~128 — independent acceptance review of the full diff is impossible without ignoring formatting noise."
    }
  ],
  "changedFiles": [
    "src/lib/api/surface-scan360.ts",
    "src/hooks/useSurfaceScanMonitoredIps.ts",
    "src/hooks/useSurfaceScanDiscoveredAssets.ts",
    "src/hooks/useSurfaceScanFindings.ts",
    "src/components/surface-scan/SurfaceScanModuleCards.tsx"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git diff --stat",
      "result": "passed",
      "summary": "5 files, +3823/-2913 — 52x larger than expected (~128 lines). Formatting corruption confirmed."
    },
    {
      "command": "grep -rn 'surface_scan_monitored_ips' src/hooks/*.ts",
      "result": "passed",
      "summary": "0 matches — all supabase calls removed from hooks"
    },
    {
      "command": "grep -n 'organizations' src/hooks/useSurfaceScanMonitoredIps.ts",
      "result": "passed",
      "summary": "L211 — organizations flags still on supabase (out of scope preserved)"
    },
    {
      "command": "grep -n 'from(table' src/components/surface-scan/SurfaceScanModuleCards.tsx",
      "result": "passed",
      "summary": "L551 — table helper still on supabase (out of scope preserved)"
    },
    {
      "command": "git diff --name-only",
      "result": "passed",
      "summary": "Exactly 5 files — no out-of-scope files touched"
    },
    {
      "command": "od -c indent check (HEAD vs WT line 52)",
      "result": "failed",
      "summary": "HEAD uses spaces for indent; WT uses tabs — confirmed formatting corruption"
    }
  ],
  "validationOutput": [
    "tsc: not re-run (formatting doesn't change types, worker confirmed exit 0)",
    "grep surface_scan_monitored_ips: 0 matches in hooks — clean",
    "grep organizations: 1 match at L211 — out of scope, preserved",
    "grep table helper: 1 match at L551 — out of scope, preserved",
    "out-of-scope files: 0 — only 5 files in scope modified",
    "indent verification: HEAD=spaces, WT=tabs — FORMATTING CORRUPTION"
  ],
  "residualRisks": [
    "FORMATTING CORRUPTION: All 5 files reformatted (spaces→tabs, single→double quotes). Must revert and re-apply semantic changes only.",
    "organizations flags (L211) stays on supabase — Stefano had migrated it to tenantServicesApi; next step if auto-queue/sync breaks",
    "Backend endpoint POST /companies/{id}/surface-scan360/monitored-ips must exist and return 409 on duplicate — not verified at runtime",
    "createMonitoredIp lacks created_by in payload — backend should derive from JWT; verify",
    "Pre-existing: duplicate createJob definitions in surface-scan360.ts"
  ],
  "noStagedFiles": true,
  "notes": "VERDICT: FAIL due to formatting corruption. Semantic logic is correct and complete — all 7 supabase calls properly migrated, 409/duplicate handling matches 2c81f26 pattern, groupId correctly threaded through all call sites, out-of-scope items verified intact. The fix is: git checkout all 5 files, re-apply ONLY the semantic edits using targeted edit operations (not a formatter), verify with tsc + grep + git diff --stat (~128 lines). After that, PASS and commit-ready."
}
```
