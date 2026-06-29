# Baseline

- Commit: 4d29f6b ("fix: merge duplicate Gestione Moduli Cliente e Impostazioni buttons into one [trello #88]")
- Prior artifacts used: none
- Graphify status: MISSING

## Delta (since baseline)

- Files changed: not applicable (investigation only)
- Areas touched: Analytics page, Dashboard, Assessment, AssessmentRadarChart component
- New surface area: N/A

## State snapshot

### Radar Chart Components — two implementations

**1. Custom SVG: `AssessmentRadarChart`** — used in Dashboard and Assessment pages

- File: `src/components/assessment/AssessmentRadarChart.tsx`
- Custom SVG with polar coordinates, no third-party lib
- 4 concentric grid levels at [25, 50, 75, 100]
- Hardcoded target at 90 on all categories
- Scales to 0–100 viewport

**2. Recharts `RadarChart`** — used in Analytics page

- File: `src/pages/Analytics.tsx` (lines 485–497)
- Uses `recharts` v2.12.7 with `<RadarChart>`, `<PolarGrid>`, `<PolarAngleAxis>`, `<PolarRadiusAxis domain={[0,100]}>`
- Supports both real API data and static fallback data

### Data sources (3 hooks)

| Hook | File | Returns | Used by |
|------|------|---------|---------|
| `useAssessmentTrends` | `src/hooks/useAssessmentTrends.ts` | `{ radarCategories: RadarCategory[] }` | Dashboard, Analytics, Assessment |
| `useAssessmentReport` | `src/hooks/useAssessmentReport.ts` | `{ radarCategories: RadarCategory[] }` | (legacy, not used by radar chart consumers) |
| `useDashboardMetrics` | — | `{ assessmentId }` | Used to resolve assessmentId for the trends hook |

### API data type

```typescript
// src/types/api.ts:344
export interface RadarCategory {
  name: string;              // category display name
  completion_percent: number; // 0–100 scale
}

// src/types/api.ts:507
export interface AssessmentMonthlyReportData {
  radar_categories: RadarCategory[];
  // ...
}
```

### Data transformation mapping

| Consumer | File:Line | Map from `RadarCategory` | Target |
|----------|-----------|--------------------------|--------|
| Dashboard | `src/pages/Dashboard.tsx:424–430` | `c.name` → `category`, `c.completion_percent` → `compliance` | hardcoded 90 |
| Assessment | `src/pages/Assessment.tsx:685–690` | `rc.name` → `category`, `rc.completion_percent` → `compliance` | hardcoded 90 |
| Analytics | `src/pages/Analytics.tsx:242–245` | **`cat.category`** → should be `cat.name`; **`cat.compliance`** → should be `cat.completion_percent` | computed as `compliance+15` (broken) |
| Analytics fallback | `src/pages/Analytics.tsx:131–136` | uses static `BASE_CATEGORIES` + `COMPLIANCE_BY_RANGE` | computed as `compliance+15` |

## Context

### 🔴 Bug #1 (critical) — Analytics.tsx wrong property names

**File:** `src/pages/Analytics.tsx`, lines 242–245

```typescript
return radarCategories.map(cat => ({
  category: cat.category ?? 'N/D',       // ❌ cat.name
  compliance: cat.compliance ?? 0,        // ❌ cat.completion_percent
  target: Math.min((cat.compliance ?? 0) + 15, 100),  // ❌ cat.completion_percent
}));
```

When real API data is loaded (assessment with existing radar data):

- `cat.category` is **`undefined`** → falls back to `'N/D'` for ALL categories
- `cat.compliance` is **`undefined`** → falls back to `0` for ALL values
- `cat.compliance` is **`undefined`** → target computed as `Math.min(0 + 15, 100)` = **15** for ALL

**Result:** The recharts RadarChart renders 14 identical axes all labeled "N/D", with compliance=0 and target=15. This matches exactly the Trello issue #87 complaint: "Radar Chart seems wrong."

**Not caught by TypeScript** because `tsconfig.json` has `"noImplicitAny": false` and `"strictNullChecks": false`.

**Impact:** Only visible on the Analytics page (`/analytics`), not on Dashboard or Assessment. Static fallback data still works (when no assessmentId is resolved, or API returns empty).

### 🟡 Bug #2 (minor/visual) — Hardcoded target at 90

Both Dashboard (`Dashboard.tsx:429`) and Assessment (`Assessment.tsx:689`) hardcode `target: 90` for all categories. The `RadarCategory` API type has no `target` field. If the backend ever returns per-category targets, this code won't use them.

The custom SVG chart title says "Target 90/100 su tutte le categorie" (`AssessmentRadarChart.tsx:127`) confirming the assumption.

### 🟢 Custom SVG geometry — correct

The `AssessmentRadarChart.tsx` geometry is sound:

- `startAngle = -Math.PI/2` (first axis points up) ✓
- `angleStep = 2π / data.length` (even spacing) ✓
- `clampScore` limits to [0,100] ✓
- `polarToCartesian` scales correctly as `(value/100) * RADIUS` ✓
- Grid levels [25, 50, 75, 100] evenly spaced ✓
- Labels use `getTextAnchor`/`getLabelY` to avoid overlap ✓

No rendering/calculation bugs found in the custom SVG.

### 🟢 Dashboard — correct mapping

`Dashboard.tsx:424–430` correctly maps `c.name` and `c.completion_percent`. ✓

### 🟢 Assessment — correct mapping

`Assessment.tsx:685–690` correctly maps `rc.name` and `rc.completion_percent`. ✓  
(Recent commit `e0dade6` "fix: align assessment radar with backend monthly report" added this code 6 days ago.)

## Start Here

**`src/pages/Analytics.tsx:242-245`** — Fix the property names: `cat.category` → `cat.name`, `cat.compliance` → `cat.completion_percent`. This is the only obvious bug that would make the radar chart render all axes as "N/D" with zero compliance.

---

## Acceptance Report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Investigated Trello issue #87 — Radar Chart. Found one critical bug (wrong property names in Analytics.tsx:242-245), zero false positives from scope creep."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "grep -rn 'radar\\|RadarChart\\|RadarCategory' src/",
      "result": "passed",
      "summary": "Found all radar-chart related files: AssessmentRadarChart.tsx, Analytics.tsx, Dashboard.tsx, Assessment.tsx, useAssessmentTrends.ts, useAssessmentReport.ts, types/api.ts"
    },
    {
      "command": "git show e0dade6",
      "result": "passed",
      "summary": "Recent commit e0dade6 (6 days ago) added backend radar data to Assessment.tsx — correctly mapped"
    },
    {
      "command": "read tsconfig.json",
      "result": "passed",
      "summary": "noImplicitAny: false and strictNullChecks: false — explains why property name bugs are not caught by TypeScript"
    }
  ],
  "validationOutput": [
    "Analytics.tsx lines 242–245: cat.category → should be cat.name; cat.compliance → should be cat.completion_percent",
    "Dashboard.tsx:424–430: correct mapping (c.name, c.completion_percent)",
    "Assessment.tsx:685–690: correct mapping (rc.name, rc.completion_percent)",
    "AssessmentRadarChart.tsx: SVG geometry is correct — no rendering bugs"
  ],
  "residualRisks": [
    "The bug in Analytics.tsx only manifests when real API radar data exists (assessmentId resolved). Static fallback data hides the issue.",
    "Target is hardcoded at 90 across all charts — not a bug per se, but means per-category targets from API would be ignored."
  ],
  "noStagedFiles": true,
  "diffSummary": "Investigation only — no code changes made.",
  "reviewFindings": [
    "blocker: src/pages/Analytics.tsx:242 — uses `cat.category` (undefined); should be `cat.name`",
    "blocker: src/pages/Analytics.tsx:244 — uses `cat.compliance` (undefined); should be `cat.completion_percent`",
    "blocker: src/pages/Analytics.tsx:245 — uses `cat.compliance` (undefined); should be `cat.completion_percent`",
    "no blockers found in Dashboard.tsx, Assessment.tsx, or AssessmentRadarChart.tsx"
  ],
  "manualNotes": "Root cause identified. Fix is straightforward: change 3 property names in Analytics.tsx:242-245. The bug was introduced when real API data integration was added to the Analytics page but used wrong property names matching a different internal data shape (probably copied from the static data path which uses {category, compliance, target} directly)."
}
```
