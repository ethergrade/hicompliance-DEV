

## Gestione Documenti ISO 9001/27001 Compliant

### Obiettivo
Trasformare la pagina `/documents` in un sistema di gestione documentale conforme ISO 9001 (qualità) e ISO 27001 (sicurezza informazioni), con metadata strutturati, naming conventions, ricerca avanzata e workflow di approvazione.

### 1. Migrazione Database — nuove colonne su `incident_documents`

Aggiungere tramite migration SQL:

```text
- document_code    TEXT        — Codice univoco (es. "PG-IRP-001")
- revision         INTEGER     — Numero revisione (default 1)
- revision_date    TIMESTAMPTZ — Data ultima revisione
- status           TEXT        — "Bozza", "In Revisione", "Approvato", "Obsoleto"
- drafted_by       UUID[]      — Array di ID da contact_directory (Redatto da)
- prepared_by      UUID[]      — Array di ID da contact_directory (Elaborato da)
- reviewed_by      UUID[]      — Array di ID da contact_directory (Revisionato da)
- approved_by      UUID[]      — Array di ID da contact_directory (Approvato da)
- description      TEXT        — Descrizione/scopo del documento
- tags             TEXT[]      — Tag per ricerca avanzata
- confidentiality  TEXT        — "Pubblico", "Interno", "Riservato", "Confidenziale"
```

### 2. Naming Convention ISO (Prefisso/Suffisso)

Auto-generazione del codice documento con formato:
```text
[PREFISSO_CATEGORIA]-[CODICE]-[REV]
Esempio: PG-IRP-001_Rev03
```

Mapping categorie → prefissi:
- Piano Generale → PG
- Checklist / OPL / SOP → SOP
- Template → TPL
- Processo → PRC
- Legal → LEG
- ISO & Audit → ISO
- NIS2 → NIS
- Tecnico → TEC
- Varie → VAR

Il codice viene generato automaticamente all'upload e incrementato per revisione.

### 3. Form Upload Esteso

Sostituire il form attuale con un form completo che include:
- File + Nome + Categoria (esistenti)
- **Codice Documento** (auto-generato, editabile)
- **Revisione** (auto-incrementata)
- **Classificazione** (Pubblico/Interno/Riservato/Confidenziale)
- **Descrizione**
- **Redatto da** — picker multiplo dalla `contact_directory`
- **Elaborato da** — picker multiplo dalla `contact_directory`
- **Revisionato da** — picker multiplo dalla `contact_directory`
- **Approvato da** — picker multiplo dalla `contact_directory`
- **Tag** — input con chip/badge per ricerca

### 4. Ricerca Avanzata (Power Query)

Aggiungere sopra la lista documenti una barra di ricerca con filtri combinabili:
- **Testo libero** (cerca in nome, descrizione, tag, codice)
- **Categoria** (dropdown)
- **Stato** (Bozza/In Revisione/Approvato/Obsoleto)
- **Classificazione** (livello riservatezza)
- **Range date** (periodo upload/revisione)
- **Redatto/Elaborato/Revisionato da** (filtro per persona)
- Possibilità di combinare tutti i filtri contemporaneamente

### 5. Lista Documenti Aggiornata

Ogni riga mostra:
- Codice documento + Nome
- Revisione (Rev.XX)
- Badge stato (colore diverso per stato)
- Badge classificazione
- Nomi di chi ha redatto/elaborato/revisionato
- Data upload e ultima revisione
- Azioni: modifica metadata, sposta, scarica, elimina

### 6. Dialog Dettaglio/Modifica Metadata

Dialog dedicato per visualizzare e modificare tutti i campi ISO del documento (stato, revisione, responsabili, classificazione, tag).

### Dettagli tecnici

**File da creare:**
- `supabase/migrations/XXX_add_iso_document_fields.sql` — migrazione DB
- `src/components/documents/DocumentUploadForm.tsx` — form upload esteso
- `src/components/documents/DocumentSearchBar.tsx` — ricerca avanzata
- `src/components/documents/DocumentMetadataDialog.tsx` — dialog modifica metadata
- `src/components/documents/ContactPicker.tsx` — picker contatti dalla rubrica
- `src/components/documents/DocumentCodeGenerator.ts` — logica generazione codice

**File da modificare:**
- `src/pages/Documents.tsx` — refactor completo con nuovi componenti
- `src/integrations/supabase/types.ts` — rigenerato automaticamente dopo migrazione

**Dipendenze esistenti riutilizzate:**
- `useContactDirectory` hook per il picker contatti
- `contact_directory` table per i responsabili
- UI components esistenti (Badge, Select, Dialog, Input)

