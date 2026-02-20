
## Time-Range Selectors + Trend Micro-Charts on Metric Cards

### What we're building

Two of the four `MetricCard` components on the Dashboard will be upgraded:

1. **"Conformità NIS2/NIST/ISO"** card — adds a pill-group selector at the top with options **1y / 2y / 3y / 4y** (year-over-year compliance evolution). The percentage and label update per selection, improving over time.

2. **"Risk Score"** card — adds a pill-group selector with **1d / 7d / 1m / 3m / 6m / 1y** (short-term risk tracking). Below the circular gauge and label, a **small sparkline/area chart** shows the risk trend for the selected range. The final data point (most recent) is always better than earlier ones to simulate an improving trajectory.

---

### Approach

Rather than modifying the generic `MetricCard` (which is used for all 4 cards), we create **two new dedicated card components** to keep concerns separated and avoid complicating the generic component:

- `src/components/dashboard/ComplianceMetricCard.tsx` — Conformità NIS2/NIST/ISO with year selector
- `src/components/dashboard/RiskScoreMetricCard.tsx` — Risk Score with time selector and sparkline

The two simple cards (Servizi Monitorati, Issues Totali) continue to use `MetricCard` unchanged.

---

### Mock Data Design

**ComplianceMetricCard** (1y → 4y, improving trend):

| Range | Percentage | Label |
|-------|-----------|-------|
| 1y | 38% | Basso |
| 2y | 52% | Moderato |
| 3y | 65% | Moderato |
| 4y | 78% | Buono |

Status badge matches: critical → warning → warning → good

**RiskScoreMetricCard** (1d → 1y, improving trend, sparkline):

| Range | % | Label | Sparkline points |
|-------|---|-------|-----------------|
| 1d | 74% | Alto | [82,79,76,74] |
| 7d | 68% | Alto | [85,80,75,71,68] |
| 1m | 61% | Medio | [80,72,65,61] |
| 3m | 55% | Medio | [78,70,62,57,55] |
| 6m | 47% | Medio | [75,65,55,50,47] |
| 1y | 35% | Basso | [72,60,48,40,35] |

The sparkline uses Recharts `AreaChart` (already installed) — small, minimal, no axes, just a thin colored area to convey direction.

---

### Files to Change

**New files:**
- `src/components/dashboard/ComplianceMetricCard.tsx`
- `src/components/dashboard/RiskScoreMetricCard.tsx`

**Modified files:**
- `src/pages/Dashboard.tsx` — replace the first two `<MetricCard>` usages with the new components, add their imports

---

### Technical Details

- Pill selectors are plain `<button>` elements styled with Tailwind, no external dependency needed
- Active pill: solid primary background; inactive: outline/ghost
- Sparkline: `<AreaChart>` from Recharts (already a dependency) inside a `ResponsiveContainer` with `h-16`, no axes, no grid, no tooltip — pure visual indicator
- Smooth `transition-all duration-500` on the circular gauge when the percentage changes (already present in MetricCard SVG pattern)
- Both new components are self-contained with their own state (`selectedRange`) so the Dashboard stays lean
- The existing `MetricCard` component is untouched — the other two cards keep using it normally
