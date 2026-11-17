# IRP esteso — matrice operativa per sviluppo e porting

Baseline: 17 novembre 2026. Leggere prima [la specifica IRP](irp-esteso.md). **Presente** significa individuato nel codice; **Parziale** significa percorso incompleto/ibrido; **Assente** significa non presente nel percorso esaminato. Nessuna di queste etichette certifica il sito pubblicato.

Priorità: **P0** = sicurezza/integrità, **P1** = parità funzionale e piano esteso utilizzabile, **P2** = integrazioni successive. I contratti TARGET sono proposte implementabili per il nuovo prodotto, non endpoint già rilasciati. La colonna QA indica il test da realizzare, non un test eseguito in questa attività documentale.

## 1. Matrice requisiti → codice → implementazione → QA

| ID / priorità | Requisito e stato attuale | Evidenza nel repository | Implementazione TARGET | Accettazione misurabile |
|---|---|---|---|---|
| IRP-01 P0 | Tenant e visibilità — Presente, enforcement azioni da verificare | moduleServiceMap, useModuleAccess, useClientOrganization, permissions/catalog | Medesima regola per menu/rotta; autorizzazione server di ogni azione | User A non legge né modifica dati B con ID B; servizio disattivo nega apertura diretta |
| IRP-02 P0 | Cambio cliente e cache — Parziale | hook con stato/debounce; chiave playbook solo ID | Cache per org/user/execution; cancellare richieste e flush sicuro nel tenant originario | Scrivi in A, cambia subito a B: nessun valore A in B, nessun save indirizzato a B |
| IRP-03 P1 | Normale/Esteso — Presente | IncidentResponse: extended_range | Booleano validato, controllo disponibile server; nessun gate per nome demo | false → 5 tab comuni; true → +3; stringa 'false' non abilita Esteso |
| IRP-04 P1 | Profilo e classificazione — Presente | OrganizationProfileForm; organization_profiles | Riutilizzo profilo e mapping NIS2 condiviso | Modifica profilo, ricarica IRP: stessi dati; nessuna scrittura REST legacy per anagrafica |
| IRP-05 P1 | Governance/ruoli — Presente | GovernanceContactsTable, emergency_contacts, irpApi | Distinguere persona, titolo, incarico, responsabilità; escalation persistita | Ricarica contatti dopo scelta escalation: valore mantenuto; ruolo IRP non sostituito da job_title |
| IRP-06 P1 | Rubrica e picker — Presente/ibrido | ContactDirectoryManager, PlaybookInputSection, irpApi.contacts | Fonte anagrafica condivisa e adapter unico, validazione inviti | Selezione contatto conserva ID/nome; negato contatto altro tenant; invito solo con permesso |
| IRP-07 P1 | Fornitori condivisi — Presente | SupplierDirectoryTab → supplier_directory | Nessun registro duplicato; entitlement Supply Chain al posto di isInnovatechDemo | Inserito da IRP, visibile in Supply Chain; archiviato non appare; link non dipende dal nome |
| IRP-08 P1 | Import Excel — Presente | supplierExcelImport + SupplierExcelImportDialog | Primo foglio/alias, preview righe valide/duplicate/errori; inserimento + audit affidabile | File con valida, duplicata e email errata → una inserita; retry non duplica; tenant corretto |
| IRP-09 P1 | Infrastruttura — Parziale (adapter REST) | useCriticalInfrastructure, critical-infrastructure API | Scegliere adapter autorizzato; DTO campi e ore; auto-save 1,5 s | Tutti campi §5.2 persistono dopo reload; null resta sconosciuto; RPO/RTO negativi rifiutati |
| IRP-10 P0 | Codice asset concorrente — Parziale | max C-nn +1 client; UNIQUE iniziale | Allocazione server atomica con retry | Due create parallele → due codici unici, nessuna perdita record |
| IRP-11 P1 | Catalogo rischi — Presente | securityControls, riskAnalysis.ts | 33 ID e 7 categorie, catalogo versionato; validare ID e valori | 33 ID unici; valore 4 o ID sconosciuto rifiutato; null ≠ 0 |
| IRP-12 P1 | Score e completezza — Presente, client | useRiskAnalysis | Motore autoritativo con parità dati validi; risultato e completezza distinti | 3,2,1 → 67; tre controlli /33 → 9% completezza; {} →0; soglie 40/41/70/71 corrette |
| IRP-13 P1 | Raggruppamento asset/fonte — Presente | getAssetSummaries | Identità stabile, fonti esplicite, parità calcolo legacy | Due fonti 40 e 41 → media40,5, rischio Alto e score mostrato41; fonte assente non inventata |
| IRP-14 P0 | Link rischio/infra — Parziale | addAsset(syncToInfrastructure) | FK/link confermato, transazione o retry esplicito | Fallimento infra non appare come sync riuscita; retry non crea duplicato; rename non rompe link |
| IRP-15 P1 | Sette scenari — Presente | playbooksMap in phishing.ts | Import template completo con ID stabili e versione | Tutti i sette ID §4.2 aprono il template corretto; data-breach mantiene mapping exfiltration |
| IRP-16 P1 | Interazioni/evidenze — Presente | PlaybookViewer e sezioni | Owner/picker/radio/check/input/note/link/immagini; validare upload | Radio esclusiva; owner salvato con contactId; evidenza ricaricabile e autorizzata |
| IRP-17 P0 | Completamento reale — Parziale | calculatePlaybookProgress | Conteggio legacy; chiusura solo completed==total>0 | Esempio4/6 →67%; optional owner conta;199/200 non chiude; note non alterano denominatore |
| IRP-18 P0 | Persistenza esecuzioni — Stub auto-sync | usePlaybookAutoSave, usePlaybookCompletions | executionId per incidente, save server e timestamp autoritativi | Due incidenti ransomware separati; logout/reload non perde stato; offline dichiarato non sincronizzato |
| IRP-19 P0 | Migrazione progresso — Presente locale v2 | playbookMigration | Merge per ID, backup input e politica elementi rimossi | Nuovo item default; checked/note/input conservati; JSON corrotto gestito senza contaminare altre istanze |
| IRP-20 P0 | Archiviazione completamento — Stub | autoSaveDocxToDocuments | Snapshot finale e documento via idempotency key; ritentare errori | Due richieste complete → un solo evento/documento; file read-back scaricabile prima conferma |
| IRP-21 P1 | Bozza piano — Presente legacy manuale | useIRPDocument, IRPDocumentEditor | Auto-save1,5s, envelope versionato, flush prima export | Reload conserva modifiche; chiusura rapida non perde input; conflitto due editor segnalato |
| IRP-22 P0 | Tre versioni distinte — Parziale | irp_documents + document_data + document_versions | Separare revisione piano, concorrenza bozza e revisione artefatto; workflow esplicito | Save bozza non incrementa revisione file; nuova revisione conserva vecchio download |
| IRP-23 P1 | Aggregatore piano esteso — Assente completo | docxGenerator prepara contatti/rischi soltanto | Composizione sezioni §8.5 da snapshot autorizzato | File contiene governance, asset/RPO/RTO, rischi, fornitori, allegati selezionati; fonte non caricata segnala errore |
| IRP-24 P1 | Template Word — Parziale | IRP_template.docx: soli nome/data rilevati | Placeholder e loop completi, opzionali e layout coerenti | Nessun placeholder residuo; contatti lunghi/0/100 righe leggibili; nessuna sezione persa |
| IRP-25 P1 | Export piano unico — Parziale, due percorsi | docxGenerator vs irpApi.exportDocument | Medesima versione/input per entrambi i pulsanti; file e archivio esiti distinti | Export dalla pagina/editor stessa bozza → contenuti identici; errore storage non dichiarato archiviato |
| IRP-26 P1 | Export playbook completo — Parziale | playbookDocxGenerator | Esportare tutti tipi sezione e restituire blob/metadata | Input-list e notes nel Word, checked/inline/screenshot preservati; immagini <=400px |
| IRP-27 P0 | Regole documentali — API presenti | documentsApi, useDocumentSave, docxMetadata | createRevision/setStatus/syncFileMetadata; sourceId stabile | Modifica metadati non cambia rev; stato non salta; ogni revisione storica resta scaricabile |
| IRP-28 P1 | Riepilogo e storico — Parziale | DocumentsTab tratta irp_history come log piano | Envelope piano e storico revisioni reale; score history separato | Timestamp/stato/rev reali, nessun Attivo fisso; snapshot score non mostrato come approvazione |
| IRP-29 P2 | Ordine recovery BIA — Assente nella pagina | guida BIA: da completare | Revisioni approvate, link confermati, ore/minuti coerenti | BIA draft esclusa dall'ordine ufficiale; BIS e rischio separati; target vs capacità e gap visibili |
| IRP-30 P2 | Correlazione ACN — Assente nella tab Conformità | placeholder IRP; catalogo separato nis2Acn | Link/evidenze additive, nessuna risposta auto-copiata | Apri requisito correlato; punteggi/snapshot Assessment invariati dopo modifica IRP |
| IRP-31 P1 | Review documento — Presente fuori IRP | documentReview, DocumentReviewBoard | Riutilizzare review_due_date e reminder condivisi | Data cambia una volta e compare uguale in Gantt/documenti/dashboard; nessuna seconda scadenza divergente |
| IRP-32 P0 | QA/telemetria/contratti — Parziale | cast any, ts-nocheck, adapter ibridi | DTO runtime, errori distinti, audit senza segreti; prove autentiche multi-tenant | Validation/auth/forbidden/conflict/storage distinguibili; log senza contenuti sensibili o token |

## 2. Matrice sorgenti → sezioni Word → documenti archiviati

| Sorgente | Identità da mantenere | Sezione TARGET | Stato locale attuale | Regola archiviazione |
|---|---|---|---|---|
| organization_profiles/tenant | organization_id | Copertina/anagrafica | Nome/data nel template; altri dati incompleti | Snapshot valori, non query live al download storico |
| irp_documents.document_data | plan ID + versione emissione | Testi/severità/comunicazioni/procedure | Editor presente, dati non tutti passati al renderer | Save bozza distinto da nuova revisione |
| emergency_contacts/contact_directory | incarico ID + persona ID | Governance ed escalation | Array preparato, loop template non rilevato | Preservare nominativi dell'emissione |
| critical_infrastructure | UUID + asset_id | Asset, backup, RPO/RTO | Non aggregato nel renderer locale | Solo tenant e inclusione esplicita |
| risk_analysis/control catalog | risk ID + catalog version | Matrice rischi/completezza/legenda | Sintesi preparata, loop template non rilevato | Score snapshot, nessun ricalcolo storico invisibile |
| supplier_directory | supplier ID | Fornitori e contatti | Non aggregato | Non copiare il registro in un'altra tabella |
| template playbook | template ID/version | Allegati procedurali | Export separato | Distinguere modello vuoto da esecuzione compilata |
| esecuzione incidente TARGET | execution ID | Evidenze e report finale | Nessuna identità incidente separata | Una chiusura idempotente, revisioni esplicite |
| BIA approvata | bia assessment ID/version | Recovery | Integrazione da realizzare | Link confermati; versione approvata congelata |
| nis2_acn_responses/catalog | requisito + catalog version | Riferimenti conformità | Percorso separato | Additivo, nessuna modifica scoring legacy |
| incident_documents/document_versions | document ID/revision | Registro allegati | API documentali presenti | Versioni storiche conservate; stato workflow |

## 3. Sequenza di implementazione e dipendenze

| Fase | ID | Dipendenze | Deliverable e gate |
|---|---|---|---|
| A. Fondazioni | 01–03,10,18,22,32 | Identità utente/tenant e backend del nuovo prodotto | Schema/DTO/ACL, identità esecuzioni; test multi-tenant e concorrenza passati |
| B. Registri e motori | 04–17,19,21 | A; cataloghi esistenti | Profilo/governance/fornitori/infra/rischi/playbook; parità calcolo e read-back |
| C. Piano e archivio | 20,23–28,31 | A+B; document management disponibile | Aggregatore/template/Word completo; idempotenza, workflow e versioni scaricabili |
| D. Collegamenti | 29–30 | C; BIA approvata e catalogo ACN versionato | Recovery/correlazioni verificati senza alterare motori preesistenti |
| E. Rilascio | tutti | Gate precedenti | QA autenticata, layout Word, migrazione e rollback documentati; nessuno stub presentato come completo |

Non stimare giorni o costi senza conoscere il nuovo prodotto. P0 non significa riscrivere tutti i moduli: prima stabilire adapter, identità, autorizzazioni e integrità; poi riusare cataloghi e flussi validi.

## 4. Dataset QA minimo (sintetico)

Usare organizzazioni di test **A e B**, utenti redattore/sola lettura/approvatore, niente credenziali nei file. Valori seguenti sono dati QA inventati, non anagrafica cliente.

| Caso | Input | Risultato atteso |
|---|---|---|
| QA-01 rischio | firewall3,mfa2,backup1 | score67; completezza9%; categoria IT2,5 |
| QA-02 null/zero | firewall0,mfa null | score0; un controllo valutato; null non conta |
| QA-03 soglie | score40,41,70,71 | Alto,Medio,Medio,Basso |
| QA-04 media | fonti40 e41 stesso asset | media40,5; livello Alto; visualizzazione41 |
| QA-05 progresso | 2 owner+3 checkbox+1 radio;4 complete | totale6, percentuale67 |
| QA-06 chiusura | 199 unità su200 | percentuale100 possibile, chiusura TARGET negata |
| QA-07 import | nome valido; duplicato case diverso; email errata | una sola riga inserita; altre esiti separati |
| QA-08 isolamento | bozza A, cambio B durante debounce | nessuna lettura/scrittura incrociata |
| QA-09 revisione | Word rev1 → nuova rev2 | entrambe scaricabili; corrente2; nota/stato secondo workflow |
| QA-10 metadati | cambia categoria/classificazione della rev2 | file sincronizzato; rev2 invariata; rev1 non riscritta |
| QA-11 retry | doppia completeExecution stessa chiave | un evento e un documento |
| QA-12 concorrenza | due save con stessa expectedVersion | uno confermato, altro conflitto; nessuna perdita silenziosa |
| QA-13 Word | 0,1,100 contatti; nomi lunghi; immagini; opzionali | niente token residui, overflow o sezioni perse; verifica visiva tutte pagine |
| QA-14 fonti | infra selezionata ma richiesta fallita | export non dichiarato completo; errore distinguibile da lista vuota |
| QA-15 recovery | BIA approvata A, draft B, asset con target ore | solo A nell'ordine ufficiale; unità convertite esplicitamente |

## 5. Checklist di handoff

- [ ] Baseline commit del codice, schema risultante e versione cataloghi/template registrati nella consegna del nuovo prodotto.
- [ ] Per ogni ID: owner DEV, ticket, PR, test e stato; evitare colonne «fatto» senza evidenza.
- [ ] Adapter unico scelto per ciascun dominio; nessun endpoint legacy irraggiungibile lasciato dietro un pulsante attivo.
- [ ] P0 chiusi con prove su due tenant e sessioni autorizzate, non solo mock.
- [ ] Migrazione dati include bozza IRP, contatti, fornitori, asset, rischi, progresso locale recuperabile e documenti/versioni; elementi locali senza tenant certo non assegnati automaticamente.
- [ ] Fonti mancanti/confitti/storage error/offline hanno esiti e retry chiari.
- [ ] Tutti tipi sezione playbook e tutte sezioni selezionate del piano presenti nel Word; ogni pagina renderizzata e controllata.
- [ ] Workflow e storico documentale verificati con read-back; metadati non aggirano revisioni/stati.
- [ ] Recovery e NIS2 restano P2 espliciti se non implementati; tab placeholder non etichettata operativa.
- [ ] Credenziali, chiavi service-role e dati personali non inclusi nella documentazione o negli archivi di sorgenti.

La checklist è per la futura implementazione: questa consegna documentale non esegue né dichiara superati i test TARGET.