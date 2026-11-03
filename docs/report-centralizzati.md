# Report centralizzati (Generale → Report)

Pagina `/reports` (`src/pages/Reports.tsx`), scheda **Report moduli** (`src/components/reports/ModuleReports.tsx`) + scheda Correlazioni HiLog.

## Fonte dati
Tutti i report sono righe di `incident_documents` con `is_generated = true`, create da trigger DB tramite `doc_register_generated` (idempotente su `source_type, source_id`):

| Modulo | source_type | Tabella origine | Trigger |
|---|---|---|---|
| HiCompliance Assessment | compliance | assessment_snapshots | doc_from_assessment |
| SurfaceScan360 | surfacescan | surface_scan_ai_reports | doc_from_surface |
| DarkRisk360 | darkrisk | darkrisk_report_snapshots (tier standard) | doc_from_darkrisk |
| DarkRisk360 Esteso | darkrisk_extended | darkrisk_report_snapshots (tier extended) | doc_from_darkrisk |
| IRP | irp | irp_documents (con organization_id) | doc_from_irp (nuovo, con backfill) |

I report compaiono quindi anche in Gestione Documenti.

## Accesso
- RLS esistente su `incident_documents` (`doc_can_access_org`): utenti cliente solo la propria org; super admin/sales il cliente selezionato.
- I moduli non attivi per il cliente sono nascosti via `useModuleAccess().isRouteAllowed(route)` (regola unica `moduleServiceMap.ts`).

## Azioni
- **Apri**: naviga alla pagina del modulo.
- **Scarica**: `documentsApi.download` → file in storage, PDF DarkRisk (`darkrisk-reports`) o PDF generato da `content_json`.

## Da fare per produzione
- IRP: oggi una riga per versione inserita; gli aggiornamenti della stessa versione non creano nuovo report.
- Link "Apri" al report specifico (deep link) invece che alla pagina modulo.
