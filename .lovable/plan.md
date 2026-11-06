# Percorso NIS2 ACN in HiConsole — valutazione e piano

## Esito dell'analisi
Sì, si può fare, e senza toccare l'assessment attuale (132 domande, 12 categorie). Il documento descrive un percorso completo e coerente:
classificazione (13 domande C00-C12) → esito Essenziale / Importante / Fuori ambito / DORA / Da verificare → catalogo ACN (43 misure, 116 requisiti, 8 fasi) → piano di adeguamento → incidenti significativi IS-1..IS-4.

Oggi la piattaforma ha già: profilo organizzazione con classificazione NIS2 (scelta manuale), assessment proprietario, Gap Analysis, Remediation, BIA, Supply Chain, Asset, IRP, Documenti con versioning. Manca: wizard di classificazione, catalogo ACN con testo ufficiale, spiegazioni e evidenze, correlazione con le domande esistenti, calendario adempimenti.

Scelta di fondo: **l'assessment NIS2 ACN diventa un secondo questionario affiancato**, non sostituisce quello attuale. Le 132 domande, i punteggi, gli snapshot e i report restano identici.

## Fase 1 — Wizard di classificazione NIS2
- Nuova scheda "Classificazione NIS2" nel profilo organizzazione: le 13 domande del documento con la logica dell'albero decisionale (salti, tre esiti, motivazione).
- Se il cliente ha la PEC ACN (C00) la tipologia comunicata prevale sempre.
- Calcolo dimensione d'impresa (ULA, fatturato, bilancio, gruppo) secondo la Raccomandazione 2003/361.
- Salvataggio per anno, con risposte, esito, motivazione e fonte normativa di ogni passaggio. L'esito aggiorna il campo NIS2 già esistente (solo se confermato dall'utente).

## Fase 2 — Calendario adempimenti
- Scadenze annuali (registrazione 1 gen-28 feb, comunicazione ACN entro 14 aprile, ecc.) e scadenze legate all'anno di inserimento (9 e 18 mesi).
- Checklist ruoli da censire (punto di contatto, sostituto, referente CSIRT) collegata alla Rubrica contatti.

## Fase 3 — Assessment NIS2 ACN
- Nuova vista "NIS2 ACN" dentro Assessment, con le 8 fasi del documento.
- Il profilo determina il catalogo: Importante 87 requisiti, Essenziale 116, Base volontario 20 misure con una domanda per misura.
- Per ogni requisito: domanda, **testo ufficiale ACN sempre visibile**, "In parole semplici", evidenza attesa, remediation suggerita, clausole, politica di riferimento, flag "da approvare dagli organi", deroghe/misure compensative.
- Stessi stati di risposta di oggi (Completato, Pianificato/in corso, Non iniziato, Non applicabile) con nota di motivazione e allegato evidenza da Gestione Documenti.
- Punteggio per misura, per funzione (GV/ID/PR/DE/RS/RC) e complessivo, salvato a parte.

## Fase 4 — Correlazione con le domande esistenti
- Tabella di corrispondenza tra le 132 domande attuali e i requisiti ACN (una domanda può coprire più requisiti).
- Su ogni domanda attuale: badge "NIS2: PR.AA-03 p1…" con spiegazione al passaggio del mouse.
- Nell'assessment ACN: "Risposta suggerita dall'assessment esistente", che l'utente conferma con un clic (mai copiata in automatico).
- La prima mappatura la propongo io dal testo delle domande; va validata da un vostro consulente prima del rilascio.

## Fase 5 — Collegamenti con gli altri moduli
- **Piano di adeguamento (ID.IM-01):** i requisiti non soddisfatti generano attività in Remediation, con stima e priorità dal documento; approvazione degli organi tracciata.
- **Asset:** GV.OC-04 e ID.AM-01/02 leggono gli asset marcati "Rilevante".
- **Supply Chain:** GV.SC-01..07 mostrano lo stato dei fornitori già valutati.
- **BIA / continuità:** ID.IM-04 e PR.DS-11 collegati a BIA e piani.
- **IRP:** RS.MA-01 e incidenti significativi IS-x con tempistiche 24 h / 72 h / 1 mese.
- **Documenti:** politiche e documenti da approvare finiscono in Gestione Documenti con versioning.

## Rischi e punti aperti
- Il documento stesso segnala punti "da verificare" (§8): giurisdizione, Allegato III da fonte secondaria. Il wizard li mostra come "Da verificare", non decide.
- Le stime di costo/giorni delle remediation sono indicative: le mostriamo come tali.
- Serve il file JSON citato (`hiconsole_nis2_acn_catalogo.json`): se lo carichi lo uso direttamente, altrimenti estraggo il catalogo dal documento.

## Ordine di rilascio consigliato
1. Catalogo ACN + Assessment NIS2 (Fase 3) — valore immediato.
2. Wizard classificazione + calendario (Fasi 1-2).
3. Correlazione domande (Fase 4).
4. Collegamenti moduli (Fase 5).

## Dettagli tecnici
- Catalogo in `src/data/nis2Acn/` (misure, requisiti, wizard, scadenze) versionato con `rules_version`; nessuna modifica a `assessmentQuestions.ts` né a `scoring.ts`.
- Nuove tabelle (con GRANT + RLS per `organization_id`, scrittura super admin/sales e utenti org abilitati): `nis2_classifications` (org, anno, answers jsonb, esito, tipologia, rationale jsonb, rules_version), `nis2_acn_responses` (org, requirement_code, status, note, document_id, source), `nis2_acn_snapshots`.
- Mappatura in `src/data/nis2Acn/legacyMapping.ts` (question_id → requirement_codes[]).
- Visibilità moduli invariata: passa da `moduleServiceMap` sotto il servizio HiCompliance.
- Regola AGENTS.md: il percorso NIS2 ACN è additivo e separato dall'assessment proprietario.
- Documento DEV in `docs/nis2-acn-percorso.md`.
