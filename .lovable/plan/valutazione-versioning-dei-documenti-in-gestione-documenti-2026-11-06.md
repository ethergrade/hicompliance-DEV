# Valutazione: versioning dei documenti in Gestione Documenti

## Richiesta (Voice of the Customer)

Il cliente vuole un vero versionamento dei documenti nella gestione documentale.

## La piattaforma oggi: cosa c'è già

La base ISO c'è, ed è il motivo per cui il lavoro può essere **puramente additivo**:

- Ogni documento ha già **codice + revisione** (`PG-001_Rev01`), **data revisione**, **stato** (Bozza, Emesso, …) con filtro e colori dedicati.
- Esistono già i campi ruolo tipici del controllo documentale: **redatto da, predisposto da, revisionato da, approvato da** (collegati alla Rubrica contatti).
- La copia di un documento riparte correttamente da Rev01/Bozza con codice nuovo.

## Cosa manca per un vero versioning

1. **Storico versioni**: oggi il numero di revisione è un campo editabile a mano; cambiarlo sovrascrive lo stesso record e la versione precedente **è persa** (file compreso).
2. **Azione "Nuova revisione"**: non esiste un modo per caricare una nuova versione del file sotto lo stesso codice documento, con avanzamento automatico Rev01 → Rev02.
3. **Versioni precedenti scaricabili**: non si può recuperare né scaricare una revisione passata.
4. **Workflow di stato**: lo stato è un campo libero; manca un percorso guidato Bozza → In approvazione → Emesso (con chi ha approvato e quando).
5. **Audit**: nessuna traccia di chi ha creato ogni revisione.

## Valutazione

La piattaforma **è pronta come base** (metadati ISO già presenti, nessuna migrazione distruttiva necessaria) ma **non è ancora pronta per il versioning vero**: serve aggiungere storico e workflow. Intervento additivo, nessuna modifica al comportamento attuale di caricamento, sposta/copia, tag e report.

## Piano proposto (additivo)

### Fase 1 — Storico versioni

- Nuova tabella `document_versions`: una riga per revisione (document_id, revision, file_path, stato, note di revisione, created_by, created_at). RLS e GRANT come le altre tabelle documentali.
- Azione **"Carica nuova revisione"** su ogni documento: carica il nuovo file, archivia la versione corrente in `document_versions`, aggiorna il documento a Rev+1 con data e stato Bozza.
- Alla creazione di un documento, la Rev01 viene registrata automaticamente nello storico.
- Vista **"Storico versioni"** per documento: elenco delle revisioni con data, autore, stato e note; download di ogni versione passata.

### Fase 2 — Workflow di stato

- Transizioni guidate: **Bozza → In approvazione → Emesso** (con possibilità di tornare indietro solo creando una nuova revisione, come da prassi ISO).
- All'emissione: registrazione automatica di chi approva (campo `approved_by` già esistente) e data.
- Il campo revisione nel dialog metadati diventa di sola lettura: la revisione avanza solo tramite "Carica nuova revisione" (niente più modifiche manuali che perdono lo storico).

### Cosa NON cambia

- `incident_documents` resta la "versione corrente": Report moduli, download, sposta/copia, tag, filtri e permessi continuano a leggere da lì senza modifiche.
- I documenti già caricati restano validi: il loro storico partirà dalla revisione attuale.

## Lavori tecnici (per il DEV)

- Migrazione: tabella `document_versions` con GRANT + RLS (pattern `doc_can_access_org`), indice su `document_id`.
- `src/lib/api/documents.ts`: `documentsApi.createRevision(docId, file, notes)`, `documentsApi.listVersions(docId)`, `documentsApi.downloadVersion(versionId)`, `documentsApi.setStatus(docId, status)` con transizioni validate.
- UI: pulsante "Nuova revisione" e dialog storico in `src/pages/Documents.tsx`; campo revisione in sola lettura in `DocumentMetadataDialog`.
- Test: caricamento Rev02 con download della Rev01, transizioni di stato consentite/negate, verifica che Report moduli continui a mostrare la versione corrente.

## Domande aperte per il cliente

1. Gli stati desiderati sono Bozza / In approvazione / Emesso, o ne servono altri (es. Obsoleto)?
2. Le versioni obsolete devono restare scaricabili da tutti gli utenti del cliente, o solo da Super Admin/Sales?
3. Serve l'obbligo di nota di revisione ("cosa è cambiato") a ogni nuova versione? (Proposta: sì, è prassi ISO e costa poco.)
