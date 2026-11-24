# Sales Manager – gestione commerciale dei piani di remediation

## Cosa vede l'utente
Nuova voce di menu **«Sales Manager»**, visibile solo a Super Admin e Sales HiSolution (stesso controllo ruoli già usato per «Selezione Clienti» / «Reportistica Aggregata»). Chi non ha il ruolo non vede la voce e, se apre l'indirizzo, viene rimandato alla dashboard.

### 1. Elenco clienti (vista principale)
Tabella con una riga per cliente:
- Cliente, n. remediation totali, n. per stato commerciale (Proposto, Inviato, In trattativa, Accettato, Rifiutato, In esecuzione, Completato)
- Valore totale proposto e valore accettato (EUR)
- n. remediation **senza valore** (evidenziate da valorizzare)
- Ultimo aggiornamento
- Filtri: ricerca cliente, stato, "solo da valorizzare"
- Riepilogo in alto: pipeline totale, accettato, tasso di conversione, clienti con remediation non valorizzate

Clic sul cliente → piano di remediation di quel cliente (seleziona il cliente e apre `/remediation`), oppure dettaglio commerciale interno.

### 2. Dettaglio commerciale del cliente
Elenco delle remediation del cliente con:
- Azione, categoria, priorità, avanzamento tecnico (dal piano)
- **Valore**: se il piano ha già il budget, lo mostra; se è vuoto il commerciale lo inserisce (salvataggio automatico 1,5 s). Il valore commerciale non sovrascrive mai il budget del piano: è un campo separato; il valore mostrato è "budget del piano, altrimenti valore commerciale".
- **Stato commerciale** con pulsanti d'azione (no tendine): Proposto → Inviato → In trattativa → Accettato / Rifiutato → In esecuzione → Completato
- Note commerciali, data proposta, data chiusura
- Pulsante «Apri piano di remediation»

### 3. Export con carta intestata HiSolution
Su elenco clienti e su dettaglio cliente:
- **CSV**
- **Excel** (intestazione con logo HiSolution, foglio riepilogo + foglio dettaglio)
- **PowerPoint** con carta intestata: copertina con logo, slide riepilogo pipeline (grafico per stato), una slide per cliente con le remediation e i valori, slide finale contatti

## Dettagli tecnici
- Nuova tabella `remediation_commercial` (task_id univoco → remediation_tasks, organization_id, status, proposed_value numeric, currency, notes, proposed_at, closed_at, updated_by, timestamp). GRANT ad authenticated/service_role, RLS: lettura/scrittura solo `has_role(super_admin)` o `has_role(sales)`. I clienti non vedono mai questa tabella.
- Funzione `sales_pipeline_summary()` security definer (solo super_admin/sales) che aggrega per organizzazione: conteggi, valori, non valorizzate.
- File: `src/lib/api/salesManager.ts`, `src/lib/salesManager/value.ts` (regola valore effettivo + transizioni stato), `src/pages/SalesManager.tsx`, `src/components/sales/*`, `src/lib/salesManager/export.ts` (CSV, xlsx con logo `src/assets/logo-hi.png`, pptxgenjs).
- Rotta `/sales-manager` con guard ruolo; voce in AppSidebar.
- Test: valore effettivo (budget piano prevale, altrimenti valore commerciale), transizioni di stato consentite, aggregazione conteggi.
- Regola in AGENTS.md: dati commerciali separati da remediation_tasks.

## Da confermare
- Stati commerciali proposti sopra (modificabili).
- Logo: uso `logo-hi.png` già presente; se serve un logo HiSolution diverso per la carta intestata va caricato.
