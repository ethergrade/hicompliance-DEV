# Roadmap BIA
- [x] IRP esteso: docs/irp-esteso.md e matrice di porting con 32 requisiti, contratti, limiti e criteri QA; riferimenti e catalogo verificati, nessuna modifica funzionale.
- [x] Documentazione developer Supply Chain e IRP in Markdown: flussi, dati, RPC, persistenza, limiti e checklist; file consegnati in Files.
- [x] Documentazione richiesta: guide Supply Chain e IRP in Word e PDF, quattro pagine ciascuna; validazione DOCX e verifica visiva di tutte le pagine completate, limiti attuali esplicitati.
- [x] Anagrafica: salvataggio unico su organization_profiles, campi tecnici additivi e classificazione NIS2 normalizzata in lettura/scrittura; build OK e verifica API con servizio simulato. Test Vitest bloccati dall'incompatibilità esistente; verifica autenticata non disponibile (Supabase esterna).
- [x] NIS2: aggiunto accesso nel menu con permessi Assessment e intestazione adattabile; tooltip badge verificato prima/dopo, tastiera e larghezze 1280/909/390. Verifica cliente autenticato non disponibile (auth esterna); test NIS2 bloccati dall'incompatibilità Vitest 4 / Vite 5.
- [x] Asset Management: uniform column headers and Excel-style column resizing; isolated browser checks passed (drag, keyboard, reset, aligned filters). Authenticated client view remains unverified because authentication is externally managed.
- [x] Schema DB, calcolo, workflow, audit
- [x] Tipi, API, calcoli, test
- [x] Panoramica e dettaglio servizio, export PDF
- [x] Menu, pagine, permessi
- [x] Documentazione (docs/business-impact-analysis.md)
- [x] Verifica E2E
- [ ] Ordine di recovery in Incident Response
- [ ] Pubblicazione

- [ ] Asset Management: credenziali HaloPSA (in attesa utente), email settimanale scadenze (serve dominio mittente)
- [x] Assessment: import risposte da Excel (template, anteprima validazione, upsert source='import') e score esterni affiancati (assessment_external_scores); docs/assessment-import-e-score-esterni.md
- [ ] Assessment: indicazione 'dati importati' nei PDF di report (oggi solo badge in pagina)
- [x] Gestione Documenti: versioning con storico revisioni scaricabili, nuova revisione con nota obbligatoria, workflow Bozza → In Revisione → Approvato → Obsoleto (docs/gestione-documentale-iso.md §14)
