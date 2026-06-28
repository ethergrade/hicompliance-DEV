# Baseline

- Commit: `E0dade6` (fix: align assessment radar with backend monthly report)
- Prior artifacts used: none (scout from scratch)
- Graphify status: OK at current HEAD (5310 nodes, 10466 edges)

## Delta (since baseline)

- No uncommitted changes. Read-only investigation.

## State snapshot

### SurfaceScan360

| UI Section | Data Source | Endpoint | Controller |
|---|---|---|---|
| Jobs list (top panel) | `useSurfaceScanEngine` → `surfaceScan360Api.listJobs()` | `GET /companies/{id}/surface-scan360/jobs` | `SurfaceScanJobController::index` |
| Module detail cards | `SurfaceScanModuleCards.fetchData()` — own useEffect | Multiple: `listJobs`, `listMonitoredIps`, `getJobFindings`, `getModuleResults`, `getObservations`, `getOpenPorts` | `SurfaceScanJobController`, `SurfaceScanMonitoredIpController`, `SurfaceScanModuleResultController`, `SurfaceObservationController`, `SurfaceOpenPortController` |
| Exposure section | `SurfaceScanExposureSection` → `exposureApi` | `GET /companies/{id}/surface-scan360/jobs/{job}/exposure-findings`, etc. | `SurfaceExposureFindingController` |
| Scope summary cards | Same fetchData as module cards, computes `latestScopeJobs` + `scoreSummary` | — | — |
| Findings grid | `SecurityFindings` component | — | — |

**Key file paths:**

- `src/pages/SurfaceScan360.tsx:195` — main page component, orchestrates all sub-sections
- `src/components/surface-scan/SurfaceScanJobsPanel.tsx:29` — jobs list panel (top)
- `src/components/surface-scan/SurfaceScanModuleCards.tsx:516` — module detail cards with `fetchData` at line 548
- `src/hooks/useSurfaceScanEngine.ts:60` — jobs list hook (refetchInterval: 15s)
- `src/hooks/useSurfaceScan360.ts:5` — jobs CRUD hook
- `src/lib/api/surface-scan360.ts:60` — API client

### DarkRisk360

| UI Section | Data Source | Endpoint | Controller |
|---|---|---|---|
| KPI cards (grid) | `useDarkRiskOverview` → `darkRiskApi.getOverview()` | `GET /companies/{id}/darkrisk/overview` | `DarkriskOverviewController::show` |
| Coverage matrix | `overview.coverage_controls` from same endpoint | same | same |
| Threat groups | `overview.threat_groups` | same | same |
| Recent alerts | `overview.recent_alerts` | same | same |
| Findings tab | `useQuery` with `['darkrisk360-findings', ...]` — currently stubbed with `{ data: [], error: null }` | **TODO — not migrated to backend API** | N/A |
| Assets tab | Same pattern — stubbed | **TODO — not migrated** | N/A |
| Scan Runs panel | `useDarkRiskScanRuns` → `darkRiskApi.listScanRuns()` | `GET /companies/{id}/darkrisk/scan-runs` | `DarkriskScanRunController::index` |
| Reports tab | `useQuery` with stubbed data | **TODO — not migrated** | N/A |

**Key file paths:**

- `src/pages/DarkRisk360.tsx:256` — main page component
- `src/hooks/useDarkRiskOverview.ts:215` — overview hook (refetchInterval: 90s)
- `src/hooks/useDarkRiskScanRuns.ts:5` — scan runs hook
- `src/lib/api/darkrisk.ts:27` — API client
- `hiconsole/app/Http/Controllers/Api/DarkriskOverviewController.php:28` — backend overview aggregator

## Context (layered on state)

### 1. SurfaceScan360 — "completato (nessun dato)" / N.D. values

**How module outcomes are computed** (`SurfaceScanModuleCards.tsx:1124-1245`):

The `moduleOutcomes` useMemo processes module results and observations filtered to the currently selected scope target job. For each module (passes, http_security, headers, open_ports, ssl_certificate, tls_summary, whois, etc.):

1. If any module result row has status `error` or `timeout` → `"error"`
2. If any has status `running` → `"running"`
3. If any has status `queued` → `"queued"`
4. Otherwise, checks `hasSuccess` and `hasData`:
   - `hasSuccess && hasData` → `"success_with_data"` → label "Completato"
   - `hasSuccess && !hasData` → `"success_no_data"` → label "Completato (nessun dato)"

**Root cause analysis:**

The "completato (nessun dato)" labels in the screenshot are **expected behavior** when:

- **(Case A)** The selected scope target job that feeds module cards is still `queued`/`running`. The `fetchData` function (line 548) picks the latest completed job per target, falling back to the latest live job if none completed. When no job has completed, the live (possibly queued) job is used. Module results are only fetched for completed/partial jobs (line 694-700), so a queued job produces zero module results → all modules show "completato (nessun dato)."

- **(Case B)** A completed job genuinely had no findings for a specific module (e.g., `ssl_certificate` module ran but the target has no TLS, or `open_ports` ran but all ports are filtered). This is a legitimate scan outcome, not a bug.

- **(Case C)** There's a scope mismatch: the job's target doesn't match any configured scope rule, so it gets excluded from `scopeJobs` (line 619-641). The detail blocks would then show no data because no scope-matched jobs exist.

**Likely scenario for the screenshot:** Jobs are in `queued` state (the top panel shows pending jobs). Module results haven't been produced yet because the backend scan engine hasn't processed them. The detail blocks show "completato (nessun dato)" because the frontend falls back to showing a live/queued job with no module results.

### 2. DarkRisk360 — "poco popolato" (0/7 coverage, 0 threats, 0 leaks)

**How overview KPIs are derived** (backend: `DarkriskOverviewController.php:46-274`):

Every KPI depends on having a completed/partial SurfaceScan job:

```
$dataJob = $latestSnapshotJob ?? $latestLiveJob;
```

- `$latestSnapshotJob` = the latest SurfaceScanJob with status in `['completed', 'partial', 'completed_with_warnings']`
- `$latestLiveJob` = the latest SurfaceScanJob regardless of status

If `$dataJob` is null (no completed/partial job exists), then:

- `$latestFindings` = empty → `active_threats` = 0, `credential_leaks` = 0, `critical_findings` = 0, `new_alerts` = 0
- `$moduleRows` = empty → `coverage_controls` = all 7 controls show `not_run` → `controls_coverage.completed` = 0/7
- `$openPorts` = empty → `exposed_services` = 0
- `$risk_score` = 100 (no findings = max score), level "Basso"
- `$monitoredDomains` = count of domain-type entries in `surface_scan_monitored_ips` (this can be >0 even without jobs)
- `$latestDarkriskRun` = null → all DTI/IntelX stats are zero

**The screenshot's "1 monitored domain"** comes from a domain-type monitored IP rule existing in the DB. The "0/7 coverage" means no SurfaceScan job has completed yet. The "Nessuna scansione" (or similar) last-scan label means no data job exists.

**Critical finding: `$dataJob` fallback logic** (line 88):

```php
$dataJob = $latestSnapshotJob ?? $latestLiveJob;
```

This means the overview endpoint CAN return data even for a non-completed job — but the findings/module results will be empty because the job hasn't produced them yet. The KPIs will show zeros.

**Additional finding — findings/asset tabs are stubbed** (DarkRisk360.tsx:326-330):

```typescript
// TODO: migrate to backend API (select darkrisk_findings + surface_findings + surface_exposure_findings)
const findingsQueryRes = { data: [], error: null } as any;
```

The findings and assets tabs in the DarkRisk360 page use hardcoded `{ data: [], error: null }` stubs. These tabs will always be empty regardless of backend state.

### 3. Job triggering behavior

**Neither module triggers jobs automatically on page load.**

| Module | Trigger Mechanism | Auto on page load? |
|---|---|---|
| SurfaceScan360 | "Nuova scansione" button → `useSurfaceScanEngine.startScan()` → `POST /companies/{id}/surface-scan360/jobs` | **No** |
| SurfaceScan360 | Adding scope rule with `auto_queue_scan: true` | **Only when user adds a scope rule** |
| DarkRisk360 | "Nuova scansione" button → `handleSyncSurfaceScan()` → `POST /companies/{id}/darkrisk/scan-runs` | **No** |
| DarkRisk360 | "Avvia controllo identity" button → `handleIdentityLeakScan()` | **No** |
| DarkRisk360 | Adding scope rule with `auto_sync_darkrisk: true` | **Only when user adds a scope rule** |

Both modules use polling (`refetchInterval`) to refresh job/overview status, but polling never triggers new jobs — it only updates display state.

The backend `SurfaceScanJobController::store` (line 65) creates a job and dispatches it through `SurfaceScanQueueDispatcher`. The actual scan execution is server-side, asynchronous, and decoupled from the frontend polling.

### 4. Verdict per module

#### SurfaceScan360: **Expected empty state (not a bug)**

The "completato (nessun dato)" / N.D. values are the correct display when:

- Jobs are pending/queued (no module results produced yet)
- OR a completed job genuinely had no data for specific modules

The frontend wiring is correct — it fetches the right endpoints and filters correctly. The `fetchData` function's job-selection logic (preferring completed with score, then completed any, then live) is defensive and appropriate.

**Recommended next debugging step:** Check the backend job queue. If jobs are stuck in `queued` state for an extended period, the issue is a backend queue worker not processing SurfaceScan360 jobs. Check:

```bash
# In hiconsole backend
php artisan queue:monitor
# or check the jobs table
SELECT status, count(*) FROM surface_scan_jobs WHERE tenant_id = <id> GROUP BY status;
```

#### DarkRisk360: **Partial integration — expected empty state for KPIs, plus known data gaps**

The 0/7 coverage, 0 threats, 0 leaks display is **expected** when no SurfaceScan job has completed for the tenant. The monitoring domain count (1) is independently derived from monitored IP rules and is correct.

**However**, the findings tab and assets tab have known TODO stubs (`DarkRisk360.tsx:326-330`) that will never return real data until the backend migration is completed. This means even if a scan runs successfully, the findings and assets tabs remain empty.

**Recommended next debugging step:**

1. Verify a SurfaceScan job has completed for this tenant: check `surface_scan_jobs` table for status = `completed`/`partial`.
2. If no completed job exists, start one via the "Nuova scansione" button.
3. After job completion, refresh DarkRisk360 → overview KPIs should populate.
4. The findings and assets tabs will remain empty until the `TODO: migrate to backend API` items are addressed.

## Start Here

Open `src/pages/DarkRisk360.tsx:326` — the stubbed findings query is the most actionable gap. The TODO comments at lines 326, 430, 454, and 877 mark multiple `{ data: [], error: null }` stubs that need backend API migration.

## SurfaceScan Exposure Risk V3 — implementation trace (2026-06-27)

- Added the shared service exposure matrix and `Exposure Score V3` under `supabase/functions/_shared/`.
- Every canonical exposed service now produces a deterministic `internet_exposed_service` finding with likelihood, impact, matrix score, evidence status, and remediation; port-only evidence never invents a CVE.
- Exposure aggregation uses primary service risk, diminishing breadth, and capped uncertainty so numerous ordinary web services do not saturate the organization at critical risk.
- `surface-exposure-summary` now returns unified exposure findings and service assessments; SurfaceScan UI, AI report, PDF, and DOCX consume the V3 result.
- Source-specific port severities were replaced with the shared matrix for the SurfaceScan engine and ConnectSecure adapter.
- Acceptance baseline: 34 HTTPS services without fingerprint produce 34 findings, 17.6 risk points, posture 82/100, and risk level `Medio`.
- Validation completed: 51 Deno tests, TypeScript, production build, Edge Function checks, and unauthenticated browser smoke test.
- Visual follow-up completed: `Distribuzione Severity Exposure` now has semantic severity colors, segment pin-points/leader labels, center total/selected state, interactive keyboard-accessible legend, tooltip, and restrained cyber Palantir/Gotham styling. Desktop `893px` and mobile `390px` renders passed design QA; see `design-qa.md`.

## SurfaceScan Exposure Risk V3 — durable checkpoint (2026-06-27)

- Exposure Risk V3, unified service findings, shared port/service matrix, deduplication, CVE evidence rules, UI tables/cards, AI report, PDF and DOCX were completed.
- The severity donut redesign was completed with semantic colors, pin-point labels, interactive legend, keyboard support and responsive cyber-intelligence styling.
- Documentation was consolidated under `docs/surfacescan360/`, including `07-EXPOSURE-RISK-V3.md`; visual QA is recorded in `design-qa.md`.
- Validation on `imnick`: 51 Deno tests passed, TypeScript/build passed, Edge checks passed, chart ESLint passed and the no-secrets gate passed.
- Validation on `PRODOTTO`: 59 Deno tests passed, TypeScript/build passed, Edge checks passed, chart ESLint passed and the no-secrets gate passed.
- Published commit on `imnick`: `749a1f2d853d35d9beec603a211ab2e9a7670a3d`.
- Published commit on `PRODOTTO`: `10eccadc3f95470f5340553001f729e6d88795a5`.
- Product conflicts were resolved by preserving the richer product report implementation and adding only the V3 fields; the DEV-only `context.md` deletion policy on `PRODOTTO` was preserved.
- `.env_per_stefano` exists only in the DEV workspace, is ignored by Git, has permission mode `600`, and contains 13 authorized local configuration variables. Secret values must never be copied into Git, documentation, logs, screenshots or chat.
- Unrelated pre-existing files and `supabase/.temp/cli-latest` were deliberately excluded from both commits.

## DarkRisk360 Refactor V2 / IntelX — durable checkpoint (2026-06-28)

- Standard and Esteso are separate capabilities: HiCompliance and Esteso grant Standard; Esteso is spot-only and admin/superadmin-started.
- Canonical external scope is capped at four approved public domains/IPs; domains stay bare and email selectors are removed from the UI/API contract.
- IntelX Search is pinned to `2.intelx.io`; Identity is pinned to `3.intelx.io`, bucket `leaks.private.general`, async `/accounts/csv`; `4.intelx.io` and `/accounts/1` are blocked and tested.
- V2 persists idempotent runs/tasks with leases, retry/heartbeat, count-only Standard projection, canonical record occurrences and encrypted Extended payloads.
- Weekly Standard and monthly report scheduling are Europe/Rome DST-safe. Extended has no scan cron. Contract-end purge removes sensitive payloads/reports/Storage within 24 hours.
- Frontend routes are separated into `src/features/darkrisk/{standard,extended}` and call Laravel API boundaries; provider flags and identity email input are absent.
- Semantic implementations exist on `imnick` and `PRODOTTO`; no automatic cherry-pick was used.
- The Laravel repository is still required for REST controllers, transactional dual-write to SurfaceScan scope, report projectors, authorized decrypt/audit endpoints and percentage rollout.
- `.env_per_stefano` remains ignored/mode 600; V2 variable names and a local-only development KEK were added without exposing secret values.
