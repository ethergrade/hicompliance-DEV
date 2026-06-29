# Baseline

- Commit: (current HEAD)
- Prior artifacts used: none (fresh scout)
- Graphify status: STALE (last at 2026-06-23)

## Delta (since baseline)

- N/A — fresh investigation

## State snapshot

### File structure

```
src/components/remediation/GanttChart.tsx   — 387 lines
src/pages/Remediation.tsx                   — 1672 lines
src/hooks/useGanttResize.ts                 — 104 lines
```

### GanttChart.tsx — Layout architecture

**Single scroll container (root cause of #1):**

- Line 217: `<div className="overflow-x-auto select-none" ref={scrollRef} ...>` — this wraps **both** sidebar and timeline.
- Line 219: header row — `grid grid-cols-[18rem_minmax(0,1fr)]`
- Line 220: sidebar header — `<div className="w-72 shrink-0 px-4 py-3 text-xs font-semibold ...">` — `shrink-0` prevents compression but doesn't pin.
- Line 223–236: timeline header — month labels in `grid flex-1` with `minWidth: timelineMinWidth` and `gridTemplateColumns: monthGridTemplate`.
- Line 248–254: each task row — same `grid grid-cols-[18rem_minmax(0,1fr)] min-h-14` structure.
- Line 255: task sidebar cell — `<div className="w-72 shrink-0 px-4 py-3 flex items-center gap-2 border-l-2 ...">`.
- Line 300: task timeline cell — `<div className="relative" style={{ minWidth: ${timelineMinWidth}px }}>`.

**Key insight:** Because both columns are children of the single `overflow-x-auto` container (line 217), horizontal scrolling moves everything — sidebar included. The sidebar is **not** a separate element from the timeline.

**Sidebar content:**

- Line 260: task label — `<p className="text-xs font-medium truncate leading-tight cursor-default">{task.task}</p>`
- Line 266: assignee — `<p className="text-[10px] text-muted-foreground truncate mt-1">{task.assignee}</p>`

**Timeline bars:**

- Lines 317–376: `<TooltipProvider>` wrapping each bar.
- Line 330–334: bar `style={{ left: bar.left, width: bar.width, backgroundColor: task.color, minWidth: 28 }}`.
- Line 332: `backgroundColor: task.color || 'hsl(var(--primary))'`.
- Lines 338–343: progress overlay `<div style={{ width: ${task.progress}% }} className="bg-white/20 rounded-full pointer-events-none" />`.
- Line 360–363: bar label `<div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] text-white font-semibold pointer-events-none select-none overflow-hidden">` with duration and progress %.

**Priority border colors** (lines 47–52):

- `Critica` → `border-l-red-500`
- `Alta` → `border-l-orange-500`
- `Media` → `border-l-yellow-500`
- `Bassa` → `border-l-green-500`

**Drag state:**

- `liveDates` (line 70): tracks in-flight date changes during drag.
- `activeDragId` (line 71): which task is being dragged.
- `zoomIndex` (line 72): zoom level into `ZOOM_LEVELS = [800, 1100, 1600, 2400, 3600]`.
- Lines 76–81: `useGanttDrag` hook (resize/resposition).
- Lines 122–149: `handleBarPointerDown` / `handlePointerUp`.
- Lines 162–189: window-level `pointermove`/`pointerup` listeners during active drag.

**Today indicator** (lines 156–160): `todayOffset` computed as `(days_from_today_to_start / totalDays) * 100`. Rendered as a vertical line on line 310–314. Returns `null` if today is outside the Gantt range.

**Scroll controls** (lines 151, 207–212): `scroll = (dir) => scrollRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' })`. Left/right chevron buttons in the card header.

### Remediation.tsx — Gantt integration

**Hardcoded date range (root cause of #3):**

- Line 302: `const GANTT_START = new Date("2026-01-01")`
- Line 303: `const GANTT_END = new Date("2026-12-31")`
- These are module-level constants, not state, not dependent on `selectedTimeframe` (line 323).
- Used on line 416–417: `ganttData` mapping where `totalDays` and `daysFromStart` are computed against `GANTT_START`.

**Task mapping** (lines 415–438): `activeTasks.map(...)` → `GanttTask[]`. Computes `startOffset` and `width` as percentages.

**Props passed to `<GanttChart>`** via lines 415–438 + render section:

- `tasks={ganttData}`
- `ganttStartDate={GANTT_START}`
- `ganttEndDate={GANTT_END}`
- `onDateChange`, `onEditTask`, `onToggleVisibility`, `onDeleteTask`, `onReorderTasks`, `onProgressChange`
- `canEdit`, `canUpdateProgress`

**Other state:**

- `selectedTimeframe` (line 323): stored in user preferences, defaults to `"90days"`. Not wired to Gantt range — appears unused for the Gantt.
- `loadTasks` (line 375): fetches from `remediationTasksApi.list(orgId, groupId)`.
- `updateTask` (line 444): optimistic update + PUT per task.

## Context (layered on state)

### Requirement #1: Pinned sidebar

**Root cause:** Single `overflow-x-auto` container wraps both sidebar and timeline columns. The sidebar's `shrink-0` prevents compression but doesn't pin it against horizontal scroll.

**Fix approach (minimal):** Use `position: sticky` on the sidebar cells within the same grid, inside the scroll container.

**Specific changes:**

- Line 220 (sidebar header cell): add `sticky left-0 z-20 bg-card` so it sticks to the left edge of the scrolling container.
- Line 255 (task row sidebar cell): add `sticky left-0 z-10 bg-background` (or `bg-card` / `bg-white`) to pin each row's sidebar cell.
- The sticky cells need an explicit background to prevent content showing through as they overlap the scroll area.

**Why this works:** `sticky` in a scrolling container positions relative to the nearest scroll parent (`overflow-x-auto`). The grid ensures the sidebar column stays at `left: 0` of the scroll viewport.

### Requirement #2: 2-line label wrapping

**Root cause:** Line 260 uses Tailwind `truncate` → `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. This forces single-line display with ellipsis.

**Fix approach:** Replace `truncate` with `line-clamp-2` (Tailwind 3.3+ built-in).

**Specific changes:**

- Line 260: change `truncate` to `line-clamp-2` in the `<p>` tag. Remove `truncate`, add `line-clamp-2`. The `leading-tight` stays.
- Line 266 (assignee): keep `truncate` — single-line for the smaller assignee text is appropriate.
- The `min-h-14` (56px) on each row (line 251) is sufficient height for 2 lines of `text-xs` (~30px) + assignee line (~16px) = ~46px. No row height change needed.

### Requirement #3: Default view from today()

**Root cause:** Lines 302–303 hardcode `GANTT_START` and `GANTT_END` as `new Date("2026-01-01")` and `new Date("2026-12-31")`. No mechanism to dynamically center the view around today.

**Fix approach (minimal):** Compute `GANTT_START` and `GANTT_END` relative to `new Date()` instead of hardcoded dates. Optionally add a `useEffect` to scroll to today on mount.

**Specific changes:**

- Lines 302–303: Replace with dynamic dates:

  ```tsx
  const GANTT_START = new Date(); // or subMonths(new Date(), 1) for 1-month context
  const GANTT_END = addMonths(new Date(), 12); // 12-month horizon
  ```

  Or use `subMonths(GANTT_START, 1)` for a small buffer before today so the admin can see what just started.

- Import `subMonths`, `addMonths` from `date-fns` (already imported in Remediation.tsx line 40).
- The `todayOffset` line (GanttChart.tsx lines 156–160) already handles today dynamically. With `GANTT_START = today`, `todayOffset` will be `0` (today is at the left edge).
- No scroll-to-today `useEffect` needed if today is at position 0.
- Admin can scroll back/forward using the existing `scroll()` function (line 151) + scrollbar.
- Consider adding a "Jump to Today" button for convenience.

**Risks for #3:**

- If demo/seed data uses 2026 dates (lines 84–283), those tasks may not fall within a dynamic range starting from today (June 2026). The demo data spans Jan–Dec 2026 — some tasks (Jan–May) would be partially before `GANTT_START`. The `getBarStyle` function (GanttChart.tsx line 101–120) already clamps: lines 106–108 normalize start/end against `ganttStartDate`/`ganttEndDate`. So tasks starting before today will render truncated at the left edge. This is tolerable behavior.
- The header title (line 197: `Timeline {ganttStartDate.getFullYear()}`) will show the current year, which is appropriate.

### Bar color/style summary

- Line 332: `backgroundColor: task.color || 'hsl(var(--primary))'` — uses the `color` field from DB directly.
- Lines 338–343: progress overlay as white/20 bar.
- Lines 346–358: left/right resize handles with `w-3 cursor-ew-resize`.
- Lines 47–52: priority-based left border via `priorityBorder` record.

### Files likely needing changes

| File | Lines | Change |
|------|-------|--------|
| `src/components/remediation/GanttChart.tsx` | 220 | Add sticky to sidebar header |
| `src/components/remediation/GanttChart.tsx` | 255 | Add sticky to sidebar task cell, add bg color |
| `src/components/remediation/GanttChart.tsx` | 260 | Replace `truncate` with `line-clamp-2` |
| `src/pages/Remediation.tsx` | 302–303 | Make GANTT_START/GANTT_END dynamic from today |
| `src/pages/Remediation.tsx` | 40 | Ensure `addMonths` (or `subMonths`) imported |

## Start Here

**File:** `src/components/remediation/GanttChart.tsx` lines 217–260
This is the layout core: the single scroll container, the sidebar cells that need sticky positioning, and the label that needs line-clamping. Read from line 190 (return) to understand the full render tree, then apply the sidebar sticky fix first (req #1) since it has the most structural impact — the other two are isolated one-liner changes.
