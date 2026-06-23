## Data Quality Investigation — SurfaceScan360 + DarkRisk360 (2026-06-23)

### Status

Scout complete. Read-only analysis of frontend wiring, backend controllers, job-trigger behavior, and data-source mapping for both modules.

### Findings Summary

**SurfaceScan360** (screenshot: jobs pending, detail blocks "completato (nessun dato)" / N.D.):

- Verdict: **Expected empty state** — not a frontend bug.
- Jobs list feed: `GET /companies/{id}/surface-scan360/jobs` via `useSurfaceScanEngine` (15s polling).
- Module detail blocks: `SurfaceScanModuleCards.fetchData()` selects latest completed job per target; falls back to live (possibly queued) job if none completed. Module results only fetched for completed/partial jobs (line 694-700 of SurfaceScanModuleCards.tsx).
- "completato (nessun dato)" = module ran successfully but produced no data observations — legitimate for queued jobs or modules with no findings.
- Job triggering: **manual only** (button click or scope rule addition with auto_queue_scan). No auto-trigger on page load.
- Next step: Check backend queue health — jobs may be stuck queued.

**DarkRisk360** (screenshot: 1 monitored domain, 0/7 coverage, no threats/leaks/findings):

- Verdict: **Partial integration** — KPIs empty because no completed SurfaceScan job exists; findings/assets tabs have TODO stubs.
- Overview endpoint: `GET /companies/{id}/darkrisk/overview` → `DarkriskOverviewController::show`. All KPIs derived from the latest completed/partial SurfaceScan job. 0/7 coverage means no job completed yet.
- Monitored domain count (1) comes from `surface_scan_monitored_ips` table — independent of scan jobs.
- **Known gap**: Findings tab and Assets tab use hardcoded `{ data: [], error: null }` stubs with `// TODO: migrate to backend API` markers (DarkRisk360.tsx:326, 430, 454, 877). These tabs will never show data.
- Job triggering: **manual only** (button click or scope rule addition with auto_sync_darkrisk). No auto-trigger on page load.
- Next step: Start a SurfaceScan job, wait for completion, then verify DarkRisk overview populates. The findings/assets tabs need backend migration.

### Files Analyzed

- `src/pages/SurfaceScan360.tsx`, `src/pages/DarkRisk360.tsx`
- `src/components/surface-scan/SurfaceScanJobsPanel.tsx`, `SurfaceScanModuleCards.tsx`, `SurfaceScanExposureSection.tsx`
- `src/components/dark-risk/DarkRiskScanRunsPanel.tsx`, `DarkRiskKpiCard.tsx`, `DarkRiskCoverageMatrix.tsx`
- `src/hooks/useSurfaceScanEngine.ts`, `useSurfaceScan360.ts`, `useSurfaceScanMonitoredIps.ts`
- `src/hooks/useDarkRiskOverview.ts`, `useDarkRiskScanRuns.ts`
- `src/lib/api/surface-scan360.ts`, `src/lib/api/darkrisk.ts`
- `hiconsole/routes/api.php`
- `hiconsole/app/Http/Controllers/Api/DarkriskOverviewController.php`, `SurfaceScanJobController.php`
