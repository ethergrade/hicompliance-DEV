# Piano: score e report da assessment caricati dal cliente

## Richiesta (Voice of the Customer)

Valutare se e come gli score/i report della piattaforma possono tener conto degli assessment che il cliente ha già prodotto fuori dalla piattaforma (Excel, PDF, audit esterni) e caricato su HiCompliance.

## Come funziona oggi (analisi)

- Gli score nascono **solo** dalle risposte al questionario interno (132 domande, `src/data/assessmentQuestions.ts`): ogni domanda ha uno stato (`completato`, `pianificato_in_corso`, `non_iniziato`, `non_applicabile`) e una priorità (ALTA/MEDIA/BASSA).
- Il punteggio per categoria è una media pesata per priorità (`calculateCategoryScore`), lo score complessivo è la media delle categorie con risposte (`computeOverallScore` in `src/lib/assessment/scoring.ts`, unica fonte usata da pagina Assessment e Dashboard).
- Gli snapshot (`assessment_snapshots`) congelano i punteggi per Gap/Gain Analysis; i report PDF e la pagina Report leggono da lì.
- I documenti caricati dal cliente finiscono in Gestione Documenti (`incident_documents`, `source_type: manual`) e **non influenzano in alcun modo gli score**: oggi non esiste alcun import/parsing.
- Conclusione: tecnicamente possibile, e si può fare **in modo puramente additivo** senza toccare la logica di scoring esistente.

## Opzioni valutate

1. **Import risposte da file** (Excel compilato dal cliente) → le risposte entrano in `assessment_responses` e score/report si calcolano con la logica attuale. Fedele, nessuna modifica allo scoring.
2. **Score esterno per categoria** (il cliente ha un audit con un proprio punteggio) → punteggio registrato a parte e mostrato nei report come dato dichiarato, senza alterare lo score calcolato.
3. **Solo evidenza documentale** → il file resta allegato come prova a supporto, gli score non cambiano. (Già possibile oggi con Gestione Documenti, non risponde alla richiesta.)

## Proposta: due fasi, tutte additive

### Fase 1 — Import assessment da Excel (opzione 1)

- Template Excel scaricabile dalla pagina Assessment: una riga per domanda (ID, categoria, testo, colonna "Stato" da compilare con i 4 valori ammessi).
- Upload del file compilato → anteprima di validazione (domande riconosciute, stati validi, errori riga per riga) → conferma → upsert in `assessment_responses` con la stessa logica di salvataggio già esistente.
- Score, radar, snapshot, Gap Analysis e report PDF continuano a funzionare identici, perché leggono dalle stesse tabelle.
- Le domande non presenti nel file restano invariate (import parziale consentito).
- Tracciabilità: le risposte importate vengono marcate (colonna nuova `source: 'import' | 'manual'` su `assessment_responses`, default `manual` → nessun impatto sui dati esistenti) e nei report compare l'indicazione "dato importato da file del cliente".

### Fase 2 — Score esterno dichiarato (opzione 2)

- Nuova tabella `assessment_external_scores` (organization_id, categoria, score dichiarato, documento di riferimento collegato a Gestione Documenti, data, note) con RLS come le altre tabelle per-organizzazione.
- Nella pagina Assessment e nei report lo score esterno compare **affiancato** a quello calcolato ("Score calcolato 62 · Score da audit esterno 75"), mai mescolato: lo score calcolato resta la fonte per trend e Gap Analysis.
- Il documento caricato in Gestione Documenti può essere collegato come evidenza.

### Cosa NON cambia

- Nessuna modifica a `scoring.ts`, `calculateCategoryScore`, snapshot esistenti, report esistenti, RLS attuali.
- Dati e score già prodotti restano intatti; l'import è sempre preceduto da anteprima e conferma.

## Lavori tecnici (per il DEV)

- Migrazione: colonna `source` su `assessment_responses`; tabella `assessment_external_scores` con GRANT + RLS (pattern `doc_can_access_org`).
- Frontend: componente `ImportAssessmentDialog` (download template, upload, anteprima validazione, conferma) nella pagina Assessment; parsing Excel lato client con la libreria già usata per gli export (xlsx/exceljs già presente per HiLog).
- Report: badge "importato" / sezione "score esterni" nei PDF esistenti, senza cambiarne la struttura.
- Permessi: import e score esterni riservati a Super Admin e Sales; l'utente cliente vede i risultati.
- Test: import parziale, file con errori, verifica che lo score ricalcolato corrisponda a quello atteso.

## Domande aperte per il cliente

1. In che formato sono oggi gli assessment prodotti dal cliente (Excel, PDF, altro)? La Fase 1 assume un Excel compilabile sul nostro template.
2. Lo score esterno deve solo essere mostrato, o deve sostituire quello calcolato in alcuni report? (Proposta: solo affiancato.)
3. L'import lo fa il cliente in autonomia o lo facciamo noi (Super Admin/Sales) per suo conto? (Proposta: noi.)
