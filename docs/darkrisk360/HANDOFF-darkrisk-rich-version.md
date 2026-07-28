# Handoff — DarkRisk360 "versione ricca": recupero, anteprima mock e piano backend

> Documento di passaggio consegne. Obiettivo: dare all'agent che svilupperà il **backend** (e poi
> l'integrazione frontend) tutto il contesto sulla versione "ricca" di DarkRisk360 che era stata
> persa, cosa era **realmente implementato** vs **mock**, e dove ho messo l'anteprima mock attuale.
>
> Repo: `ethergrade/hicompliance-DEV` · Branch di lavoro: `merge-imnick-IMNICK`

---

## 1. TL;DR

- Esisteva una versione **molto più ricca** della pagina DarkRisk360, poi persa nel branch di lavoro attuale.
- L'ho ritrovata nella storia del branch **`PRODOTTO`**, al suo apice al commit **`a4145d1`** (costruita col commit gemello **`58f7dfb`**).
- **Quella versione NON era un mock**: era codice di produzione cablato che leggeva dati reali da Supabase (tabelle + edge functions + migration). Vedi §4.
- Ho creato un'**anteprima con dati finti** (solo per mostrarla, senza backend) su una rotta nascosta, deployata su DEV. Vedi §2.
- Il backend che alimentava i grafici ricchi (**snapshot settimanale, notifiche, target manuali**) **non esiste** nel branch attuale: va riportato/rifatto e integrato. Vedi §5–§7.

---

## 2. Dove ho messo la pagina mock (stato attuale)

**Rotta (nascosta, pubblica dopo login con qualsiasi account, nessuna selezione cliente):**
`/anteprima-darkrisk-9f3a2c`
→ live: **https://hi.websoupcloud.it/anteprima-darkrisk-9f3a2c**

**File aggiunti (tutti isolati, nessun impatto sull'app reale):**
```
src/pages/darkrisk-preview/
├── DarkRiskRichPreview.tsx          # pagina a 8 tab, dati mock inline, self-contained
├── mockTabsData.ts                  # dati finti per le tab Findings/Assets/Surface/Identity/Reports/Roadmap
└── components/
    ├── DarkRiskSourcePieChart.tsx    # vendorati da PRODOTTO@a4145d1 (componenti puri, prop-driven)
    ├── DarkRiskFiletypePieChart.tsx
    ├── DarkRiskCalendarHeatmap.tsx
    ├── DarkRiskAssetBreakdown.tsx
    └── DarkRiskCredentialLeaks.tsx   # variante SENZA Supabase: riceve `hits` come prop
```
Rotta lazy aggiunta in `src/App.tsx` (import `DarkRiskRichPreview`). **`AuthProvider` NON è stato toccato** (login normale).

**Commit:**
- `da865a1` — anteprima iniziale (Overview)
- `2851cfb` — tab complete (Findings, Assets, Surface, Identity, Reports, Roadmap, Impostazioni)

**Cosa è mock qui:** il 100% dei dati. La pagina non fa nessuna chiamata a backend/Supabase; tutti i
valori sono costanti in `DarkRiskRichPreview.tsx` e `mockTabsData.ts`. Serve solo come riferimento
visivo/UX. **Non è il codice da mettere in produzione** — è una vetrina.

---

## 3. Origine: dove ho ritrovato la versione ricca

- Branch: **`origin/PRODOTTO`**
- Commit apice: **`a4145d1`** — "fix+feat: phonebook GET, bucket labels, credenziali overview, asset breakdown collassabile"
- Commit gemello (che introduce backend + componenti): **`58f7dfb`** — "feat: DarkRisk360 refactor — snapshot settimanale, notifiche multi-email, charts IntelX, scala 100+ clienti"

A `a4145d1`, `src/pages/DarkRisk360.tsx` era **una pagina unica da 2044 righe** con 8 tab
(Overview, Roadmap, Findings, Assets, Surface, Identity, Reports, Impostazioni) e montava questi
componenti "ricchi" (assenti nel branch attuale):
`DarkRiskSourcePieChart`, `DarkRiskFiletypePieChart`, `DarkRiskCalendarHeatmap`,
`DarkRiskAssetBreakdown`, `DarkRiskCredentialLeaks`, `DarkRiskManualTargetManager`,
`DarkRiskNotificationConfig` + hook `useDarkRiskSnapshot`.

**Per ispezionare l'originale** (già estratto in un worktree locale a a4145d1):
```bash
# worktree già presente sul disco (dev server spento):
../hicompliance-darkrisk-legacy        # = checkout completo di a4145d1

# oppure via git dal repo principale:
git show a4145d1:src/pages/DarkRisk360.tsx
git show a4145d1:supabase/functions/darkrisk360-snapshot/index.ts
git show a4145d1:src/hooks/useDarkRiskSnapshot.ts
git show 58f7dfb --stat            # elenco file introdotti
```

---

## 4. Cosa era REALE vs MOCK nell'originale ⭐ (domanda chiave)

**Era tutto reale, cablato su dati veri. Nessun placeholder.** Prove nel codice a `a4145d1`:

| Elemento UI | Fonte dati reale |
|---|---|
| Pie chart fonti/filetype, heatmap, asset breakdown | hook `useDarkRiskSnapshot` → tabella `darkrisk360_weekly_snapshots` |
| Credenziali esposte | `DarkRiskCredentialLeaks` → tabella `darkrisk_dti_sensitive_hits` (filtro `tag='passwords'`) |
| KPI, threat groups, coverage, alert, DTI totals | hook `useDarkRiskOverview` → edge function `darkrisk360-overview` |
| Roadmap / QA snapshot | hook `useDarkRiskRoadmapStatus` / `useDarkRiskQaStatus` |

La tabella `darkrisk360_weekly_snapshots` era **popolata dalla edge function `darkrisk360-snapshot`**,
che aggregava record reali (vedi §6). Quindi i grafici si riempivano con dati veri delle scansioni
IntelX/WHOIS/DNS, non con dati finti.

> Nota: il collega la ricordava "forse come mock" probabilmente perché all'epoca le tabelle erano
> poco popolate. A livello di codice era **produzione a tutti gli effetti**.

L'unica parte "mock" è **quella che ho aggiunto io adesso** (§2), necessaria perché sul Supabase DEV
attuale quelle tabelle sono vuote e nessuno le alimenta più (vedi §5).

---

## 5. Stato attuale (gap analysis) ⚠️

**Cosa ESISTE ed è vivo nel branch attuale `merge-imnick-IMNICK`** (lignaggio "IntelX orchestration v2"):
- Tabelle sorgente: `darkrisk_source_records`, `darkrisk_findings`, `darkrisk_scan_runs`,
  `darkrisk_entitlements`, `darkrisk_dti_sensitive_hits`, `darkrisk_assets`, ecc. — **attivamente popolate**.
- Edge functions: `darkrisk360-overview`, `darkrisk360-orchestrator-v2`, `darkrisk360-worker-v2`, ecc.
- Pagine reali usate in `App.tsx`: `src/features/darkrisk/standard/StandardDarkRiskPage.tsx` e
  `.../extended/ExtendedDarkRiskPage.tsx` (versioni **asciutte**), rotte `/dark-risk` e `/dark-risk-esteso`.

**Cosa MANCA nel branch attuale** (era in PRODOTTO, mai portato qui):
- ❌ Tabelle: `darkrisk360_weekly_snapshots`, `darkrisk360_manual_targets`, `darkrisk360_notification_configs` — **nessuna migration nel branch attuale**.
- ❌ Edge functions: `darkrisk360-snapshot`, `darkrisk360-notify`; shared `_shared/darkrisk-portfolio-risk.ts`.
- ❌ Componenti frontend ricchi + hook `useDarkRiskSnapshot` (nel branch attuale non esistono; li ho vendorati solo nella cartella preview).

**Reliquie su DEV:** sul Supabase DEV (`hcllvyzhefcqftesahnv`) le 3 tabelle e la function
`darkrisk360-snapshot` risultano ancora **deployate** (resti di PRODOTTO), ma **vuote/non più alimentate**
(nessun codice nel branch attuale le scrive). Non fidarsi di questi resti: vanno riportati come codice versionato.

---

## 6. Come funzionava il backend (da riprodurre)

### Flusso
```
scan run (IntelX/WHOIS/DNS) → popola darkrisk_source_records + darkrisk_findings
      │
      └─(fire-and-forget, a fine scan)→ darkrisk360-snapshot
                                          │ aggrega source_records + findings + entitlements
                                          └→ UPSERT darkrisk360_weekly_snapshots (1 riga/settimana/org)
                                                   │
        frontend useDarkRiskSnapshot ─────────────┘ (SELECT ultima settimana)
        frontend useDarkRiskOverview → edge darkrisk360-overview (KPI/threat/coverage/alert)
        frontend DarkRiskCredentialLeaks → SELECT darkrisk_dti_sensitive_hits (tag='passwords')
```
Nell'originale `darkrisk360-snapshot` era chiamata a fine scan da `darkrisk-esteso-sync`. Nel lignaggio
attuale l'orchestrazione è `darkrisk360-orchestrator-v2` / `darkrisk360-worker-v2`: **è lì che va
agganciata** la chiamata allo snapshot.

### `darkrisk360-snapshot` — logica di aggregazione (da `a4145d1`)
Input: `POST { organization_id, scan_run_id }`, auth header `x-darkrisk360-internal-secret`. Passi:
1. `total_records` = count `darkrisk_source_records` (org, `source='intelx'`).
2. `new_records_this_week` = count con `created_at >= lunedì corrente`.
3. `results_by_source` = group by `source_bucket`.
4. `results_by_filetype` = group by `source_media` (int IntelX → label via `mediaLabel()`; `0→other`).
5. `results_by_day` = group by `source_date` (data reale del leak), ultimi 365gg.
6. `results_by_asset` = group by `asset_scope` → `{ total, by_source, by_filetype }`.
7. `severity_distribution` = group by `severity` da `darkrisk_findings`.
8. `risk_index` = `calculatePortfolioRiskIndex(findings)` (in `_shared/darkrisk-portfolio-risk.ts`).
9. `delta_vs_prev` = confronto con snapshot settimana precedente (total, risk, nuovi bucket, delta severità).
10. `tier` da `darkrisk_entitlements`.
11. UPSERT su `darkrisk360_weekly_snapshots` con conflict key `(organization_id, week_key)`.

> ⚠️ Verificare che le colonne usate (`source_bucket`, `source_media`, `source_date`, `asset_scope`,
> `source='intelx'`, `darkrisk_findings.severity`) corrispondano allo schema **attuale** di
> `darkrisk_source_records` / `darkrisk_findings` (potrebbero essere cambiate rispetto a PRODOTTO).

### `darkrisk360-notify` (459 righe in `58f7dfb`)
Invia alert email multi-destinatario + digest settimanale, con rate-limiting per org. Legge
`darkrisk360_notification_configs`. Da valutare se in scope adesso o in una fase successiva.

---

## 7. Schema tabelle da (ri)creare

Migration originali (in `58f7dfb`), da adattare allo schema attuale. Sorgenti complete:
`git show 58f7dfb:supabase/migrations/<file>.sql`.

### `darkrisk360_weekly_snapshots` (alimenta i grafici ricchi)
```
id uuid pk · organization_id uuid FK organizations · scan_run_id uuid FK darkrisk_scan_runs
week_key text ('2026-W23') · week_start_date date · tier text
total_records int · new_records_this_week int · risk_index int [0..100]
results_by_source  jsonb   -- {"leaks_restricted":12,"dns":8,...}   → pie chart fonti
results_by_filetype jsonb  -- {"html":27,"text":6,...}              → pie chart filetype
results_by_day     jsonb   -- {"2026-05-26":4,...}                  → calendar heatmap
results_by_asset   jsonb   -- {"dominio.com":{total,by_source,by_filetype}} → asset breakdown (aggiunto in a4145d1, migration 20260603130000)
delta_vs_prev      jsonb   -- {"total_records":3,"risk_index":-2,"new_buckets":[...]}
severity_distribution jsonb -- {"critical":1,"high":4,...}
computed_at/created_at timestamptz · UNIQUE(organization_id, week_key)
RLS: SELECT per org_members; ALL per service_role.
```

### `darkrisk360_manual_targets` (tab Impostazioni → target manuali)
```
id · organization_id FK · target_type CHECK IN ('domain','email','ip','cidr')
value · normalized_value · label · enabled bool · added_by · created_at
UNIQUE(organization_id, target_type, normalized_value)
RLS: SELECT org_members; INSERT/UPDATE/DELETE solo role IN ('admin','owner'); ALL service_role.
```

### `darkrisk360_notification_configs` (tab Impostazioni → notifiche)
```
id · organization_id FK UNIQUE · recipient_emails text[]
alert_on_new_findings bool · alert_severity_threshold CHECK(critical..info) · min_new_findings_to_alert int
weekly_summary_enabled bool · last_alert_sent_at · last_summary_sent_at (rate-limit)
created_by/updated_by · created_at/updated_at (+ trigger updated_at)
RLS: SELECT org_members; ALL upsert per admin/owner; ALL service_role.
```

---

## 8. Contratti dati attesi dal frontend

Shape esatte che i componenti si aspettano (fonte: hook originali a `a4145d1`).

**`useDarkRiskSnapshot`** — `SELECT * FROM darkrisk360_weekly_snapshots WHERE org ORDER BY week_start_date DESC LIMIT 1`
```ts
interface DarkRiskWeeklySnapshot {
  id; organization_id; scan_run_id; week_key; week_start_date; tier;
  total_records: number; new_records_this_week: number; risk_index: number;
  results_by_source: Record<string, number>;
  results_by_filetype: Record<string, number>;
  results_by_day: Record<string, number>;             // "YYYY-MM-DD" → count
  results_by_asset: Record<string, { total: number; by_source: Record<string,number>; by_filetype: Record<string,number> }>;
  delta_vs_prev: { total_records?; risk_index?; new_buckets?: string[]; severity_delta?: Record<string,number> };
  severity_distribution: Record<string, number>;
  computed_at; created_at;
}
```

**`DarkRiskCredentialLeaks`** — `SELECT id, selector_value, asset_scope, clear_value, masked_value, source_bucket, tag, confidence, created_at, metadata FROM darkrisk_dti_sensitive_hits WHERE org AND tag='passwords' ORDER BY created_at DESC`

**`useDarkRiskOverview`** — edge `darkrisk360-overview` → oggetto `DarkRiskOverviewResponse`
(customer_id, enabled, tier, latest_scan, kpis{...}, coverage_controls[], threat_groups[],
recent_alerts[], alert_config, dti{sensitive_totals, sensitive_by_asset, ...}). Shape completo in
`git show a4145d1:src/hooks/useDarkRiskOverview.ts` (già esiste nel branch attuale — verificare parità).

I mapping label (bucket sorgenti, media→filetype) sono nei componenti vendorati in `src/pages/darkrisk-preview/components/` e in `_shared/darkrisk-portfolio-risk.ts` (`mediaLabel`).

---

## 9. Piano di lavoro consigliato per l'agent backend

1. **Migration**: portare le 3 tabelle (§7) come nuove migration nel branch attuale, adattando FK/colonne allo schema corrente.
2. **Edge `darkrisk360-snapshot`**: portarla da `a4145d1`, allineare i nomi colonna a `darkrisk_source_records`/`darkrisk_findings` attuali, riusare/riportare `_shared/darkrisk-portfolio-risk.ts`.
3. **Aggancio**: chiamare lo snapshot (fire-and-forget) a fine scan dentro `darkrisk360-orchestrator-v2`/`darkrisk360-worker-v2`; aggiungere il segreto `DARKRISK360_INTERNAL_SECRET`.
4. **Backfill**: eseguire lo snapshot una tantum sulle org esistenti per popolare la prima settimana.
5. **(Opz.) Notifiche/target**: `darkrisk360-notify` + CRUD `manual_targets` / `notification_configs`.
6. **Integrazione frontend**: portare i componenti ricchi da `src/pages/darkrisk-preview/components/`
   (o da `a4145d1`) nelle pagine reali `StandardDarkRiskPage`/`ExtendedDarkRiskPage`, sostituendo i
   dati mock con `useDarkRiskSnapshot` (versione reale, non quella mock) + `useDarkRiskOverview` +
   query credential leaks. **Rimuovere poi la rotta/anteprima mock** `/anteprima-darkrisk-9f3a2c` e la
   cartella `src/pages/darkrisk-preview/`.
7. **Verifica end-to-end**: scan → snapshot popolato → grafici reali in pagina.

---

## 10. Riferimenti rapidi

- Anteprima mock live: https://hi.websoupcloud.it/anteprima-darkrisk-9f3a2c
- Commit anteprima: `da865a1`, `2851cfb` (branch `merge-imnick-IMNICK`)
- Origine ricca: branch `PRODOTTO`, commit `a4145d1` (+ `58f7dfb`)
- Worktree locale con l'originale: `../hicompliance-darkrisk-legacy`
- Supabase DEV: progetto `hcllvyzhefcqftesahnv`
