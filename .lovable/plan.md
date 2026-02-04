
# Piano: Datestamp Playbook Completati e Sezione "Eventi Compliance"

## Obiettivo
1. Aggiungere un **datestamp** quando l'utente completa/compila un playbook (salvato automaticamente)
2. Creare una nuova sezione **"Eventi Compliance"** nella pagina Remediation che mostra lo storico dei playbook compilati con data di completamento

---

## Analisi Corrente

### Come Funzionano i Playbook Oggi
- I playbook sono salvati in **localStorage** con chiave `playbook_progress_{id}`
- Il salvataggio avviene con **debounce 500ms** tramite `usePlaybookAutoSave`
- I dati salvati includono tutto il playbook (owner, sections, checklist items)
- **Manca** un campo per tracciare la data di completamento

### Struttura Remediation
La pagina ha 4 tab:
1. Panoramica Remediation
2. GANTT Operativo  
3. Azioni Eliminate
4. Metriche & KPI

---

## Soluzione Proposta

### 1. Estensione Tipo Playbook

Aggiungere nuovi campi al tipo `Playbook`:

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `started_at` | string (ISO date) | Data primo salvataggio |
| `completed_at` | string (ISO date) | Data raggiungimento 100% |
| `last_updated_at` | string (ISO date) | Ultimo aggiornamento |

### 2. Database: Nuova Tabella `playbook_completions`

Per persistere su Supabase (oltre a localStorage):

```text
+---------------------+-------------+----------------------------------+
| Campo               | Tipo        | Descrizione                      |
+---------------------+-------------+----------------------------------+
| id                  | UUID        | Primary key                      |
| organization_id     | UUID        | FK a organizations               |
| user_id             | UUID        | FK a users                       |
| playbook_id         | TEXT        | ID playbook (es. phishing-attack)|
| playbook_title      | TEXT        | Titolo leggibile                 |
| playbook_category   | TEXT        | Categoria (es. Social Engineering)|
| playbook_severity   | TEXT        | Severity (Bassa/Media/Alta/Critica)|
| progress_percentage | INTEGER     | Percentuale completamento        |
| data                | JSONB       | Snapshot completo del playbook   |
| started_at          | TIMESTAMPTZ | Data inizio compilazione         |
| completed_at        | TIMESTAMPTZ | Data completamento (100%)        |
| created_at          | TIMESTAMPTZ | Timestamp creazione record       |
| updated_at          | TIMESTAMPTZ | Timestamp ultimo aggiornamento   |
+---------------------+-------------+----------------------------------+
```

### 3. Logica Datestamp

Nel hook `usePlaybookAutoSave`:

1. **Prima compilazione**: Setta `started_at` se non presente
2. **Ogni salvataggio**: Aggiorna `last_updated_at`
3. **Raggiungimento 100%**: Setta `completed_at` (una sola volta)
4. **Sync su Supabase**: Upsert record in `playbook_completions`

### 4. Nuova Tab "Eventi Compliance"

Aggiungere quinta tab in Remediation:

```text
+----------------------------------------------------------+
|  EVENTI COMPLIANCE                                        |
+----------------------------------------------------------+
|                                                           |
|  Filtri: [Tutti] [Completati] [In Corso]  [Cerca...]     |
|                                                           |
|  +-- STORICO PLAYBOOK ------------------------------------+
|  | Data         | Playbook            | Stato    | Azioni |
|  |--------------|---------------------|----------|--------|
|  | 04/02/2026   | Phishing Attack     | 100% OK  | [>][D] |
|  | 03/02/2026   | Ransomware          | 85% WIP  | [>][D] |
|  | 01/02/2026   | Data Exfiltration   | 100% OK  | [>][D] |
|  +--------------------------------------------------------+
|                                                           |
|  Legenda:                                                 |
|  - OK = Completato con data certificata                   |
|  - WIP = Work in Progress                                 |
|  - [>] = Riapri playbook                                  |
|  - [D] = Esporta DOCX con datestamp                       |
|                                                           |
+----------------------------------------------------------+
```

### 5. Salvataggio Automatico in Gestione Documenti

Quando un playbook raggiunge il 100%:
1. Genera automaticamente il DOCX
2. Salva su Supabase Storage
3. Crea record in `incident_documents` con:
   - Nome: `Playbook_{titolo}_{YYYY-MM-DD}.docx`
   - Categoria: "Checklist / OPL / SOP"
   - Data: timestamp completamento

---

## Flusso Implementazione

### Fase 1: Database
1. Creare migrazione per tabella `playbook_completions`
2. Aggiungere RLS policies per organization_id

### Fase 2: Tipi e Logica
1. Estendere `PlaybookProgress` in `src/types/playbook.ts`
2. Creare hook `usePlaybookCompletions` per CRUD su Supabase
3. Modificare `usePlaybookAutoSave` per:
   - Tracciare date (started/updated/completed)
   - Sync con database
   - Trigger export automatico al 100%

### Fase 3: UI
1. Creare componente `ComplianceEventsTab.tsx`
2. Modificare `Remediation.tsx`:
   - Aggiungere quinta tab "Eventi Compliance"
   - Integrare nuovo componente
3. Aggiungere badge/indicatore visivo per playbook completati in IncidentResponse

---

## File da Creare

| File | Descrizione |
|------|-------------|
| `src/hooks/usePlaybookCompletions.ts` | Hook CRUD per playbook_completions |
| `src/components/remediation/ComplianceEventsTab.tsx` | Componente tab Eventi Compliance |

## File da Modificare

| File | Modifica |
|------|----------|
| `src/types/playbook.ts` | Aggiungere campi date a PlaybookProgress |
| `src/hooks/usePlaybookAutoSave.ts` | Logica datestamp e sync Supabase |
| `src/pages/Remediation.tsx` | Nuova tab "Eventi Compliance" |
| `src/components/irp/PlaybookViewer.tsx` | Mostrare date nel viewer |

---

## Vantaggi

1. **Tracciabilita' Compliance**: Ogni playbook ha data certificata di completamento
2. **Audit Trail**: Storico completo accessibile da Remediation
3. **Documentazione Automatica**: DOCX generato e archiviato automaticamente
4. **Persistenza**: Dati salvati su database (non solo localStorage)
5. **Visibilita' Cross-modulo**: Link tra IRP e Remediation

---

## Dettagli Tecnici

### Calcolo Completamento
Il playbook e' considerato "completato" quando:
- Tutti i campi owner required sono compilati
- Almeno l'80% delle checklist items sono spuntate
- Oppure: progress_percentage = 100%

### Formato Date
- Tutte le date in formato ISO 8601 (es. `2026-02-04T10:30:00Z`)
- Visualizzazione in formato italiano (es. `04/02/2026 10:30`)

### Export DOCX Automatico
Al raggiungimento del 100%:
1. Genera DOCX con `generatePlaybookDocx`
2. Converte in Blob
3. Salva tramite `useDocumentSave` con categoria "Checklist / OPL / SOP"
