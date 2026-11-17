# Business Impact Analysis (BIA) — documentazione DEV

Documento unico del modulo BIA: architettura, modello di calcolo `BIA_SCORE_V1`, database, workflow, permessi, export e test.

Specifica di riferimento: README BIA e allegati 01–06 (modello `BIA_SCORE_V1`).

---

## 1. Panoramica

Il modulo BIA valuta la criticità dei servizi di business del cliente calcolando un **Business Impact Score (BIS)** su 5 dimensioni pesate, con workflow di approvazione, versioning e audit completo.

- Registro servizi con vista operativa ed executive
- Suggerimenti automatici da Infrastruttura Critica
- Auto-save bozza (debounce 1,5 s) con controllo conflitti su `updated_at`
- Ricalcolo autoritativo lato database (funzione `bia_compute`)
- Export PDF con filigrana BOZZA per versioni non approvate

## 2. Pagine e routing

| Percorso | Pagina | Contenuto |
|---|---|---|
| `/business-impact-analysis` | `src/pages/BusinessImpactAnalysis.tsx` (390 righe) | Registro servizi, vista operativa/executive, suggerimenti da infrastruttura critica |
| `/business-impact-analysis/services/:serviceId` | `src/pages/BusinessImpactServiceDetail.tsx` (603 righe) | Dettaglio servizio con tab: Sintesi, Impatti, Recovery, Dipendenze, Rischi e remediation, Storico |
| `.../bia/:biaId` | stessa pagina | Apertura diretta di una specifica revisione BIA |

Route protette da `ClientSelectionGuard` in `src/App.tsx`. Voce di menu in sidebar HiCompliance; permesso `hicompliance.bia` (`src/lib/permissions/catalog.ts`, mapping rotta in `src/config/moduleServiceMap.ts`).

## 3. Struttura del codice

```text
src/
├── pages/
│   ├── BusinessImpactAnalysis.tsx        # registro servizi
│   └── BusinessImpactServiceDetail.tsx   # dettaglio servizio / revisione BIA
├── components/bia/
│   └── ServiceFormDialog.tsx             # creazione/modifica servizio
├── hooks/
│   └── useBia.ts                         # hook dati BIA
├── lib/
│   ├── api/bia.ts                        # chiamate Supabase (tabelle + RPC)
│   └── bia/
│       ├── calculations.ts               # anteprima frontend del modello (148 righe)
│       ├── calculations.test.ts          # 29 test sul motore di calcolo
│       ├── formatters.ts                 # formattazione valori/etichette
│       └── exportBiaPdf.ts               # export PDF con filigrana
└── types/bia.ts                          # tipi TypeScript (205 righe)
```

## 4. Database (Supabase)

Migrazione principale: `supabase/migrations/20260924165457_b01bb31a-41e7-48e9-a528-878305205998.sql`.

### Tabelle

| Tabella | Ruolo |
|---|---|
| `bia_model_configurations` | Configurazione versionata del modello (seed `BIA_SCORE_V1`); lettura a tutti gli autenticati |
| `business_services` | Anagrafica servizi di business per organizzazione |
| `bia_assessments` | Revisioni BIA per servizio; `model_version` FK alla configurazione; indice unico `bia_one_open_version` (una sola versione aperta draft/in_review per servizio) |
| `bia_impact_values` | Impatti per orizzonte temporale (`UNIQUE(bia_assessment_id, horizon_minutes)`) |
| `bia_service_dependencies` | Dipendenze tra servizi |
| `bia_technical_asset_links` | Collegamenti ad asset tecnici |
| `bia_risk_links` | Collegamenti a rischi |
| `bia_remediation_links` | Collegamenti a remediation (FK opzionali a assessment e risk_link) |
| `bia_audit_events` | Audit trail (indice su organization_id, entity_id, created_at DESC) |

Tutte le tabelle hanno RLS abilitata; grant `authenticated` su SELECT/INSERT/UPDATE (DELETE dove serve), `service_role` con ALL.

### Funzioni

| Funzione | Scopo |
|---|---|
| `bia_can_edit(_org)` | Permesso di modifica |
| `bia_can_approve(_org)` | Permesso di approvazione |
| `bia_sales_only(_org)` | Vista sola lettura per sales |
| `bia_service_before()` | Trigger: snapshot prima della modifica servizio |
| `bia_impact_totals()` | Trigger: totali impatto |
| `bia_assessment_guard()` | Trigger: protegge revisioni approvate (immutabili) |
| `bia_dependency_guard()` | Trigger: validazione dipendenze |
| `bia_link_guard()` | Trigger: validazione link |
| `bia_audit(...)` | Scrittura eventi di audit |
| `bia_compute` | Ricalcolo autoritativo del BIS lato database |
| `bia_clone_revision` | Crea nuova revisione da una approvata |

## 5. Modello di calcolo `BIA_SCORE_V1`

Il database (`bia_compute`) è la fonte autoritativa; `src/lib/bia/calculations.ts` è solo anteprima live durante la compilazione, coperta da test che replicano gli esempi della specifica. Nessun arrotondamento nei passaggi intermedi.

### Pesi delle dimensioni

| Dimensione | Peso |
|---|---|
| Economica | 0,40 |
| Operativa | 0,25 |
| Normativa | 0,15 |
| Reputazionale | 0,10 |
| Dipendenze | 0,10 |

### Regole

- **Scala ordinale**: livello 0 = nessun impatto; livelli 1..max normalizzati a 0–100 (`normalizeOrdinal`).
- **Dimensione economica**: dal costo a 24 h con bucket 25/50/75/100 (soglie 10k/50k/100k €) — `economicScoreFrom24h`.
- **Dimensione dipendenze**: base per numero di dipendenti (0 / 33,33 / 66,67 / 100), +15 se single point of failure, +10 se senza workaround, max 100 — `dependencyScore`.
- **BIS**: somma pesata delle 5 dimensioni; `null` se manca una dimensione obbligatoria — `businessImpactScore`.
- **Classi di criticità** (fasce continue, l'esempio della specifica 80,42 = Critica prevale sulle fasce intere):
  - 0–30 Bassa, 31–60 Media, 61–80 Alta, 81–100 Critica — `criticalityClass`.
- **Indice di priorità**: BIS × rischio residuo / 100; il rischio tecnico resta separato dal BIS — `businessPriorityIndex`, `residualFromRiskAnalysis` (converte score "più alto = meglio" in rischio 0–100).
- **Perdita annua attesa (EAL)**: calcolata solo con frequenza documentata (fonte obbligatoria); stati `missing_cost` / `missing_frequency` / `calculated` — `expectedAnnualLoss`.
- **Totali impatto**: somma delle 8 componenti di costo; override manuale solo con motivazione obbligatoria — `impactTotals`.
- **Curva impatti**: deve essere monotona crescente sugli orizzonti — `isMonotonic`. Orizzonti default: 240, 480, 1440, 4320 minuti.
- **Recovery gap**: coperto / non coperto / sconosciuto; RTO valido solo se < MTPD — `recoveryGap`, `rtoValid`.
- **ROI remediation**: beneficio annuo, ROI %, payback in mesi; `null` = "non calcolabile", mai 0; richiede riduzione motivata e budget — `remediationValue`.

## 6. Workflow di revisione

```text
bozza ──► in revisione ──► approvata (immutabile)
  ▲            │
  └────────────┘  richiesta modifiche con commento

approvata ──bia_clone_revision──► nuova bozza (versione successiva)
```

- Una sola versione aperta (draft/in_review) per servizio (indice `bia_one_open_version`).
- Le revisioni approvate sono immutabili (trigger `bia_assessment_guard`).
- Ogni transizione è tracciata in `bia_audit_events` con before/after JSON e motivazione.

## 7. Permessi

- Permesso modulo: `hicompliance.bia` nel catalogo permessi.
- `bia_can_edit` / `bia_can_approve` separano redattori e approvatori.
- `bia_sales_only`: il ruolo sales vede in sola lettura.

## 8. Export PDF

`src/lib/bia/exportBiaPdf.ts`: export della revisione BIA in PDF; le versioni non approvate portano la filigrana **BOZZA**.

## 9. Test

- `bun test src/lib/bia` — 29 test sul motore di calcolo (esempi della specifica, soglie, edge case).
- Verifica E2E: creazione servizio, inserimento costo a 24 h, ricalcolo dimensione economica (75) e copertura dati.

## 10. Decisioni architetturali

- **Backend**: su questo branch prototipo il backend autoritativo è Supabase (tabelle + RPC con RLS), non l'API Laravel prevista dal README. Nessun dato in localStorage.
- **Soglie di criticità**: >80 Critica, >60 Alta, >30 Media (l'esempio della specifica 80,42 = Critica prevale sulle fasce intere 81–100).
- Perdita annua attesa calcolata solo con frequenza documentata; ROI/payback solo con riduzione motivata e budget.
- Il rischio tecnico resta separato dal Business Impact Score (indice di priorità = BIS × rischio / 100).

## 11. Da completare

- Integrazione ordine di recovery nella pagina Incident Response.
- Warning di sicurezza database preesistenti (funzioni SECURITY DEFINER eseguibili, viste, ecc.).

## 12. Lavoro della giornata (branch PROTOTIPO)

Login su Supabase, demo Innovatech (HiTrack, HiPatch, SurfaceScan, DarkRisk), assessment/remediation/IRP su Supabase, Supply Chain con portale fornitori, snapshot e confronto assessment, modulo BIA.
