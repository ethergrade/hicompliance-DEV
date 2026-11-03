# Modulo "Report" in Generale

## Obiettivo
Una nuova voce **Generale → Report** che raccoglie in un solo posto i report prodotti da HiCompliance Assessment, SurfaceScan360, DarkRisk, DarkRisk Esteso e IRP, separati per cliente.

## Cosa vede l'utente
- Riepilogo in alto: numero di report per modulo e data dell'ultimo report.
- Filtri: modulo, periodo, ricerca per nome.
- Elenco report: nome, modulo, data, azioni **Apri** (porta alla pagina del modulo) e **Scarica** (quando c'è un file).
- Utenti cliente: vedono solo i report del proprio cliente. Super Admin e Sales: quelli del cliente selezionato.
- I moduli non attivi per il cliente non compaiono (stessa regola della barra laterale).

## Fonti dei report
- Assessment, SurfaceScan360, DarkRisk e DarkRisk Esteso: già salvati automaticamente nell'archivio documenti, si leggono da lì.
- IRP: oggi non viene salvato nell'archivio. Aggiungo la stessa registrazione automatica per i documenti IRP, più il recupero di quelli già esistenti.

## Dettagli tecnici
- Nuova pagina `src/pages/Reports.tsx`, rotta `/reports`, voce in `AppSidebar` sezione Generale; visibilità in `moduleServiceMap.ts` (sempre visibile, con filtro per moduli attivi via `useModuleAccess`).
- Lettura da `incident_documents` filtrata per `organization_id` e sorgente (`compliance`, `surfacescan`, `darkrisk`, `darkrisk_extended`, `irp`); RLS esistente `doc_can_access_org`.
- Migrazione: trigger `trg_doc_from_irp` su `irp_documents` che chiama `doc_register_generated` + backfill dei record esistenti.
- Doc per DEV: `docs/report-centralizzati.md`.
