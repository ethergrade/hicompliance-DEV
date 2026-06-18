# Mappa SurfaceScan360 — Reconnaissance per migrazione Supabase → Backend API

> Branch: `imnick` | HEAD: `68b2935`  
> Commit target: `34f2377` (revert del fix parziale di Stefano, `2c81f26`)  
> Data: 2026-06-18

---

## 1. File coinvolti in `/surface-scan`

### Pagina entry point

| File | Ruolo |
|---|---|
| `src/pages/SurfaceScan360.tsx` (1675 righe) | Pagina principale, reverse DNS, layout composizione |

### Hook (logica di fetching e stato)

| File | Stato migrazione | Supabase rimasto |
|---|---|---|
| `src/hooks/useSurfaceScan360.ts` | ✅ Migrato (`e8c7dff`) | ❌ Nessuno |
| `src/hooks/useSurfaceScanAlerts.ts` | ✅ Già su API (`surface-scan-alerts.ts`) | ❌ Nessuno |
| `src/hooks/useSurfaceScanDiscoveredAssets.ts` | ⚠️ Parziale | ✅ 1 chiamata (scope rules) |
| `src/hooks/useSurfaceScanEngine.ts` | ✅ Migrato (`e8c7dff`) | ❌ Nessuno |
| `src/hooks/useSurfaceScanFindings.ts` | ⚠️ Parziale | ✅ 1 chiamata (scope rules) |
| `src/hooks/useSurfaceScanHistory.ts` | ✅ Migrato (`e8c7dff`) | ❌ Nessuno |
| `src/hooks/useSurfaceScanIocFreshList.ts` | ❌ NON migrato | ✅ 6 chiamate |
| `src/hooks/useSurfaceScanMonitoredIps.ts` | ❌ Revertato (`34f2377`) | ✅ 4 chiamate |
| `src/hooks/useSurfaceScanReportRepository.ts` | ⚠️ Parziale | ✅ 1 chiamata (delete report) |

### Sotto-componenti

| File | Stato migrazione | Supabase rimasto |
|---|---|---|
| `src/components/surface-scan/SurfaceScanExposureSection.tsx` | ✅ Migrato (`94a646a`) | ❌ Nessuno |
| `src/components/surface-scan/SurfaceScanModuleCards.tsx` | ⚠️ Parziale | ✅ 2 chiamate (scope + multi-table) |
| `src/components/surface-scan/SurfaceScanJobsPanel.tsx` | ✅ Pulito | ❌ Nessuno |
| `src/components/surface-scan/SurfaceScanTrendline.tsx` | ✅ Pulito | ❌ Nessuno |
| `src/components/surface-scan/SurfaceScanAlertConfigDialog.tsx` | ✅ Pulito | ❌ Nessuno |
| `src/components/surface-scan/SurfaceScanReportRepository.tsx` | ✅ Pulito | ❌ Nessuno |
| `src/components/service-dashboards/SurfaceScanDashboard.tsx` | ✅ Pulito | ❌ Nessuno |

### Client API

| File | Ruolo |
|---|---|
| `src/lib/api/surface-scan360.ts` | API client principale (14 metodi) |
| `src/lib/api/surface-scan-alerts.ts` | API per alert config (CRUD completo) |
| `src/lib/api/darkrisk.ts` | API DarkRisk360 (targets, scan runs, report snapshots) |

---

## 2. Chiamate Supabase residue (post-commit `34f2377`)

### 2.1 — `useSurfaceScanMonitoredIps.ts` (4 chiamate, **file revertato**)

| # | Riga | Tabella | Operazione | Flusso utente |
|---|---|---|---|---|
| 1 | **120** | `surface_scan_monitored_ips` | `select('*')` | Caricamento lista IP monitorati (fetch iniziale + refetch) |
| 2 | **197** | `surface_scan_monitored_ips` | `insert(payload)` | Aggiunta manuale di un IP/dominio/range/CIDR |
| 3 | **222** | `organizations` | `select('surface_scan360_enabled, dark_risk360_enabled')` | Lettura flag organizzazione per decidere auto-queue scan e auto-sync DarkRisk |
| 4 | **284** | `surface_scan_monitored_ips` | `delete().eq('id', id)` | Rimozione di una regola IP monitorata |

```typescript
// Riga 120 — READ rules
const { data, error } = await supabase
  .from('surface_scan_monitored_ips' as any)
  .select('*')
  .eq('organization_id', organizationId)
  .order('created_at', { ascending: false });

// Riga 197 — CREATE rule
const { error } = await supabase
  .from('surface_scan_monitored_ips' as any)
  .insert(payload);

// Riga 222 — READ org flags
const { data: orgFlagsData, error: orgFlagsError } = await supabase
  .from('organizations' as any)
  .select('surface_scan360_enabled, dark_risk360_enabled')
  .eq('id', organizationId)
  .maybeSingle();

// Riga 284 — DELETE rule
const { error } = await supabase
  .from('surface_scan_monitored_ips' as any)
  .delete()
  .eq('id', id);
```

### 2.2 — `useSurfaceScanDiscoveredAssets.ts` (1 chiamata)

| # | Riga | Tabella | Operazione | Flusso utente |
|---|---|---|---|---|
| 5 | **144** | `surface_scan_monitored_ips` | `select('entry_type, input_value, ip_start, ip_end')` | Scope rules per classificare asset come in-scope/excluded |

```typescript
// Riga 144 — READ scope rules
const { data: scopeRows, error: scopeErr } = await supabase
  .from('surface_scan_monitored_ips' as any)
  .select('entry_type, input_value, ip_start, ip_end')
  .eq('organization_id', organizationId);
```

### 2.3 — `useSurfaceScanFindings.ts` (1 chiamata)

| # | Riga | Tabella | Operazione | Flusso utente |
|---|---|---|---|---|
| 6 | **359** | `surface_scan_monitored_ips` | `select('entry_type, input_value, ip_start, ip_end')` | Scope rules per filtrare finding per dominio in-scope |

```typescript
// Riga 359 — READ scope rules (identica alla #5)
const { data: scopeRows, error: scopeErr } = await supabase
  .from('surface_scan_monitored_ips' as any)
  .select('entry_type, input_value, ip_start, ip_end')
  .eq('organization_id', organizationId);
```

### 2.4 — `useSurfaceScanIocFreshList.ts` (6 chiamate, **file non toccato**)

| # | Riga | Tabella | Operazione | Flusso utente |
|---|---|---|---|---|
| 7 | **121** | `surface_scan_ioc_fresh_config` | `select('*').maybeSingle()` | Lettura configurazione IOC Fresh List |
| 8 | **126** | `surface_scan_ioc_fresh_items` | `select('*').order(...).limit(500)` | Lettura lista IOC attivi |
| 9 | **187** | `surface_scan_ioc_fresh_config` | `upsert({...}, {onConflict:'organization_id'})` | Salvataggio configurazione (lease, enabled) |
| 10 | **252** | `surface_scan_ioc_fresh_items` | `insert({...})` | Aggiunta manuale di un IOC |
| 11 | **309** | `surface_scan_ioc_fresh_items` | `delete().eq('id', id)` | Rimozione di un IOC |
| 12 | **346** | `surface_scan_ioc_fresh_items` | `update({is_active}).eq('id', id)` | Toggle attivo/inattivo di un IOC |

### 2.5 — `useSurfaceScanReportRepository.ts` (1 chiamata)

| # | Riga | Tabella | Operazione | Flusso utente |
|---|---|---|---|---|
| 13 | **173** | `surface_scan_ai_reports` | `delete().eq('id', id).eq('organization_id', orgId)` | Eliminazione report AI dal repository |

```typescript
// Riga 173 — DELETE report (commento nel codice: "No backend delete endpoint yet")
const { error } = await supabase
  .from('surface_scan_ai_reports')
  .delete()
  .eq('id', id)
  .eq('organization_id', organizationId);
```

### 2.6 — `SurfaceScan360.tsx` (pagina) (2 chiamate + 1 realtime)

| # | Riga | Tabella | Operazione | Flusso utente |
|---|---|---|---|---|
| 14 | **396** | `surface_assets` | `select('asset_value, raw').eq('asset_type','reverse_dns_hostname').limit(1500)` | Reverse DNS map per arricchire le card con hostname |
| 15 | **427** | `surface_assets` | Realtime channel `postgres_changes:*` | Aggiornamento live reverse DNS |
| 16 | **453** | `surface_assets` | `removeChannel(...)` | Cleanup canale Realtime |

```typescript
// Riga 396 — READ reverse DNS assets
const { data, error } = await supabase
  .from("surface_assets" as any)
  .select("asset_value, raw")
  .eq("organization_id", organizationId)
  .eq("asset_type", "reverse_dns_hostname")
  .order("last_seen", { ascending: false })
  .limit(1500);

// Riga 427 — REALTIME subscription
const reverseDnsChannel = supabase
  .channel(`surface-reverse-dns-${organizationId}`)
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "surface_assets",
    filter: `organization_id=eq.${organizationId}`,
  }, (payload) => { void loadReverseDnsMap(); })
  .subscribe();
```

### 2.7 — `SurfaceScanModuleCards.tsx` (2 chiamate, ma una è multi-tabella)

| # | Riga | Tabella | Operazione | Flusso utente |
|---|---|---|---|---|
| 17 | **503** | `surface_scan_monitored_ips` | `select('entry_type, input_value, ip_start, ip_end')` | Scope rules per target configuration (identica a #5, #6) |
| 18 | **485** | `surface_scan_module_results` | `select(...).in('scan_job_id', group)` | Risultati dei moduli di scan (es. DNS enum, port scan, SSL check) |
| 19 | **657** | `surface_observations` | `select(...).in('scan_job_id', group)` | Dettaglio observability per dominio/porta |
| 20 | **670** | `surface_open_ports` | `select(...).in('scan_job_id', group)` | Porte aperte, servizi, fingerprinting |

> Nota: le chiamate 18-20 sono eseguite insieme via `fetchRowsByJobIds()` (helper interno a riga 477) che itera `supabase.from(table).select(select).in('scan_job_id', group)` in batch da 40 job ID. Sono 3 tabelle distinte ma condividono lo stesso pattern.

---

## 3. Endpoint backend esistenti in `src/lib/api/surface-scan360.ts`

### Metodi già esposti (14 metodi)

| # | Nome metodo | Firma | Copre supabase call? |
|---|---|---|---|
| 1 | `listJobs` | `(companyId, params?, groupId?) → SurfaceScanJob[]` | ❌ (già usato da hooks migrati) |
| 2 | `createJob` | `(companyId, payload, groupId?) → SurfaceScanJob` | ❌ (trigger scan, non CRUD) |
| 3 | `getJob` | `(companyId, jobId, groupId?) → SurfaceScanJob` | ❌ |
| 4 | `getJobFindings` | `(companyId, jobId, params?, groupId?) → any[]` | ❌ |
| 5 | `listAiReports` | `(companyId, params?, groupId?) → SurfaceScanAiReport[]` | ❌ |
| 6 | `createAiReport` | `(companyId, payload?, groupId?) → SurfaceScanAiReport` | ❌ |
| 7 | `getAiReport` | `(companyId, reportId, groupId?) → any` | ❌ |
| 8 | `getExposureFindings` | `(companyId, jobId, params?, groupId?) → any[]` | ❌ |
| 9 | `getExposureSummary` | `(companyId, params?, groupId?) → any` | ❌ |
| 10 | **`listMonitoredIps`** | `(companyId, groupId?) → any[]` | ✅ **Copre #1, #5, #6, #17** (READ monitored_ips) |
| 11 | **`deleteMonitoredIp`** | `(companyId, monitoredIpId, groupId?) → void` | ✅ **Copre #4** (DELETE rule) |
| 12 | **`getObservations`** | `(companyId, params?, groupId?) → any[]` | ✅ **Copre #19** (surface_observations) |
| 13 | **`getModuleResults`** | `(companyId, params?, groupId?) → any[]` | ✅ **Copre #18** (surface_scan_module_results) |
| 14 | *(createJob overload)* | `(companyId, payload, groupId?) → any` | ❌ |

### Metodi MANCANTI (da aggiungere per copertura completa)

| Metodo necessario | Coprirebbe supabase call # | Endpoint backend |
|---|---|---|
| `createMonitoredIp` | #2 (INSERT monitored_ips) | `POST /companies/{id}/surface-scan360/monitored-ips` — **era nel commit 2c81f26, revertato** |
| `getOrganizationFlags` | #3 (organizations flags) | `GET /companies/{id}/tenant-services` o endpoint dedicato — **Stefano usava `tenantServicesApi.listByOrganization`** |
| — (IOC config CRUD) | #7, #9 | Nuovo endpoint IOC Fresh List |
| — (IOC items CRUD) | #8, #10, #11, #12 | Nuovo endpoint IOC Fresh List |
| `deleteAiReport` | #13 (DELETE ai_report) | `DELETE /companies/{id}/surface-scan360/ai-report/{reportId}` |
| `getReverseDnsAssets` | #14 (READ surface_assets) | `GET /companies/{id}/surface-scan360/reverse-dns` o simile |
| — (Realtime) | #15, #16 | Polling via `refetchInterval` (pattern `e8c7dff`) |
| `getOpenPorts` | #20 (surface_open_ports) | `GET /companies/{id}/surface-scan360/open-ports` o `.../jobs/{jobId}/open-ports` |

---

## 4. Gap Analysis — Riepilogo

### Copertura esistente (nessun intervento necessario)

| Supabase call # | Tabella | Endpoint backend pronto |
|---|---|---|
| #1 (READ) | `surface_scan_monitored_ips` | ✅ `listMonitoredIps` |
| #4 (DELETE) | `surface_scan_monitored_ips` | ✅ `deleteMonitoredIp` |
| #5, #6, #17 (READ scope rules) | `surface_scan_monitored_ips` | ✅ `listMonitoredIps` (stesso endpoint, diverso consumer) |
| #18 | `surface_scan_module_results` | ✅ `getModuleResults` |
| #19 | `surface_observations` | ✅ `getObservations` |

### Gap: endpoint backend esiste, metodo API client era presente ma revertato

| Supabase call # | Necessita |
|---|---|
| #2 (INSERT) | `createMonitoredIp` — **era in `2c81f26`, va riaggiunto identico** |

### Gap: va creato endpoint backend + metodo API client

| Supabase call # | Tabella | Nuovo endpoint suggerito |
|---|---|---|
| #3 | `organizations` | `tenantServicesApi.listByOrganization(orgId, groupId)` (Stefano già lo usava) oppure endpoint dedicato per flags |
| #7, #9 | `surface_scan_ioc_fresh_config` | `GET/PUT /companies/{id}/surface-scan360/ioc-fresh-config` |
| #8, #10, #11, #12 | `surface_scan_ioc_fresh_items` | `GET/POST/DELETE/PATCH /companies/{id}/surface-scan360/ioc-fresh-items` |
| #13 | `surface_scan_ai_reports` | `DELETE /companies/{id}/surface-scan360/ai-report/{reportId}` |
| #14 | `surface_assets` | `GET /companies/{id}/surface-scan360/reverse-dns` |
| #20 | `surface_open_ports` | `GET /companies/{id}/surface-scan360/open-ports?job_ids=...` |

### Gap: pattern diverso (Realtime → polling)

| Supabase call # | Soluzione |
|---|---|
| #15, #16 | Sostituire Realtime channel con `refetchInterval` in `useQuery` (pattern già usato in `e8c7dff` per `useSurfaceScanHistory`, `useSurfaceScanDiscoveredAssets`, `useSurfaceScanFindings`) |

---

## 5. Pattern di migrazione riuscita (da commit `94a646a` e `e8c7dff`)

### Pattern API client (`94a646a`)

```typescript
// src/lib/api/surface-scan360.ts — aggiunta metodo
async listMonitoredIps(
  companyId: string,
  groupId?: string | null,
): Promise<any[]> {
  const res = await complianceApiClient.get<ApiResponse<any[]>>(
    `/companies/${companyId}/surface-scan360/monitored-ips`,
    undefined,
    groupId ? groupHeader(groupId) : undefined,   // <-- multi-tenancy header
  );
  return extractArray<any>(res.data || []);         // <-- extractArray per paginati
}
```

### Pattern hook migrato (`e8c7dff`)

```typescript
// Prima: useState + useEffect + supabase.from(...).select(...) + Realtime channel
// Dopo: useQuery con polling

const { organizationId, isLoading: orgLoading, groupId } = useClientOrganization();
//                                              ^^^^^^^ destruttura groupId

const { data: jobs = [], isLoading, refetch } = useQuery({
  queryKey: ['surface-scan-history', organizationId, limit, groupId],
  queryFn: async () => {
    if (!organizationId) return [];
    return surfaceScan360Api.listJobs(organizationId, { page: 1 }, groupId);
    //                                                         ^^^^^^^ passato al metodo
  },
  enabled: !!organizationId,
  refetchInterval: 30_000,   // polling sostituisce Realtime
  staleTime: 15_000,
});
```

### Pattern componente migrato (`94a646a`)

```typescript
// Prima:
import { supabase } from '@/integrations/supabase/client';
const { organizationId } = useClientOrganization();
const [summary, monitoredRules] = await Promise.all([
  fetchExposureSummary({ customerId: organizationId, ... }),
  supabase.from('surface_scan_monitored_ips').select('...').eq('organization_id', organizationId),
]);

// Dopo:
import { surfaceScan360Api } from '@/lib/api/surface-scan360';
const { organizationId, groupId } = useClientOrganization();   // <-- aggiunto groupId
const [summary, monitoredRulesData] = await Promise.all([
  surfaceScan360Api.getExposureSummary(organizationId, { scope_mode: '...' }, groupId),
  surfaceScan360Api.listMonitoredIps(organizationId, groupId),   // <-- groupId passato
]);
// Rimossa la gestione dell'errore su .error (i metodi API lanciano eccezioni)
```

### Regole del pattern consolidate

1. **Firma metodo**: `(companyId: string, ...args, groupId?: string | null) → Promise<T>`
2. **Header multi-tenancy**: `groupId ? groupHeader(groupId) : undefined` come ultimo argomento di `complianceApiClient`
3. **Estrazione array**: `extractArray<T>(res.data)` per risposte che possono essere Laravel paginate
4. **Destrutturazione**: sempre `const { organizationId, groupId } = useClientOrganization()` nel consumer
5. **Error handling**: i metodi API lanciano eccezioni (non ritornano `.error`); il consumer usa try/catch
6. **No supabase import**: rimuovere completamente `import { supabase }` dal file migrato
7. **Polling**: `useQuery` con `refetchInterval: 30_000` al posto dei Realtime channel
8. **Refetch**: `refetch()` esplicito dopo mutazioni (create/delete) o `queryClient.invalidateQueries()`

---

## 6. Analisi del commit rotto di Stefano (`2c81f26`)

### Cosa ha cambiato Stefano in `useSurfaceScanMonitoredIps.ts`

Stefano ha sostituito **4 supabase call su 4**:

| Call originale | Sostituita con | Stato |
|---|---|---|
| `supabase.from('surface_scan_monitored_ips').select('*')` | `surfaceScan360Api.listMonitoredIps(...)` | ✅ Corretto |
| `supabase.from('surface_scan_monitored_ips').insert(payload)` | `surfaceScan360Api.createMonitoredIp(...)` | ✅ Corretto (metodo aggiunto da lui) |
| `supabase.from('organizations').select('flags')` | `tenantServicesApi.listByOrganization(...)` | ✅ Corretto (approccio diverso, funzionale) |
| `supabase.from('surface_scan_monitored_ips').delete().eq('id', id)` | `surfaceScan360Api.deleteMonitoredIp(...)` | ✅ Corretto |

Nel file `useSurfaceScanMonitoredIps.ts` **tutte e 4 le chiamate erano state migrate**. L'import di `supabase` era stato rimosso. Il file sembrava corretto.

### Perché ha rotto

Il problema **non era dentro `useSurfaceScanMonitoredIps.ts`**, ma nel **flusso a cascata della pagina `/surface-scan`**. Quando l'utente aggiunge un IP monitorato, il flusso tocca:

```
addRule() in useSurfaceScanMonitoredIps.ts        ← migrato ✅
  ↓ (auto_queue_scan)
  queueScopeRuleScan() → createJob()               ← già API ✅
  ↓ (auto_sync_darkrisk)  
  triggerDarkRiskScopeSync() → darkRiskApi         ← già API ✅
  ↓ (fetchRules)
  fetchRules() → listMonitoredIps()                ← migrato ✅
  ↓ (la pagina SurfaceScan360 ri-renderizza)
  SurfaceScanModuleCards.tsx fetchData()
    → supabase.from('surface_scan_monitored_ips')  ← **NON migrato ❌**
    → supabase.from('surface_scan_module_results') ← **NON migrato ❌**
    → supabase.from('surface_observations')        ← **NON migrato ❌**
    → supabase.from('surface_open_ports')          ← **NON migrato ❌**
  useSurfaceScanDiscoveredAssets → scope rules     ← **NON migrato ❌**
  useSurfaceScanFindings → scope rules             ← **NON migrato ❌**
  SurfaceScan360.tsx → surface_assets (reverse DNS) ← **NON migrato ❌**
```

Il commit di Stefano migrava **solo 1 hook su 4 con supabase ancora attivo**, e **1 metodo API su ~10 mancanti**. Le altre chiamate supabase nei file adiacenti sono rimaste — quando la pagina ri-renderizza dopo un addRule, i componenti/hook non migrati provano ancora a chiamare supabase direttamente e crashano perché:

1. Alcuni si aspettano dati che arrivavano dalla stessa tabella (`surface_scan_monitored_ips`) ma ora il flusso di refresh è gestito diversamente
2. Le race condition tra API e supabase causano stati inconsistenti
3. Il `createMonitoredIp` di Stefano usava l'API ma i consumer a valle (ModuleCards, DiscoveredAssets, Findings) leggevano ancora da supabase — desync immediato

### Quante call vanno migrate INSIEME

Per chiudere il gap senza rompere, vanno migrate **tutte le chiamate che toccano la stessa tabella nello stesso flusso utente**:

**Batch 1 — `surface_scan_monitored_ips` (regole IP, tabella condivisa da 4 consumer):**

- `useSurfaceScanMonitoredIps.ts` (#1, #2, #4) ← file di Stefano, già pronto il pattern
- `useSurfaceScanDiscoveredAssets.ts` (#5)
- `useSurfaceScanFindings.ts` (#6)
- `SurfaceScanModuleCards.tsx` (#17)

Questo batch richiede solo `listMonitoredIps` (già esistente) e `createMonitoredIp` (da riaggiungere, era in `2c81f26`). **Nessun nuovo endpoint backend, solo ripristinare il metodo API client**.

**Batch 2 — `organizations` flags (#3):**

- `useSurfaceScanMonitoredIps.ts` — può usare `tenantServicesApi.listByOrganization()` (pattern di Stefano) oppure un endpoint dedicato

**Batch 3 — tabelle `surface_scan_module_results` + `surface_observations` + `surface_open_ports`:**

- `SurfaceScanModuleCards.tsx` (#18, #19, #20)
- `getModuleResults` e `getObservations` già esistono
- Manca `getOpenPorts` (nuovo endpoint backend)

**Batch 4 — `surface_scan_ioc_fresh_*` (IOC Fresh List):**

- `useSurfaceScanIocFreshList.ts` (#7–#12)
- Richiede nuovi endpoint backend per CRUD completo

**Batch 5 — `surface_assets` (reverse DNS):**

- `SurfaceScan360.tsx` (#14, #15, #16)
- Richiede nuovo endpoint + polling al posto del Realtime

**Batch 6 — `surface_scan_ai_reports` (delete report):**

- `useSurfaceScanReportRepository.ts` (#13)
- Richiede `deleteAiReport` (nuovo endpoint)

---

## Tabella riepilogativa: Supabase call residue vs Endpoint backend

| # | File:Linea | Tabella Supabase | Operazione | Endpoint backend | Stato |
|---|---|---|---|---|---|
| 1 | `useSurfaceScanMonitoredIps.ts:120` | `surface_scan_monitored_ips` | SELECT * | `listMonitoredIps` | ✅ PRONTO |
| 2 | `useSurfaceScanMonitoredIps.ts:197` | `surface_scan_monitored_ips` | INSERT | `createMonitoredIp` | ⚠️ DA RIPRISTINARE (era in 2c81f26) |
| 3 | `useSurfaceScanMonitoredIps.ts:222` | `organizations` | SELECT flags | `tenantServicesApi.listByOrganization` o nuovo | ❌ DA CREARE |
| 4 | `useSurfaceScanMonitoredIps.ts:284` | `surface_scan_monitored_ips` | DELETE | `deleteMonitoredIp` | ✅ PRONTO |
| 5 | `useSurfaceScanDiscoveredAssets.ts:144` | `surface_scan_monitored_ips` | SELECT scope | `listMonitoredIps` | ✅ PRONTO |
| 6 | `useSurfaceScanFindings.ts:359` | `surface_scan_monitored_ips` | SELECT scope | `listMonitoredIps` | ✅ PRONTO |
| 7 | `useSurfaceScanIocFreshList.ts:121` | `surface_scan_ioc_fresh_config` | SELECT * | — | ❌ DA CREARE |
| 8 | `useSurfaceScanIocFreshList.ts:126` | `surface_scan_ioc_fresh_items` | SELECT * | — | ❌ DA CREARE |
| 9 | `useSurfaceScanIocFreshList.ts:187` | `surface_scan_ioc_fresh_config` | UPSERT | — | ❌ DA CREARE |
| 10 | `useSurfaceScanIocFreshList.ts:252` | `surface_scan_ioc_fresh_items` | INSERT | — | ❌ DA CREARE |
| 11 | `useSurfaceScanIocFreshList.ts:309` | `surface_scan_ioc_fresh_items` | DELETE | — | ❌ DA CREARE |
| 12 | `useSurfaceScanIocFreshList.ts:346` | `surface_scan_ioc_fresh_items` | UPDATE | — | ❌ DA CREARE |
| 13 | `useSurfaceScanReportRepository.ts:173` | `surface_scan_ai_reports` | DELETE | `deleteAiReport` | ❌ DA CREARE |
| 14 | `SurfaceScan360.tsx:396` | `surface_assets` | SELECT reverse_dns | `getReverseDnsAssets` | ❌ DA CREARE |
| 15 | `SurfaceScan360.tsx:427` | `surface_assets` | REALTIME channel | Polling (`refetchInterval`) | 🔄 PATTERN CHANGE |
| 16 | `SurfaceScan360.tsx:453` | `surface_assets` | removeChannel | N/A (rimosso con polling) | 🔄 PATTERN CHANGE |
| 17 | `SurfaceScanModuleCards.tsx:503` | `surface_scan_monitored_ips` | SELECT scope | `listMonitoredIps` | ✅ PRONTO |
| 18 | `SurfaceScanModuleCards.tsx:485→658` | `surface_scan_module_results` | SELECT by job_ids | `getModuleResults` | ✅ PRONTO |
| 19 | `SurfaceScanModuleCards.tsx:485→664` | `surface_observations` | SELECT by job_ids | `getObservations` | ✅ PRONTO |
| 20 | `SurfaceScanModuleCards.tsx:485→670` | `surface_open_ports` | SELECT by job_ids | `getOpenPorts` | ❌ DA CREARE |

### Riepilogo conteggio

| Categoria | Count |
|---|---|
| **Totale supabase call residue** | **20** |
| Già coperte da endpoint backend pronti | 8 (#1, #4, #5, #6, #17, #18, #19 + 1) |
| Metodo API da ripristinare (esisteva in `2c81f26`) | 1 (#2 — `createMonitoredIp`) |
| Da creare endpoint backend + metodo API | 9 (#3, #7–#12, #13, #14, #20) |
| Pattern change (Realtime → polling) | 2 (#15, #16) |

---

## Start Here

Il primo file da aprire per un dev che affronta questa migrazione:

1. **`src/hooks/useSurfaceScanMonitoredIps.ts`** — è il file che Stefano aveva (quasi) completato. Contiene il pattern corretto nelle 4 call migrate + l'unica call rimasta (`organizations` flags). È il punto di partenza perché il suo `addRule()` triggera il flusso a cascata che rompe gli altri consumer.
2. Subito dopo: **`src/lib/api/surface-scan360.ts`** — per riaggiungere `createMonitoredIp` (basta copiare da `git show 2c81f26:src/lib/api/surface-scan360.ts`).
3. Poi: **`src/components/surface-scan/SurfaceScanModuleCards.tsx`** — è il consumer più pesante (4 supabase call, di cui 3 già coperte da API). È il secondo punto di rottura dopo `useSurfaceScanMonitoredIps`.
