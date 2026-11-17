# IRP esteso — specifica DEV e handoff al nuovo prodotto

**Baseline:** repository esaminato il 17 novembre 2026. **Destinatari:** sviluppo, QA, product owner e responsabili sicurezza. **Ambito:** Incident Response Plan, playbook, governance, fornitori, infrastruttura, rischi, composizione Word e archiviazione documentale.

Questa guida descrive il codice presente, non certifica il comportamento del sito pubblicato o lo schema effettivamente installato. Le migrazioni citate sono riferimenti storici: applicare la catena completa e verificare lo schema risultante. Le prescrizioni per il nuovo prodotto sono esplicitamente marcate **TARGET**, non funzionalità già rilasciate.

## 1. Indice del pacchetto

| Documento | Utilizzo |
|---|---|
| [IRP esteso](irp-esteso.md) | Flussi, modelli, calcoli, contratti attuali, esportazione e limiti |
| [Matrice di implementazione](irp-esteso-matrice-implementazione.md) | Attività identificabili, dipendenze, criteri QA e ordine di porting |
| [Gestione documentale](gestione-documentale-iso.md) | Codifica, revisioni e workflow del documento archiviato |
| [Business Impact Analysis](business-impact-analysis.md) | BIS, recovery, collegamenti tecnici e revisioni BIA |
| [Percorso NIS2 ACN](nis2-acn-percorso.md) | Classificazione e questionario ACN separati dall'IRP |
| [Supply Chain](supply-chain-visibilita-ruoli.md) | Accesso al modulo collegato e rubrica fornitori condivisa |

## 2. Definizione e confini del prodotto

L'IRP è il piano di risposta agli incidenti e il contenitore delle procedure operative. Non è il questionario Assessment e non è il motore BIA. Nel repository, la sigla IRP compare anche in `asset_irp` e `irp_history`, relativi a score/consistenze: non assimilare questi dati automaticamente alle revisioni del piano.

### 2.1 Normale rispetto a Esteso

`src/pages/IncidentResponse.tsx` legge i servizi del cliente con `tenantServicesApi.listByOrganization`. Individua un servizio `service_type='hicompliance'`, `status='active'` e valuta `settings.extended_range` tramite conversione booleana. Richiede sia `organizationId` sia `groupId`; in loro assenza l'esito è false. La chiave di cache è `['irp-tier', organizationId]`.

| Sezione | Normale | Esteso | Stato nel codice |
|---|---|---|---|
| Procedure Operative | Sì | Sì | Sette procedure e relativi playbook |
| Contatti e Informazioni | Sì | Sì | Profilo organizzazione e governance |
| Rubrica Contatti | Sì | Sì | Anagrafiche riutilizzabili |
| Fornitori | Sì | Sì | Registro condiviso e import Excel |
| Documenti | Sì | Sì | Riepilogo piano, storico score, export remoto |
| Editor piano | Sì | Sì | Aperto dal pulsante Modifica |
| Infrastruttura | No | Sì | Registro asset e backup/recovery |
| Analisi Rischi | No | Sì | Valutazione controlli per asset/fonte |
| Conformità | No | Sì | Solo placeholder; nessun motore normativo |

**TARGET:** trattare `extended_range` come booleano validato; una stringa `'false'` non deve abilitare Esteso. Questa è una correzione richiesta per il porting, non la semantica attuale. Il servizio controlla la disponibilità; ACL e autorizzazione lato server controllano le azioni. Nascondere una tab non protegge i dati.

### 2.2 Accesso e isolamento

- Rotta: `/incident-response`, definita in `src/App.tsx`.
- Visibilità servizio: `src/config/moduleServiceMap.ts` e `useModuleAccess`; IRP richiede `hicompliance` attivo.
- ACL dichiarate in `src/lib/permissions/catalog.ts`: modulo `irp`, sottosezioni `playbooks`, `risk_analysis`, `critical_infra`, `governance`, `documents`.
- Organizzazione attiva: `useClientOrganization`, alimentato dalla selezione cliente; ogni operazione deve utilizzare l'ID selezionato, non un nome azienda o un ID memorizzato precedentemente.
- Il file della pagina non dimostra un controllo puntuale di ogni azione delle sottosezioni. Nel porting verificare esplicitamente lettura/modifica/export e il corrispondente controllo server.
- **TARGET:** cambio cliente annulla debounce/richieste pendenti, svuota lo stato locale e invalida cache per organizzazione; nessun risultato tardivo del cliente A deve aggiornare B.

## 3. Mappa del codice e dipendenze

| Responsabilità | Riferimenti principali |
|---|---|
| Pagina e tier | `src/pages/IncidentResponse.tsx` |
| Piano/editor | `src/components/irp/IRPDocumentEditor.tsx`, `IRPSectionEditor.tsx`, `src/hooks/useIRPDocument.ts` |
| Contratto piano | `src/types/irp.ts`, `src/lib/api/irp.ts` |
| Governance/rubrica | `GovernanceContactsTable.tsx`, `ContactDirectoryManager.tsx`, `OrganizationProfileForm.tsx` in `src/components/irp/` |
| Infrastruttura | `CriticalInfrastructureManager.tsx`, `src/hooks/useCriticalInfrastructure.ts`, `src/lib/api/critical-infrastructure.ts` |
| Analisi rischi | `RiskAnalysisManager.tsx`, `RiskAnalysisWizard.tsx`, `RiskControlGroup.tsx`, `RiskHeatMap.tsx`, `src/hooks/useRiskAnalysis.ts` |
| Catalogo controlli | `src/data/securityControls.ts`, `src/types/riskAnalysis.ts` |
| Template playbook | `src/data/playbooks/*.ts`; registro `playbooksMap` in `phishing.ts` |
| Esecuzione playbook | `PlaybookViewer.tsx`, `PlaybookInputSection.tsx`, `PlaybookChecklistSection.tsx`, `PlaybookRadioSection.tsx` |
| Persistenza playbook | `src/hooks/usePlaybookAutoSave.ts`, `src/lib/playbookMigration.ts`, `src/hooks/usePlaybookCompletions.ts` |
| Fornitori/import | `SupplierDirectoryTab.tsx`, `SupplierExcelImportDialog.tsx`, `src/lib/supplierExcelImport.ts`, `src/features/supply-chain/api.ts` |
| Word | `src/components/irp/docxGenerator.ts`, `playbookDocxGenerator.ts`, `public/irp/IRP_template.docx` |
| Archiviazione | `src/hooks/useDocumentSave.ts`, `src/lib/api/documents.ts` |

L'esportazione del piano usa `docxtemplater` + `pizzip`; i playbook usano `docx`; il download usa `file-saver`; l'import/export fogli usa `xlsx`. Non introdurre un secondo catalogo di controlli o una seconda rubrica fornitori nel nuovo prodotto.

## 4. Flussi attuali

### 4.1 Preparazione piano

1. Selezione organizzazione, caricamento servizi e tier.
2. Compilazione profilo e contatti governance; contatti personali separati dai ruoli di risposta.
3. Per Esteso, compilazione infrastruttura e analisi rischi.
4. Apertura editor: `useIRPDocument` carica tenant, ultimo `document_data` e `emergency_contacts`.
5. Se esiste una bozza, i suoi contatti vengono sostituiti con quelli appena letti; altrimenti vengono creati valori iniziali (`version='1.0'`, data italiana corrente, sezioni vuote, indirizzo segnaposto).
6. L'editor modifica uno stato locale e dispone attualmente di `Salva Bozza`. Questo è un comportamento legacy, non il pattern da replicare: **TARGET auto-save 1,5 s senza pulsante manuale**, con errore visibile e possibilità di ritentare.
7. L'export dall'editor usa lo stato locale, aggiunge la sintesi rischi opzionale, scarica Word e tenta l'archiviazione. Non salva prima automaticamente la bozza e non garantisce che file e bozza persistita coincidano.

### 4.2 Risposta operativa

| ID selezionabile | Scenario |
|---|---|
| `data-breach` | Violazione dati, collegata al template data exfiltration |
| `phishing-attack` | Phishing |
| `ddos-attack` | DDoS |
| `physical-security` | Incidente fisico |
| `unauthorized-access` | Intrusione/accesso non autorizzato |
| `ransomware` | Ransomware/malware |
| `supply-chain` | Incidente supply chain |

Il viewer è uno sheet laterale. Carica il template e il progresso locale migrato, consente selezione contatti negli owner, checkbox/radio, note, input inline, link e screenshot. Il reset rimuove il progresso locale, ma non elimina una riga di completamento server. Il deep-link `location.state.openPlaybookId` apre il playbook e poi rimuove lo stato di navigazione.

**Importante:** i tempi descrittivi delle schede non sono SLA normativi, timer o notifiche ACN implementate.

## 5. Dizionario dati

### 5.1 Piano e contatti

`IRPDocumentData` contiene:

| Campo | Tipo | Significato |
|---|---|---|
| `companyName`, `companyAddress` | string | Intestazione |
| `date`, `version` | string | Data visualizzata e versione logica del piano |
| `cisoSubstitute` | string opzionale | Nominativo sostituto |
| `sections.introduction` | string | Introduzione |
| `sections.severity` | array | `level`, `description`, `responseTime` |
| `sections.roles` | array | `role`, `responsibilities`, `contact` |
| `sections.contacts` | array | Contatti operativi con ruolo ed escalation |
| `sections.communications` | string | Comunicazioni |
| `sections.procedures` | array | `title`, `steps: string[]`, `assignedTo` |
| `riskAnalysis` | array opzionale | `assetName`, `threatSource`, `riskScore`, medie categoria |

`EmergencyContact`: `id`, `name`, `role` legacy, `job_title`, `irp_role`, `phone`, `email`, `category`, `responsibilities`, `escalationLevel`, `directory_contact_id`. Non confondere titolo aziendale con ruolo IRP. In `loadEmergencyContacts`, escalation è sempre inizializzata a 3: il ricaricamento può perdere la scelta locale. Un'anagrafica può essere riutilizzata in più incarichi.

`irp_documents` nella migrazione iniziale ha `id`, `organization_id`, `user_id` FK auth, `document_data jsonb`, `version integer default 1`, `is_published boolean default false`, timestamp. Sono tre numerazioni diverse: `document_data.version` string, versione riga IRP integer e `incident_documents.revision`; il codice non le sincronizza automaticamente.

### 5.2 Infrastruttura critica

| Campi | Tipo/dominio nella migrazione iniziale |
|---|---|
| `id`, `organization_id`, `created_by` | UUID; organizzazione nullable nello schema iniziale |
| `asset_id` | string obbligatoria, univoca per organizzazione; esempio `C-01` |
| `component_name`, `owner_team`, `location` | string |
| `criticality` | `H`, `M`, `L` oppure null |
| `management_type` | `internal`, `external` oppure null |
| `sensitive_data` | `S`, `N`, `N/A` oppure null |
| `dependencies`, `main_controls` | testo libero, non FK |
| `has_backup` | `S`, `N` oppure null |
| `backup_frequency`, `runbook_link`, `ir_notes` | testo |
| `last_test_date` | date oppure null |
| `rpo_hours`, `rto_hours` | integer oppure null; ore |
| `created_at`, `updated_at` | timestamptz |

Il prossimo `asset_id` è max numero osservato + 1, padding minimo due cifre. Il vincolo DB gestisce unicità ma il client non risolve la collisione concorrente. Auto-save per asset: 1.500 ms in `CriticalInfrastructureManager`.

**TARGET:** allocazione codice atomica, RPO/RTO non negativi, URL runbook validato, distinzione tra sconosciuto e zero. Non convertire ore in minuti senza esplicita trasformazione per BIA.

### 5.3 Analisi rischi

`risk_analysis`: `id`, `organization_id`, `asset_name`, `threat_source`, `control_scores jsonb`, `risk_score integer`, `notes`, timestamp, `created_by`. Fonti: `non_umana`, `umana_esterna`, `umana_interna`. Una riga è una coppia asset/fonte. Il controllo duplicati nel client usa nome e fonte con confronto esatto; la migrazione iniziale non impone unicità della coppia.

I nomi raggruppano le righe nel riepilogo; non sono identità stabili. La creazione opzionale in infrastruttura è una seconda richiesta: può fallire dopo la creazione del rischio. Non è sincronizzazione bidirezionale, non c'è rollback automatico e non c'è FK rischio-infrastruttura nel modello letto.

### 5.4 Fornitori

Fonte condivisa: `supplier_directory`, query per `organization_id`, `archived_at IS NULL`, ordine `supplier_name`. Vista: nome, servizio/categoria, criticità, referente, email e telefono. Il link di gestione Supply Chain è attualmente condizionato da `isInnovatechDemo`, non da un entitlement generalizzato; non copiarlo nel prodotto.

Import: primo foglio `.xlsx/.xls/.csv`; header italiani e alias. Campi: `supplier_name`, `vat_number`, `category`, `service_type`, `service_description`, `criticality`, `contact_name`, `email`, `phone`, `website`, `country`, `notes`.

- Nome richiesto; email validata con regex di base; righe vuote eliminate.
- Criticità: Bassa/Media/Alta/Critica → `low/medium/high/critical`; assente o sconosciuta → `medium`.
- Duplicati: nome trim/lowercase rispetto ai fornitori caricati e alle righe valide precedenti; salto, non aggiornamento.
- Inserimento unico delle sole righe valide non duplicate con org e `created_by`; poi audit `suppliers_imported_excel` e ricaricamento.
- Non sono implementate qui validazioni fiscali, deduplicazione per P.IVA o gestione idempotente dei retry tra inserimento e audit.

### 5.5 Esecuzione playbook

`Playbook` contiene ID, titolo, categoria, severità (`Bassa/Media/Alta/Critica`), icona, durata descrittiva, descrizione, scopo, owner e sezioni. Sezioni: `text`, `checklist`, `input-list`, `notes`; `singleChoice` cambia il conteggio di una checklist. Evidenze: note, screenshot base64/nome, link; input inline: etichetta e valore; owner/input possono includere `contactId`.

`playbook_completions`: org, user, playbook ID/titolo/categoria/severità, percentuale, `data jsonb`, `started_at`, `completed_at`, timestamp. Indice iniziale univoco `(organization_id,user_id,playbook_id)`: non modella più incidenti dello stesso tipo per utente. Il getter frontend cerca solo `playbook_id`, quindi più utenti possono risultare ambigui.

**TARGET:** separare template, istanza incidente e progresso; assegnare `execution_id` stabile e versionare il template usato. Non mutare un incidente storico quando cambia un template.

## 6. Calcoli da preservare e ambiguità da gestire

### 6.1 Controlli rischi

Catalogo: **33 controlli, 7 categorie** in `securityControls.ts`.

| Categoria | ID dei controlli |
|---|---|
| Sicurezza Fisica (9) | `antincendio`, `porta_blindata`, `videosorveglianza`, `allarme`, `serratura`, `estintori`, `drenaggio`, `accesso_locali`, `armadio_blindato` |
| Controllo Accessi (3) | `solo_autorizzati`, `max_tentativi_psw`, `sospensione_sessioni` |
| Gestione Documenti (2) | `distruggi_documenti`, `digitalizzazione` |
| Sicurezza IT (8) | `firewall`, `credenziali`, `complessita_psw`, `mfa`, `antivirus`, `log_monitoring`, `cifratura`, `aggiornamenti_sw` |
| Continuità Operativa (2) | `backup`, `disaster_recovery` |
| Organizzativo (4) | `formazione`, `ruoli_responsabilita`, `gestione_it_esterna`, `tempi_conservazione` |
| Compliance (5) | `procedure_breach`, `privacy_docs`, `consensi`, `regolamento_info`, `diritti_interessati` |

Scala attuale: null = non valutato; 0 = non presente/non applicabile; 1 = presente ma non incide sulla mitigazione; 2 = parzialmente implementato; 3 = totalmente implementato. Lo zero entra nel denominatore: **non è esclusione N/A**.

Formula `useRiskAnalysis.calculateRiskScore`:

```text
V = valori di control_scores per cui typeof valore == 'number'
score = 0 se V è vuoto
score = round(100 × somma(V) / (3 × numero(V))) altrimenti
```

È un indice di mitigazione/copertura: più alto = meglio. Non chiamarlo probabilità d'incidente o rischio residuo. Il codice conta anche eventuali chiavi numeriche sconosciute: **TARGET** whitelist dei 33 ID e interi 0..3, preservando il risultato per dati validi.

- Esempio `{firewall:3,mfa:2,backup:1}` → 67; categoria Sicurezza IT → media 2,5; Continuità → 1,0.
- Completezza per riga = numero valori numerici / 33 × 100; null escluso, zero incluso.
- Riepilogo per nome asset = media delle percentuali di completezza e media score sulle sole fonti presenti; arrotondamento finale. Le fonti non create non sono conteggiate come zero.
- Livelli: score >=71 → rischio Basso; >=41 e <71 → Medio; <41 → Alto. In export ogni riga è intera; nel riepilogo la classificazione usa la media non arrotondata, poi visualizza lo score arrotondato. Il porting deve testare anche medie 40,5 e 70,5.
- Medie categoria nell'editor: soli valori numerici dei controlli di quella categoria, zero se nessuno, arrotondamento a un decimale; colore anteprima dalla percentuale `round(media/3×100)`.
- Non riutilizzare questa formula per BIS BIA, Assessment o score Consistenze: sono motori diversi.

### 6.2 Progresso playbook

`calculatePlaybookProgress`:

1. Ogni campo owner vale una unità, anche se `required=false`; completato quando `value.trim()` non vuoto.
2. Checklist normale: ogni item vale una unità, completato con `checked=true`.
3. Checklist singleChoice: l'intera sezione vale una unità; completa se almeno un item è selezionato.
4. Ogni input di `input-list` vale una unità; completato con testo non vuoto.
5. Note, screenshot, link, testo e valori inline non aggiungono unità.
6. Percentuale = `round(completed/total×100)`; totale zero → zero.

Esempio: due owner, tre checkbox e una singleChoice = totale 6; un owner, due checkbox e una scelta = completate 4 → 67%.

**Limite importante:** l'arrotondamento può dare 100% con una unità mancante (199/200 → 100). Il codice usa percentuale ===100 come completamento. **TARGET:** stato completato solo se `completed===total && total>0`, mantenendo la percentuale come indicatore visuale. Distinguere questa correzione dalla parità legacy.

## 7. Persistenza e contratti attuali

| Operazione | Implementazione attuale | Contratto/limite |
|---|---|---|
| Lettura piano | Supabase `irp_documents`, ultima riga per `updated_at` | Restituisce solo `document_data`, non envelope/versione DB |
| Salvataggio piano | Cerca ultima riga; update per ID o insert con user autenticato | Non incrementa versione, non crea snapshot; update senza filtro org aggiuntivo e concorrenza non gestita |
| Governance | Supabase `emergency_contacts` CRUD | Lettura e modifiche filtrate per org; conservare ruoli/responsabilità |
| Rubrica IRP legacy/inviti | `/companies/{id}/irp/contacts` e `.../{contactId}/invite` | REST legacy in `irpApi`; non assumere funzionante con sessione Supabase |
| Import contatti governance | `POST /companies/{id}/irp/emergency-contacts/import-from-directory` | REST legacy |
| Infrastruttura | REST `/companies/{id}/critical-infrastructure` GET/POST, `/{assetId}` PUT/DELETE | Header `X-Group-Id`; tabella Supabase presente ma adapter usa REST |
| Analisi rischi | Supabase `risk_analysis` CRUD | Client calcola score; API accetta payload score |
| Storico | Supabase `irp_history` | `snapshot_date`, `irp_score`, `area_scores_json`; non storico revisioni piano |
| Pubblicazione piano | `POST /companies/{id}/irp/document/publish` | REST legacy; non confondere con pubblicazione sito |
| Export piano remoto | `GET /companies/{id}/irp/export` | Risposta attesa `success`, `download_url`, `expires_in`; URL consumata con una fetch |
| Progresso locale | `playbook_progress_{playbookId}` | Chiave senza org/user/incidente; rischio contaminazione tra clienti |
| Completamenti server | `playbookCompletionsApi` + `usePlaybookCompletions` | CRUD presente, ma auto-save viewer non lo invoca realmente |

### 7.1 Auto-save playbook: stato reale

`usePlaybookAutoSave` salva dopo **500 ms** in localStorage con `_schemaVersion=2`. Dopo altri 1.000 ms entra nello stato syncing, ma `syncToDatabase` è uno **stub** che restituisce `isNewCompletion:false`; anche `autoSaveDocxToDocuments` è uno stub. Non dichiarare archiviazione server automatica o completamento certificato come funzionante su questo percorso.

La migrazione locale usa template aggiornato e merge per ID di owner/sezione/item/input, preservando valori, contatti, checked, note, immagini e link. Il merge avviene solo per versione salvata <2; stessa versione usa direttamente il payload locale. Elementi rimossi dal template non restano nel risultato migrato; serve una politica per evidenze storiche nel TARGET. JSON corrotto → clone del template. Il cleanup cancella timer: una chiusura rapida può perdere l'ultima modifica.

### 7.2 Contratti TARGET del porting (non endpoint già disponibili)

| Comando logico | Input minimo | Output/garanzie |
|---|---|---|
| `loadPlan` | org | piano + ID + `updated_at`/versione di concorrenza + profilo autorizzato |
| `savePlanDraft` | org, planId, payload validato, expectedVersion | nuova versione concorrenza; conflitto se bozza cambiata, nessuna sovrascrittura silenziosa |
| `saveExecution` | org, executionId, templateId/version, progresso, expectedVersion | progresso persistito; timestamp server; nessuna modifica a esecuzione di altro tenant |
| `completeExecution` | org, executionId, idempotencyKey | snapshot immutabile + riferimento documento; completamento una sola volta |
| `exportPlan` | org, planId/version, include flags, formato | artefatto e snapshot input; errore se fonti richieste non caricate |
| `archiveArtifact` | org, blob, metadata, sourceId, idempotencyKey | document ID + revision + file scaricabile; retry non duplica |

Trasporto e framework del nuovo prodotto non sono specificati dall'utente: questi sono contratti di dominio, non vincolo a Laravel o Supabase. Per un nuovo schema/RLS usare le regole di sicurezza della piattaforma e verificare autorizzazione server, grant e tenant isolation prima del rilascio.

## 8. Word e integrazione Gestione Documentale

### 8.1 Due percorsi distinti

**A — Editor locale:** `generateIRPDocument` carica `/irp/IRP_template.docx`, usa delimitatori `[` e `]`, `paragraphLoop:true`, `linebreaks:true`, rende e scarica `IRP_{azienda_con_spazi_underscore}_{data_con_slash_trattini}.docx`; restituisce blob/nome. `IRPDocumentEditor` chiama poi `saveToDocuments(category='Piano Generale')`.

**B — Pulsante piano completo e tab Documenti:** `irpApi.exportDocument` richiede un URL al servizio REST legacy e lo scarica una volta. Il codice frontend non espone il contenuto del documento remoto; non si può dedurre che includa tutte le sezioni o che archivi automaticamente il file.

### 8.2 Verifica concreta del template locale

L'ispezione dei testi XML del template distribuito ha rilevato solo **`[NOME AZIENDA]` e `[DATA ELABORAZIONE]`**. Il generatore prepara ulteriori dati, ma ciò non prova che compaiano nel Word.

| Dato | Preparato da `docxGenerator` | Placeholder rilevato nel template |
|---|---|---|
| Nome e data | Sì | Sì |
| Indirizzo/versione/sostituto CISO | Sì | No |
| Contatti/ruoli/responsabilità/escalation | Sì, array `contacts` | No |
| Sintesi rischi/medie categoria | Sì, `hasRiskAnalysis`, `riskAnalysis`, `riskAnalysisDate` | No |
| Introduzione/severità/ruoli/comunicazioni/procedure editor | No come campi dedicati | No |
| Registro infrastruttura/backup/RPO/RTO | No | No |
| Fornitori | No | No |
| Tutti i playbook | No | No |
| BIA/ordine recovery/ACN | No | No |

Pertanto il piano Word locale attuale non va presentato come composizione estesa completa. Nel TARGET occorre completare sia l'aggregatore sia il template, con test sui contenuti estratti dal file generato.

### 8.3 Playbook Word

`generatePlaybookDocx` scarica `{playbook.id}_checklist_{yyyy-MM-dd}.docx`. Include intestazione/progresso, scopo, tabella owner, sezioni testo e checklist, note/link/valori inline degli item ed evidenze immagini (larghezza massima 400 px mantenendo proporzioni). Nel loop letto non esporta le sezioni `input-list` e `notes` come casi dedicati. Non restituisce un artefatto al caller per l'archiviazione. Non assumere che il download manuale finisca in Gestione Documentale.

### 8.4 Regole documentali da rispettare

`useDocumentSave` richiede user e org; chiama `documentsApi.createWithFile` con `is_generated:true`. Nome che inizia `IRP_` o categoria Piano Generale → `source_type='irp'`, tag `IRP,compilato`; altrimenti `manual`. Ogni chiamata crea un documento: non significa nuova revisione della stessa identità documentale.

Nel nuovo prodotto:

- La riga `incident_documents` è la versione corrente; `document_versions` conserva tutte le revisioni scaricabili.
- Nuova revisione solo tramite `documentsApi.createRevision`; stato solo tramite transizioni `setStatus` Bozza → In Revisione → Approvato → Obsoleto.
- Collegare piano/esecuzione tramite un `source_id` stabile; definire se esportazione è prima emissione, nuova revisione o semplice rigenerazione senza confonderle.
- Metadati Word letti/scritti solo con `src/lib/docxMetadata.ts`; sincronizzazione metadati correnti tramite `syncFileMetadata`, senza avanzare revisione e senza saltare workflow.
- Scadenza controllo/revisione: `review_due_date` del documento, cruscotto condiviso e promemoria esistenti; non creare una seconda scadenza IRP divergente.
- Successo download e successo archiviazione sono due esiti distinti. Nessun messaggio «archiviato» prima della conferma persistita e lettura del file.

### 8.5 Struttura documentale TARGET

| Ordine | Sezione del piano esteso | Fonte | Condizione |
|---|---|---|---|
| 1 | Copertina, codice, revisione, stato, classificazione | profilo + documento corrente | Sempre; campi mancanti segnalati |
| 2 | Scopo, perimetro, severità e attivazione | sezioni piano | Sempre; bozza se incompleto |
| 3 | Governance, escalation, sostituti | contatti operativi e rubrica | Sempre, snapshot dell'emissione |
| 4 | Comunicazioni e responsabilità | piano | Sempre |
| 5 | Asset, dipendenze, backup, RPO/RTO | infrastruttura | Solo se inclusa e caricata; vuoto esplicito, non inventato |
| 6 | Analisi rischi con legenda e completezza | righe rischio + catalogo | Solo se inclusa; specificare che score alto = mitigazione migliore |
| 7 | Fornitori e contatti di emergenza | supplier_directory | Se inclusi, escludere archiviati |
| 8 | Priorità recovery e gap | BIA approvata e link confermati | Da implementare; tenere BIS separato dal rischio |
| 9 | Playbook applicabili e riferimenti | template versionati | Allegati selezionati, non progresso locale di altri incidenti |
| 10 | Registro allegati, evidenze e approvazioni | documenti/esecuzioni | Solo dati persistiti, link autorizzati |

Un blocco escluso volontariamente è diverso da una fonte che non si è caricata: il secondo caso deve impedire di presentare un export come completo.

## 9. Collegamenti BIA e NIS2

**BIA:** esistono collegamenti tipizzati ai record infrastruttura/rischi. L'ordine recovery nella pagina Incident Response è ancora una voce da completare. TARGET: utilizzare una revisione BIA approvata, link confermati e unità coerenti; presentare BIS, rischio residuo e indice priorità come colonne separate. Non ricavare dipendenze certe dal testo libero `dependencies`.

**NIS2 ACN:** classificazione e catalogo sono nel percorso separato `/assessment/nis2`. La tab Conformità IRP non lo implementa. TARGET: collegamenti a misure/requisiti ed evidenze documentali, senza copiare risposte o modificare scoring Assessment, snapshot e Gap Analysis. Tempi di notifica e obblighi devono avere una fonte normativa versionata e validazione dedicata; le durate delle schede IRP non li sostituiscono.

## 10. Lacune da non trasferire come funzionalità complete

1. Auto-sync e auto-archiviazione dei playbook sono stub nel percorso viewer.
2. Cache localStorage playbook non isolata per organizzazione/utente/istanza.
3. Template Word locale espone solo nome e data; l'aggregazione estesa è incompleta.
4. Backend ibrido: infrastruttura/export/pubblicazione e alcune funzioni contatti rimangono REST legacy.
5. Bozza IRP senza concorrenza, auto-save globale e snapshot emissione.
6. `irp_history` è storico score, mentre `DocumentsTab` lo tratta come cronologia documento (si aspettano `action`, `summary`, `created_at`, `version`); mapping da correggere.
7. `DocumentsTab` legge solo `document_data`, mostra stato fisso Attivo e può non avere `updated_at`; non è evidenza di approvazione.
8. Collegamento infrastruttura/rischi per nome e creazione in due richieste, non relazione atomica.
9. Progresso 100 arrotondato non garantisce tutte le unità compilate.
10. Download playbook incompleto per tipi sezione e non archiviato dal caller.
11. Conformità placeholder; ordine recovery BIA non implementato nella pagina.
12. API con `any`/`@ts-nocheck`: serve validazione runtime e allineamento DTO, non copia cieca dei cast.

## 11. Definizione di completamento del porting

Usare gli ID della [matrice](irp-esteso-matrice-implementazione.md) in ticket, PR e test. Ogni requisito deve avere verifica con utente autenticato e organizzazione reale di test, almeno due tenant per isolamento, e read-back dopo ricaricamento. La sola schermata demo o un file generato senza verifica delle sezioni non basta.

Pacchetto consegna DEV: cataloghi/template versionati, DTO validati, schema risultante e migrazioni, adapter scelto, permessi server, test formule/soglie, test concorrenza e idempotenza, export Word verificato nei contenuti e nel layout, inventario lacune chiuse o bloccate. Questa richiesta aggiorna solo documentazione: nessuna lacuna applicativa viene risolta implicitamente.