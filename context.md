# Investigation: Trello #76 — "Verifica Remediation, alcune senza category"

## Baseline

- Commit: `git rev-parse HEAD` to verify
- Project: hicompliance-DEV (React frontend) + ../hiconsole (Laravel backend)
- Prior artifacts: Trello #55 (v2 remediation), Trello #71 (assessment dependency visibility)

---

## 1. How Remediation Items Are Created/Displayed

### Frontend: `src/pages/Remediation.tsx`

- **Data model**: `interface DbTask` (line 65-81) has `category: string` (non-nullable). API response mapped via `apiTaskToDbTask` (line 351-370).
- **Display**: `ganttData` (line 416-439) maps `DbTask[]` → `GanttTask[]`, passing `category` directly (line 426).
- **Loading**: `loadTasks` (line 375-403) calls `remediationTasksApi.list()`, maps each via `apiTaskToDbTask`. Category is passed through as-is (line 355).
- **Deleted tasks tab**: Shows `Categoria: {t.category}` (line 1612). Null would display as blank or "null".

### Backend: `RemediationTaskController.php`

- `index()` (line 22-47): Loads tasks by `tenant_id`, ordered by `display_order`. Category is returned as-is from the resource.
- `store()` (line 49-59): Creates via `StoreRemediationTaskRequest` which has `'category' => ['required', 'string', 'max:100']`.

### Database: `remediation_tasks` table

- `category` column (migration `2026_05_27_200004_create_remediation_tables.php`, line 16): `$table->string('category')` — **NOT nullable, no default**.

---

## 2. Category Field: Origin and Nullability

### Backend (`hiconsole`)

| Layer | file:line | category definition | Can be null? |
|---|---|---|---|
| DB migration | `2026_05_27_200004_create_remediation_tables.php:16` | `$table->string('category')` | ❌ Not nullable |
| Model `$fillable` | `app/Models/RemediationTask.php:17` | `'category'` | Included |
| Store validation | `app/Http/Requests/StoreRemediationTaskRequest.php:18` | `['required', 'string', 'max:100']` | ❌ Required |
| Update validation | `app/Http/Requests/UpdateRemediationTaskRequest.php:18` | `['sometimes', 'string', 'max:100']` | ✔ Optional |
| Resource | `app/Http/Resources/RemediationTaskResource.php:17` | `$this->category` | Passes DB value |

### Frontend (`src/types/api.ts`) — **DUPLICATE INTERFACES**

Two `RemediationTask` and `StoreRemediationTaskRequest` interfaces exist in the same file:

| Interface | line | category type |
|---|---|---|
| `RemediationTask` (v2, first) | 369 | `category: string` |
| `RemediationTask` (second) | 822 | `category?: string \| null` |
| `StoreRemediationTaskRequest` (v2, first) | 391 | `category: string` |
| `StoreRemediationTaskRequest` (second) | 841 | `category?: string \| null` |

**Risk**: TypeScript builds without errors (declaration merge maybe masking). At runtime, if API returns null/empty category, frontend passes it through unguarded.

---

## 3. Remediation Creation Flows That Might Skip Category

### Flow A: Manual creation via UI dialog

- **File**: `src/pages/Remediation.tsx`, lines 900-938
- **State**: `newRemediation.category` initializes as `""` (line 330)
- **No validation**: The "Crea Remediation" button calls `handleCreateRemediation` (line 678) which immediately sends the API request.
- **Category mapping** (line 710-712):

  ```typescript
  category: CATEGORY_KEY_TO_LABEL[newRemediation.category] || newRemediation.category,
  ```

  - If category is `""`: `CATEGORY_KEY_TO_LABEL[""]` → `undefined` → `""` is sent to backend
  - **But**: Backend Store validation requires `category` → would return 422. However, if the user selects ANY option, category is a valid key string.
- **Verdict**: Manual creation itself may not be the source, but there's NO client-side validation preventing submission with empty category.

### Flow B: Assessment auto-creation via `RemediationGanttService`

- **File**: `hiconsole/app/Services/RemediationGanttService.php`
- **`buildGanttItems()`** (line 198-257): Category comes from `$question->category?->name ?? 'Altro'` (line 228). **Always has a fallback value** → safe.
- **`insertTasks()`** (line 315-359): Inserts `$event['category']` (line 331) directly into DB. Category is always populated from buildGanttItems.
- **`importFromCustomGantt()`** (line 122-185): Extracts category from task name: `$category = ''; if (str_contains($name, ':')) { ... }` (line 145-149). **If task name has no colon, `$category` stays empty string `''`**. Then inserted at line 157 as `'category' => $category`. DB column is `string` (not nullable), so MySQL would store this as empty string, not null.
- **Verdict**: `importFromCustomGantt()` is a potential source of empty categories when legacy task names don't contain a colon separator.

### Flow C: Direct DB updates (migrations / seeders / admin)

- Only the migration creates the column (non-nullable). Seeders create `remediation_templates` and `remediation_solutions`, not tasks. No other path writes tasks.

---

## 4. Frontend Filtering/Grouping by Category — Breakage with null/empty

### GanttChart (`src/components/remediation/GanttChart.tsx`)

- **Interface `GanttTask`** (line 11-26): `category: string` — non-nullable. Used only for display in tooltip/sidebar. No category-based filtering in the chart itself.
- Category is NOT used for grouping in Gantt. It's displayed in the sidebar list where it was previously rendered.

### Remediation page (`src/pages/Remediation.tsx`)

- **`activeTasks`** (line 411-413): Filters `!t.is_deleted`. No category filter.
- **`ganttData`** (line 416-439): Maps `category: t.category` directly. No null guard.
- **Deleted tasks tab** (line 1612): `Categoria: {t.category}` — would show "Categoria: " if null/undefined, or "Categoria: null" if JS string-coerces null.
- **Edit form** (line 1198): `<Select value={editTaskData.category}>` — if category is empty/null, the Select has no matching option, which displays blank/placeholder.
- **No category-based grouping, filtering, or rendering** that would crash with null/undefined. The category is displayed only as a label.

### Assessment page (`src/pages/Assessment.tsx`)

- **`getCategoryCounts`** (line 558-571): Counts by category name. Not affected by remediation task categories directly.
- **Overall progress** (line 828-833): Uses `cat.completed` and `cat.questions` from assessment categories, not remediation tasks. Separate concern.

---

## 5. Assessment Completion Issue

### How total_questions is calculated

**Backend** (`AssessmentSnapshotController::store`, line 42-67):

```php
$responses = AssessmentResponse::where('tenant_id', $company->id)->with('question.category')->get();
$totalQuestions = $responses->count();
$totalAnswered = $responses->where('status', '!=', 'not_applicable')->count();
```

- Counts **ALL existing response records** including those for questions hidden by dependencies.
- Does NOT filter dependency-gated questions.

**Frontend** (`Assessment.tsx`, line 652-678):

```typescript
const visibleQuestions = cat.questions.filter(q => isQuestionVisible(q, responses, allCategories));
const total = visibleQuestions.length;
const status = answered === 0 ? 'not_started' : answered === total ? 'completed' : 'in_progress';
```

- Counts only **visible** questions after applying `isQuestionVisible` (line 401-414).
- A question is hidden if its `dependency` parent's status is not `pianificato_in_corso` or `completato`.

**The Discrepancy**: If a category has 10 questions, 3 are dependency-gated (hidden because parent is `non_iniziato`), the frontend shows `7 total`. The backend counts all 10 responses. The user sees 7/7 (100%) but the snapshot shows 7/10 (70%). The system says "more to answer" but the user can't see the hidden questions.

**This is the root cause of the "assessment not completed" symptom.**

### Trello #71 referenced in code

Line 656-657: `// Trello #71: count only VISIBLE questions. Hidden dependency-children must not inflate 'total'`
This fix was applied to the FRONTEND only. The backend snapshot calculation was NOT updated to match. The backend at line 67 of `AssessmentSnapshotController.php` still counts all responses regardless of dependency visibility.

---

## 6. Summary of Findings

### Remediation "senza category"

| # | Location | Issue | Severity |
|---|---|---|---|
| A | `RemediationGanttService::importFromCustomGantt()` (hiconsole:145-149) | Category extraction from task name fails if no colon → empty string saved | ⚠️ Medium — only affects legacy migrations |
| B | `src/pages/Remediation.tsx:710-712` | No client-side validation for category in create form. Empty string can be sent to API | ⚠️ Low — backend validation catches it with 422 |
| C | `src/pages/Remediation.tsx:355, 426, 1612` | Null/empty category passes through UI unguarded. Display shows blank for category | ⚠️ Low — cosmetic |
| D | `src/types/api.ts:369 vs 822` | Two conflicting `RemediationTask` and `StoreRemediationTaskRequest` interfaces | ⚠️ Medium — type confusion risk |

### Assessment completion "mancano risposte"

| # | Location | Issue | Severity |
|---|---|---|---|
| E | `AssessmentSnapshotController.php:67` vs `Assessment.tsx:658-659` | Backend counts all responses; frontend counts only visible (dependency-filtered) questions | 🔴 **Critical** — mismatch makes it appear incomplete |

### Primary Investigation Finding

The **most likely source** of remediation tasks without a category is `importFromCustomGantt()` in `RemediationGanttService.php:145-149` — when legacy task names don't contain a colon (`:`), category is set to empty string. For the "assessment not completed" issue, the root cause is the **backend/frontend mismatch** in counting dependency-gated questions in the snapshot calculation.

---

## Start Here

For investigating further, open these files in order:

1. **`../hiconsole/app/Services/RemediationGanttService.php`** (line 122-185) — `importFromCustomGantt()` is the most likely source of empty categories
2. **`src/pages/Remediation.tsx`** (line 703-728) — `handleCreateRemediation` payload construction, verify category handling
3. **`../hiconsole/app/Http/Controllers/Api/AssessmentSnapshotController.php`** (line 42-67) — snapshot total_answered/total_questions calculation that doesn't filter dependency-gated questions
4. **`src/types/api.ts`** (lines 369, 391, 822, 841) — duplicate interface definitions that need cleanup
