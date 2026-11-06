# Assessment: import da Excel e score esterni

Documento per il DEV. Richiesta origine: Voice of the Customer — "valutare come e se è possibile modificare gli score/i report in base agli assessment già prodotti dal cliente e uploadati sulla piattaforma".

## Principio guida

La logica di scoring esistente **non è stata toccata**. Tutto il flusso è additivo: i dati importati entrano nelle stesse tabelle lette da score, radar, snapshot, Gap Analysis e report PDF, quindi tutto il resto della piattaforma continua a funzionare identico.

## Fase 1 — Import assessment da Excel

### Flusso utente

1. Pagina **Assessment** → pulsante **Importa Excel** (visibile solo a Super Admin e Sales, e mai a questionario confermato).
2. **Scarica template**: genera `template-assessment.xlsx` con una riga per domanda: `ID | Categoria | Domanda | Priorità | Stato` (colonna Stato vuota, da compilare).
3. **Carica file compilato** → anteprima di validazione riga per riga:
   - verde: riga valida, verrà importata;
   - grigio: stato vuoto, riga saltata (la domanda resta invariata → import parziale consentito);
   - rosso: errore (ID non riconosciuto o stato non valido), riga esclusa.
4. **Conferma** → upsert su `assessment_responses` (`onConflict: organization_id,question_id`) con `source = 'import'`.

### Stati accettati nella colonna "Stato"

`completato`, `pianificato_in_corso` (anche "pianificato in corso", "pianificato/in corso"), `non_iniziato` (anche "non iniziato"), `non_applicabile` (anche "non applicabile", "n/a"). Sono accettati anche i valori enum del DB (`completed`, `planned_in_progress`, `not_started`, `not_applicable`). Il confronto è case-insensitive.

### Tracciabilità

- Colonna nuova `assessment_responses.source` (`text`, default `'manual'`): i dati esistenti restano `'manual'`, quelli importati sono marcati `'import'`.
- La pagina Assessment mostra un badge "N risposte importate da file" accanto all'indicatore di salvataggio quando almeno una risposta è importata.

### File

- `src/components/assessment/ImportAssessmentDialog.tsx` — template, parsing (SheetJS `xlsx`, stessa libreria degli export HiLog), validazione, upsert.
- `src/pages/Assessment.tsx` — pulsante, badge, stato `responsesReloadKey` per ricaricare le risposte dopo l'import.

## Fase 2 — Score esterni dichiarati

Per gli assessment esterni che hanno un **proprio punteggio** (es. audit ISO del cliente) invece delle singole risposte.

### Tabella `assessment_external_scores`

| Colonna | Note |
|---|---|
| `organization_id` | FK organizations, cascade |
| `category_name` | nome categoria dell'assessment (stesso naming del catalogo) |
| `score` | 0-100, CHECK di range |
| `document_id` | FK opzionale a `incident_documents` (evidenza in Gestione Documenti), SET NULL |
| `assessment_date` | data dell'assessment esterno |
| `notes` | note libere |
| `created_by` | utente che ha registrato lo score |

RLS: lettura per tutti gli utenti dell'organizzazione (`doc_can_access_org`); scrittura solo Super Admin e Sales (`can_manage_all_organizations`).

### UI

- Sezione **"Score da assessment esterni"** nella pagina Assessment, sotto il banner del profilo.
- Tabella con score calcolato e score esterno **affiancati** per categoria: lo score esterno non sostituisce mai quello calcolato, che resta l'unica fonte per trend, radar e Gap Analysis.
- Super Admin e Sales possono aggiungere/eliminare score; l'utente cliente li vede in sola lettura.
- File: `src/components/assessment/ExternalScoresSection.tsx`.

## Cosa NON è cambiato

- `src/lib/assessment/scoring.ts`, `calculateCategoryScore`, snapshot, Gap Analysis, report PDF: invariati.
- RLS esistenti: invariate.
- Dati preesistenti: invariati (`source='manual'` di default).

## Test manuali consigliati

1. Scaricare il template, compilare 5 righe con stati validi + 1 con stato errato + 1 vuota → verificare anteprima (5 verdi, 1 rossa, 1 grigia) e import parziale.
2. Dopo l'import: badge "risposte importate" visibile, score ricalcolato, snapshot creabile come prima.
3. Importare due volte lo stesso file → nessun duplicato (upsert su organization_id+question_id).
4. Aggiungere uno score esterno come Super Admin → visibile affiancato al calcolato; come utente cliente → sola lettura, nessun pulsante di modifica.
5. A questionario confermato → pulsante "Importa Excel" nascosto.

## TODO produzione

- Nei PDF di report (generatori client-side jsPDF) valutare un'indicazione "include dati importati da file del cliente": oggi l'indicazione è solo nella pagina (badge). I generatori leggono le sole risposte, non la colonna `source`.
- Se il cliente chiede che lo score esterno **sostituisca** quello calcolato in alcuni report: nuova decisione di prodotto, oggi volutamente esclusa.
