# Sales Manager — Documentazione DEV

Modulo commerciale interno HiSolution per gestire valore, stato e pianificazione delle remediation dei clienti.
Visibile **solo** a `super_admin` e `sales` (tabella `user_roles`, funzione `has_role`).

## 1. Pagine e routing

| Route | File | Contenuto |
|---|---|---|
| `/sales-manager` | `src/pages/SalesManager.tsx` | Vista «Dashboard» (KPI, avanzamento, clienti in trattativa/completati, target annuali) e vista «Clienti» (tabella, dettaglio cliente) |
| `/sales-manager/piano/:orgId` | `src/pages/SalesPlan.tsx` | Piano completo: budget, azioni, attività, scadenzario |

Guard: `useUserRoles()` → `isSuperAdmin || isSales`, altrimenti redirect a `/dashboard`. Voce sidebar in `AppSidebar.tsx` (icona Briefcase), stessa condizione.

## 2. Struttura del codice

| File | Ruolo |
|---|---|
| `src/lib/salesManager/value.ts` | Stati, transizioni, `effectiveValue`, `summarize`, `annualKpi`, formatter `eur` |
| `src/lib/salesManager/plan.ts` | `dueState`, `planTotals` (scadenze e costi attività) |
| `src/lib/api/salesManager.ts` | `listRows` (join `remediation_tasks` + `remediation_commercial`), `save` (upsert su `task_id`), `pushBudget` |
| `src/lib/salesManager/export.ts` | Export CSV, Excel (2 fogli), PowerPoint (pptxgenjs, logo HiSolution) |
| `src/components/sales/SalesDashboard.tsx` | KPI proposte accettate, grafico avanzamento per cliente, liste clienti |
| `src/components/sales/SalesKpiPanel.tsx` | Target annuali, rimanenti, grafici per stato e settore |
| `supabase/functions/crm-sync/index.ts` | API per CRM esterno (vedi `docs/crm-sync-api.md`) |

## 3. Database

| Tabella | Campi principali | Accesso (RLS) |
|---|---|---|
| `remediation_tasks` (esistente) | `task, category, priority, progress, budget, start_date, end_date, source` | invariata; sales tocca solo `budget` |
| `remediation_commercial` | `task_id` (unique), `organization_id, status, proposed_value, currency, notes, proposed_at, closed_at, updated_by` | super_admin / sales |
| `sales_targets` | `year` (PK), `target_value, target_count` | super_admin / sales |
| `remediation_plan_items` | `task_id` (FK cascade), `organization_id, title, owner, due_date, cost, done, notes, sort_order` | super_admin / sales |
| `crm_sync_events` | `organization_id, vat_number, task_id, status, budget, origin` (`platform`/`crm`) | lettura super_admin / sales; scrittura solo trigger/server |

### Trigger
- `trg_commercial_to_task_budget` / `trg_task_budget_to_commercial`: mantengono **uguali** `remediation_commercial.proposed_value` e `remediation_tasks.budget` (guardia `IS DISTINCT FROM` contro i loop).
- `trg_crm_commercial` / `trg_crm_task_budget`: scrivono in `crm_sync_events` ogni cambio di stato o budget; `origin='crm'` quando `auth.uid()` è nullo (chiamata server).
- Funzioni trigger `SECURITY DEFINER` con `EXECUTE` revocato a `anon/authenticated`.

### Realtime
Pubblicate su `supabase_realtime`: `remediation_commercial`, `remediation_tasks`, `sales_targets`, `remediation_plan_items`. Canali con nome univoco, rimossi nel cleanup di `useEffect`, reload con debounce 800 ms.

## 4. Regole di business

### Stati commerciali
`proposto → inviato → in_trattativa → accettato | rifiutato → in_esecuzione → completato`
- Nel dettaglio cliente i pulsanti mostrano solo le transizioni ammesse (`nextStatuses`).
- La modifica multipla (righe o clienti) può impostare qualsiasi stato, previa conferma.
- `inviato` imposta `proposed_at`; `accettato/rifiutato/in_esecuzione/completato` impostano `closed_at`.
- «Vinte» (`isWon`): `accettato`, `in_esecuzione`, `completato`.

### Valore
- `effectiveValue(budget, proposed)`: valore del commerciale se > 0, altrimenti budget del piano, altrimenti `null` (= «da valorizzare»).
- Ogni modifica al valore si propaga al piano tramite trigger (nessun pulsante manuale).

### KPI
- Proposte accettate = vinte / non più in `proposto`. Tasso = vinte / (vinte + rifiutate).
- Target annuale: chiuso = somma valori vinti con `closed_at` (fallback `updated_at`) nell'anno; rimanente = `max(0, target − chiuso)`.
- Avanzamento = media di `remediation_tasks.progress` per cliente.
- Settore = `organization_profiles.business_sector` («Non indicato» se vuoto).

### Piano completo
- Attività per remediation con scadenza: `scaduto` (passata, non fatta), `in_scadenza` (≤ 7 giorni), `pianificato`, `senza_data`, `fatto`.
- Avviso «oltre budget» se la somma dei costi supera il valore effettivo.

## 5. UX
- Salvataggio automatico con debounce 1,5 s (nessun pulsante «Salva»).
- Ordinamento A→Z / Z→A / reset cliccando l'intestazione (`SortHead`).
- Selezione multipla con checkbox: righe remediation (stato, valore) e clienti (stato con filtro «da stato»).

## 6. Export
- **CSV** (`;`, BOM UTF-8): riepilogo clienti + dettaglio completo.
- **Excel**: «Riepilogo» e «Dettaglio» con intestazione HiSolution; tutti i campi, inclusi date, allineamento budget, ID.
- **PowerPoint**: copertina, riepilogo pipeline con grafico, slide per cliente (10 righe per slide, paginazione completa), chiusura; logo `src/assets/logo-hi.png`.

## 7. Integrazione CRM
API generica, chiave **Partita IVA**: `upsert_client`, `list_remediations`, `update_remediation`, `list_changes`. Specifica completa in `docs/crm-sync-api.md`.
**Da completare:** salvare il segreto `CRM_SYNC_TOKEN` (finché manca l'API risponde 500 «not configured»).

## 8. Test
`bun test src/lib/salesManager` — regole valore, transizioni, riepilogo, KPI annuale, scadenze e budget superato.

## 9. Checklist QA manuale
1. Utente `client`: `/sales-manager` reindirizza a `/dashboard`.
2. Valore inserito nel Sales Manager → compare come budget nel piano del cliente.
3. Budget cambiato nel piano → si aggiorna nel Sales Manager senza ricaricare.
4. Remediation spostata ad «Accettato» → KPI e barra target si aggiornano.
5. Multi-selezione clienti, filtro «Proposto» → «Inviato»: solo quelle remediation cambiano, `proposed_at` valorizzato.
6. Piano completo: attività con scadenza passata → «Scaduto» e conteggio in alto.
7. Export CSV/Excel/PPT con tutte le remediation e tutti i campi.
