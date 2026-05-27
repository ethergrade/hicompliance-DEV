# dispatching worker for API wiring task

Worker: complete the API wiring task defined in /tmp/api-wiring-task.md

Key files to read first:
1. /Users/imnick/Downloads/API_CHANGES_2026-05-27.md — new API spec
2. /Users/imnick/Nick/HiSolution/hicompliance-DEV/src/lib/api/tenants.ts — pattern to follow
3. /Users/imnick/Nick/HiSolution/hicompliance-DEV/src/lib/api/assessment.ts — existing assessment API
4. /Users/imnick/Nick/HiSolution/hicompliance-DEV/src/lib/api/index.ts — where to export new modules
5. /Users/imnick/Nick/HiSolution/hicompliance-DEV/src/lib/api-client.ts — apiClient implementation
6. /Users/imnick/Nick/HiSolution/hicompliance-DEV/src/types/api.ts — where to add new types

CRITICAL: The apiClient.get/post/put/patch/delete<T>(url, data?) returns `T` directly - you DON'T need to unwrap `.data` for every call. The response is `{ success, message, data }` and apiClient already unwraps it.

Steps in order:
1. Create new API modules (assessment-v2.ts, asset-inventory.ts, remediation-tasks.ts, risk-analysis.ts, playbook-completions.ts, dark-risk-alerts.ts)
2. Add types to types/api.ts
3. Export from index.ts
4. Replace supabase imports in pages
5. Test with npx tsc --noEmit (or similar)
6. Commit with engram task UUID

For step 4, the pages to modify are:
- src/pages/AssetInventory.tsx (uses supabase directly)
- src/pages/IncidentResponse.tsx (uses supabase directly)
- src/pages/Assessment.tsx (uses @/data/assessmentQuestions mock data - replace with API calls)
- src/pages/Remediation.tsx (already uses assessmentApi - just verify/update)
- Any other page that imports supabase and has matching new API