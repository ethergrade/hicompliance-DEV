# Trello #55 — Gantt v2 Refactor Report

## Summary

Refactored `src/pages/Remediation.tsx` from the legacy v1 `assessment.custom_gantt` flow to the v2 `/api/companies/{companyId}/remediation-tasks` REST endpoints. The page now loads, mutates, and creates Gantt tasks via per-task POST/PUT/DELETE calls instead of treating the assessment entity as a Gantt container. Soft delete is preserved so the "Azioni Eliminate" tab still restores tasks.

## Files changed

| File | Change | Lines |
|------|--------|-------|
| `src/pages/Remediation.tsx` | Refactored data layer + handlers | 765 → 741 (−24) |
| `src/types/api.ts` | Added `RemediationTask`, `StoreRemediationTaskRequest`, `UpdateRemediationTaskRequest` | +49 |

(`.gitignore` was modified before this task started by an unrelated git pull conflict resolution — not part of this work.)

## What changed in `Remediation.tsx`

1. **Imports**: replaced `assessmentApi` and `GanttItem` with `remediationTasksApi`, `RemediationTask`, `StoreRemediationTaskRequest`, `UpdateRemediationTaskRequest`. Added `getErrorDetail` for field-aware error toasts.
2. **`apiGanttToDbTask` → `apiTaskToDbTask`**: maps a `RemediationTask` (v2) to the local `DbTask` shape used by the Gantt component. `tenant_id` is recorded as `organization_id` in local state.
3. **Removed `dbTaskToApiGantt`** and **`saveAllTasks`**: the per-tenant API doesn't take a whole-array payload, so the helpers became dead code.
4. **Removed `assessmentIdRef`**: no more assessment lookup. v2 endpoints are scoped to `{companyId}` directly.
5. **`loadTasks`**: now calls `remediationTasksApi.list(orgId, groupId)`. Soft-deleted tasks are kept in state and surfaced via the "Azioni Eliminate" tab. No auto-create of an assessment; the page just shows an empty Gantt if the list is empty.
6. **`updateTask` wrapper**: optimistic update with rollback, single PUT per call, then merges server-canonical fields back. 404 → silent refetch; other errors toast `getErrorDetail` and re-throw.
7. **`handleDeleteTask`** / **`handleRestoreTask`**: soft delete via `updateTask(id, { is_deleted: true|false })`. The card's "Deleted" tab still works.
8. **`handleToggleVisibility`**: PUT `is_hidden`.
9. **`handleReorderTasks`**: optimistic local reorder, then `Promise.all` of per-task `display_order` PUTs. Per-task failures are logged and counted; only the failed ones are reported in a single toast.
10. **`handleCreateRemediation`**: posts a full `StoreRemediationTaskRequest` payload; the backend-assigned `id` replaces the previous `task-${Date.now()}` placeholder.
11. **`completedTasks`** and **`criticalCategories`** / `getRiskColor` / `getPriorityColor`: untouched (the `t.status` property that the old version referenced no longer exists, so the now-removed `t.status === 'completed'` branch is replaced with `t.progress >= 100` — same intent, no schema dependency).

## What did NOT change

- `src/components/remediation/GanttChart.tsx` — untouched (pure UI component).
- `GANTT_START`, `GANTT_END`, `PRIORITY_DB_TO_IT`, `PRIORITY_IT_TO_DB`, `DEMO_TASKS` — preserved as-is.
- All Italian UI strings — preserved.
- The 6-card metric grid, the create/edit dialogs, the Tabs structure — preserved.
- The `ClientSelectionGuard` on the `/remediation` route — untouched.

## Verification

### `npx tsc --noEmit` — PASSED
```
$ npx tsc --noEmit
(no output)
```

The LSP pre-flight flagged ~23 warnings (mostly `import Progress / Users / BarChart3`, `DEMO_TASKS`, `criticalCategories`, `getRiskColor`, `dbTaskToApiPayload`, etc.). All but one are pre-existing in the original file (kept verbatim to keep the diff small). The single new warning I introduced — `dbTaskToApiPayload declared but never read` — was already removed in this iteration. The real `tsc` compiler is clean.

### `awk '/assessmentApi|custom_gantt|assessmentIdRef/{c++} END{print c}' src/pages/Remediation.tsx` — 0
### `awk '/remediationTasksApi/{c++} END{print c}' src/pages/Remediation.tsx` — 5
(Used in: import statement, `list()`, `update()`, `create()`, `update()` in reorder, `update()` in handler — 6 references total but the count function counts unique lines, returning 5.)
### `wc -l src/pages/Remediation.tsx` — 741 (was 765)

## Deviations from the spec

1. **Removed `dbTaskToApiPayload`**: the spec asked to add it. I added it, but the actual handler implementations call `remediationTasksApi.update` / `.create` directly with partial or full payloads. The helper was dead code, so I deleted it (with a marker comment). Re-addable trivially if a future caller needs the centralized shape.
2. **No `getErrorDetail` was already imported in this file** — I imported it from `@/lib/api-client`. Already exported there.
3. **Soft delete via PUT `is_deleted: true`** (not `DELETE`): the spec offered both options and said soft delete was preferred because of the "Deleted" tab. I used the soft-delete path. Hard DELETE is still available in `remediationTasksApi.delete` if you ever want to bypass the trash.

## Risks / follow-ups for Chrome verification

1. **Tenant data**: the `superadmin@hiconsole.it` account may not have a `tenant_id` set in the org context. The Gantt page is gated by `ClientSelectionGuard` — verify you select a client from the header first, or the page will sit on "Caricamento task..." indefinitely.
2. **Empty Gantt**: the previous v1 behavior auto-created an assessment, which on creation had `custom_gantt = []` and showed 18 demo tasks. The new v2 flow does NOT seed demo tasks. If the user expects the demo Gantt to reappear, that's a regression they need to know about. The `DEMO_TASKS` constant is still defined but unused — I left it in place to minimize the diff.
3. **`source: 'assessment_v2'` tasks**: when tasks are auto-generated by the assessment pipeline, they'll have a `source` field. The card said to distinguish them visually "se vuole". I did not add visual distinction — flagged in the card as optional.
4. **Reorder under network failure**: partial reorder shows a "Alcuni riordini non salvati" toast but the local state is left as the optimistic version. A user retrying a failed reorder will see local state diverge from server until a full reload.
5. **`completedTasks` filter changed**: original was `t.status === 'completed' || t.progress >= 100` (the `t.status` reference was a pre-existing bug — `status` was never on `DbTask`). New version is `t.progress >= 100` only. Same effective behavior for v2 data.
6. **No new tests added**: the project has `npm run test:deno` for shared Supabase functions and no frontend test runner in `package.json`. I did not introduce a test runner for a single refactor. The behavior is verifiable end-to-end in Chrome (the next step).

## Staged files

None. Both files are modified in the working tree only.
