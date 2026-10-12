# Gestione Documentale ISO – HiCompliance

Documento di architettura e funzionamento del modulo **Documenti** (pagina `/documents`), con le regole per una gestione documentale conforme a ISO 9001:2015 §7.5 (Informazioni documentate) e ISO/IEC 27001:2022 §7.5 + Annex A 5.33/5.37.

> Legenda stato: **[ATTIVO]** già presente nel codice · **[DA FARE]** richiesto per piena conformità ISO.

---

## 1. Obiettivi

- Un archivio documentale **separato per cliente** (multi-tenant).
- Ogni documento ha **codice, revisione, stato, classificazione, responsabili** (redatto / verificato / approvato).
- Ogni operazione è **datata e tracciata** (timestamp + utente).
- Le revisioni superate restano consultabili ma marcate **Obsoleto**.
- I documenti generati dalla piattaforma (IRP, Playbook, Report) finiscono automaticamente in archivio.

---

## 2. Architettura

```text
 Browser (React)                          Backend                         Archivio
 ───────────────                          ───────                         ────────
 /documents (Documents.tsx)
   ├─ Upload + metadati  ──POST multipart──►  /companies/{id}/documents ──►  file + record
   ├─ Elenco / filtri    ──GET────────────►  /companies/{id}/documents
   ├─ Modifica metadati  ──PUT────────────►  /companies/{id}/documents/{doc}
   ├─ Download/Anteprima ──GET────────────►  /companies/{id}/documents/{doc}/download
   └─ Eliminazione       ──DELETE─────────►  /companies/{id}/documents/{doc}

 Generatori interni (IRP DOCX, Playbook DOCX, Report PDF)
   └─ useDocumentSave.saveToDocuments()  ──► stesso endpoint di upload
```

| Componente | Ruolo |
|---|---|
| `src/pages/Documents.tsx` | Pagina archivio: upload, elenco, filtri, anteprima, download, elimina |
| `src/components/documents/DocumentMetadataDialog.tsx` | Scheda metadati ISO (codice, revisione, stato, responsabili) |
| `src/components/documents/DocumentCodeGenerator.ts` | Prefissi codice, formato revisione, stati, classificazioni |
| `src/components/documents/ContactPicker.tsx` | Scelta dei responsabili dalla Rubrica Contatti |
| `src/components/documents/DocumentSearchBar.tsx` | Ricerca e filtri |
| `src/lib/api/documents.ts` | Client API (list, get, create, createWithFile, update, delete, download) |
| `src/hooks/useDocumentSave.ts` | Salvataggio automatico dei documenti generati |

Header inviato a ogni chiamata: `Authorization: Bearer <token>` e `X-Group-Id: <id cliente>`.

> Nota: sul ramo PROTOTIPO le API documenti puntano ancora al backend HiConsole (Laravel). Se il backend non risponde, l'archivio risulta vuoto. Migrazione su database/storage Supabase: **[DA FARE]** (vedi §10).

---

## 3. Separazione per cliente

- Ogni documento appartiene a **un solo cliente** (`tenant_id` + `group_id`).
- Il cliente attivo è quello scelto in **Selezione Cliente** (`ClientContext` / `useClientOrganization`); tutte le chiamate usano il suo ID.
- **Utente cliente**: vede solo i documenti del proprio cliente.
- **Super admin / Sales**: cambiano cliente dal selettore e vedono l'archivio di quel cliente; mai un archivio misto.
- I file devono essere salvati in percorsi separati per cliente: `documents/{tenant_id}/{document_code}/Rev{NN}/{file}`.
- Regola di backend obbligatoria: ogni lettura/scrittura verifica che l'utente abbia accesso al `tenant_id` (equivalente RLS su `organization_id`).

---

## 4. Modello dati del documento

| Campo | Tipo | Obbligatorio | Note |
|---|---|---|---|
| `id` | uuid | sì | |
| `tenant_id`, `group_id` | uuid | sì | Cliente proprietario |
| `name` | testo | sì | Titolo del documento |
| `document_code` | testo | sì | Es. `PG-001` (§5) |
| `revision` | intero | sì | Parte da 1 |
| `revision_date` | data | sì | Data di emissione della revisione |
| `status` | enum | sì | Bozza, In Revisione, Approvato, Obsoleto |
| `confidentiality` | enum | sì | Pubblico, Interno, Riservato, Confidenziale |
| `category` | enum | sì | §5 |
| `description` | testo | no | Scopo / campo di applicazione |
| `tags` | lista | no | Ricerca |
| `drafted_by` | lista contatti | sì | **Redatto da** |
| `prepared_by` | lista contatti | no | Preparato da (se diverso dal redattore) |
| `reviewed_by` | lista contatti | sì per Approvato | **Verificato da** |
| `approved_by` | lista contatti | sì per Approvato | **Approvato da** |
| `file_size`, `file_type` | | sì | |
| `uploaded_by` | utente | sì | Chi ha caricato |
| `created_at`, `updated_at` | timestamp UTC | sì | Automatici |
| `file_hash` (SHA-256) | testo | **[DA FARE]** | Prova di integrità |
| `drafted_at`, `reviewed_at`, `approved_at` | timestamp | **[DA FARE]** | Data di ogni firma |
| `next_review_date` | data | **[DA FARE]** | Riesame periodico |
| `retention_until` | data | **[DA FARE]** | Conservazione |
| `supersedes_id` | uuid | **[DA FARE]** | Revisione precedente |
| `change_summary` | testo | **[DA FARE]** | Motivo della modifica |

---

## 5. Codifica e categorie [ATTIVO]

Formato: `PREFISSO-NNN_RevNN` (es. `ISO-004_Rev02`).

| Categoria | Prefisso |
|---|---|
| Piano Generale | PG |
| Checklist / OPL / SOP | SOP |
| Template | TPL |
| Processo | PRC |
| Legal | LEG |
| Audit | AUD |
| ISO & Audit | ISO |
| NIS2 | NIS |
| Tecnico | TEC |
| Varie | VAR |

Regole:
- Il numero progressivo è **per cliente e per categoria** e non si riusa mai, nemmeno dopo l'eliminazione.
- Il codice resta uguale tra le revisioni; cambia solo `RevNN`.
- Nome file in download: `{codice}_Rev{NN}_{nome}`.

---

## 6. Come si fa l'upload

1. Selezionare il cliente.
2. Aprire **Documenti** e scegliere il file (trascina o seleziona).
3. Compilare: nome, categoria, stato (di default **Bozza**), classificazione (di default **Interno**), descrizione, tag.
4. Confermare: il file viene inviato in `multipart/form-data` all'endpoint del cliente.
5. Il backend assegna `id`, codice, `revision = 1`, `uploaded_by`, `created_at`.
6. Aprire **Metadati** per indicare Redatto / Verificato / Approvato dalla Rubrica Contatti.

Upload automatico: IRP, Playbook completati al 100% e report vengono salvati in archivio con la categoria corretta tramite `useDocumentSave`.

Controlli consigliati **[DA FARE]**: dimensione massima 20 MB; formati ammessi PDF, DOCX, XLSX, PPTX, PNG, JPG, TXT; blocco di eseguibili; antivirus lato server; calcolo SHA-256.

---

## 7. Timestamp e tracciabilità

**Già presenti [ATTIVO]:** `created_at`, `updated_at`, `revision_date`, `uploaded_by`; mostrati in elenco come dimensione • data caricamento • data revisione.

**Da aggiungere [DA FARE]:**
- Tutti i timestamp salvati **dal server in UTC** (mai dal browser), mostrati in ora italiana.
- Data e utente di ogni passaggio: redazione, verifica, approvazione, messa in obsoleto.
- **Registro eventi** non modificabile (`document_audit_log`): chi, cosa, quando, valore prima/dopo, motivo. Eventi: caricato, scaricato, metadati modificati, stato cambiato, nuova revisione, eliminato.
- **Hash SHA-256** del file al caricamento; ricontrollato al download.
- Opzionale per valore legale: **marca temporale qualificata** (eIDAS, RFC 3161) e firma digitale PAdES sul PDF approvato.

---

## 8. Ciclo di vita ISO

```text
 Bozza ──► In Revisione ──► Approvato ──► (nuova revisione) ──► Obsoleto
   ▲            │
   └─ richiesta modifiche
```

| Passaggio | Chi | Cosa viene registrato |
|---|---|---|
| Bozza | Redattore | Redatto da + data |
| In Revisione | Redattore invia | Data invio |
| Verifica | Verificatore | Verificato da + data + esito/commento |
| Approvazione | Approvatore | Approvato da + data; revisione bloccata |
| Nuova revisione | Redattore | Copia con Rev+1, motivo modifica, torna in Bozza |
| Obsoleto | Automatico | Alla approvazione della revisione successiva |

Regole:
- **Separazione dei ruoli:** chi redige non può approvare la stessa revisione.
- Un documento **Approvato non si modifica**: si crea una nuova revisione.
- Una sola revisione **Approvata** valida per codice; le precedenti diventano Obsolete e restano consultabili (con dicitura "OBSOLETO – non usare").
- Le bozze in PDF riportano la filigrana **BOZZA** (come nel modulo BIA).

Stato attuale: stati e responsabili sono campi liberi modificabili dalla scheda metadati; i blocchi di workflow sono **[DA FARE]**.

---

## 9. Requisiti ISO coperti

| Requisito | Come si soddisfa | Stato |
|---|---|---|
| Identificazione e descrizione (titolo, data, autore, codice) | Codice, nome, revisione, responsabili | ATTIVO |
| Formato e supporto | Tipo file registrato | ATTIVO |
| Riesame e approvazione | Verificato / Approvato da | Campi ATTIVI, workflow DA FARE |
| Distribuzione e accesso | Separazione per cliente + classificazione | ATTIVO (permessi per classificazione DA FARE) |
| Conservazione e leggibilità | Archivio centrale, download | ATTIVO |
| Controllo delle modifiche | Revisioni, motivo modifica, storico | Parziale |
| Conservazione ed eliminazione | `retention_until`, eliminazione logica | DA FARE |
| Documenti di origine esterna | Categoria Legal / tag "esterno" | Parziale |
| Prevenzione uso di documenti obsoleti | Stato Obsoleto automatico | DA FARE |
| Integrità (27001 A 5.33) | Hash SHA-256, log immutabile | DA FARE |

Classificazione e accesso proposti:

| Livello | Chi vede |
|---|---|
| Pubblico | Tutti gli utenti del cliente, condivisibile all'esterno |
| Interno | Tutti gli utenti del cliente |
| Riservato | Utenti con permesso Documenti "modifica" + super admin |
| Confidenziale | Solo responsabili indicati + super admin; download registrato |

---

## 10. Interventi per completare la conformità

1. Spostare archivio e file su database e storage Supabase con regole per cliente (coerente col resto del ramo PROTOTIPO).
2. Aggiungere i campi mancanti del §4 e il registro eventi immutabile.
3. Workflow con blocchi: separazione ruoli, immutabilità dell'approvato, obsoleto automatico.
4. Hash SHA-256 e controlli di upload.
5. Promemoria di riesame (`next_review_date`, default 12 mesi) e scadenza di conservazione.
6. Permessi per classificazione.
7. Elenco documenti esportabile (Excel/PDF) per audit: codice, titolo, revisione, stato, data, redatto/verificato/approvato.
8. Pagina di copertina automatica sui PDF approvati con tabella revisioni e firme.

## 11. Criteri di accettazione

- Un utente del cliente A non vede, scarica né modifica documenti del cliente B.
- Ogni documento caricato ha codice univoco, Rev01, data e autore registrati dal server.
- Non si può approvare senza Verificato da e Approvato da; il redattore non può approvare.
- Un documento Approvato non è modificabile; la nuova revisione rende Obsoleta la precedente.
- Ogni azione compare nel registro con utente e ora.
- L'hash del file scaricato coincide con quello registrato.
- L'elenco per audit è esportabile e coincide con l'archivio.
