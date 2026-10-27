# Supply Chain – visibilità per ruolo

- **Sales**: vede Dashboard, Fornitori, Assessment e "Gap e rischi filiera" (matrice criticità × score, rischi potenziali, gap per fornitore con azione consigliata neutrale, gap più diffusi). Non vede opportunità commerciali né servizi suggeriti; in dashboard vede la card "Esposizione della filiera".
- **Super Admin**: vede tutto, incluso il tab "Opportunità". Il tasto "Vedi come Sales" simula la vista Sales solo nell'interfaccia (permessi reali invariati, si azzera uscendo dalla pagina).
- I dati arrivano da `sc_org_gaps`, `supplier_assessments`, `supplier_directory`; le raccomandazioni (`supply_chain_recommendations`) vengono richieste solo se l'utente è super admin e non in modalità Sales.

## Da fare in produzione
- Restringere la RLS di `supply_chain_recommendations` a solo super admin: oggi i Sales potrebbero leggerla interrogando direttamente il DB.

## Linee di trend in Dashboard
Componente `src/features/supply-chain/components/SupplyChainTrends.tsx`, funzione `buildSupplyChainTrend` (ultimi 12 mesi, valore a fine mese). Calcolate solo da dati salvati, nessun valore inventato:
- **Score medio**: media dell'ultimo score inviato di ogni fornitore alla fine del mese (`supplier_assessments.submitted_at`, `score`, solo `status = submitted`).
- **Copertura assessment %**: fornitori censiti a fine mese (`supplier_directory.created_at`) con almeno un assessment inviato.
- **Fornitori censiti** e **Fornitori a rischio** (ultimo score sotto 60).

Limiti / produzione:
- I fornitori archiviati non sono caricati, quindi spariscono anche dallo storico: per uno storico fedele salvare uno snapshot mensile (es. tabella `supply_chain_monthly_snapshots` con cron) invece di ricalcolare.
- I mesi senza assessment mostrano la linea interrotta/collegata (`connectNulls`).
- Con i dati demo Innovatech la curva parte dal mese di creazione del seed.

## Raccomandazioni per fornitori (portale + vista interna)
- Fonte unica: `supply_chain_recommendations` generate da `sc_compute_assessment` all'invio dell'assessment (solo campi neutrali: `gap_title`, `neutral_action`, `priority`, `rationale`; mai `service_name`/`commercial_status`).
- **Portale fornitore**: RPC `sc_my_recommendations()` (security definer, solo `authenticated`, filtra su `sc_my_supplier_id()` e ultimo assessment inviato). Sezione "Raccomandazioni per migliorare la tua postura" in `src/pages/SupplierPortal.tsx`.
- **Vista interna** (Sales/Super Admin/cliente): scheda fornitore → tab "Raccomandazioni" via `sc_supplier_gaps`.
- Componente condiviso `SupplierRecommendations.tsx`; logica in `src/features/supply-chain/recommendations.ts` (`buildSupplierInsights`): insight per fascia di score (<40 critica, <60 insufficiente, <80 discreta, ≥80 buona), conteggi per priorità, piano indicativo Alta 30 / Media 60 / Bassa 90 giorni (proposta, da confermare).
- Da fare in produzione: stato di avanzamento per raccomandazione lato fornitore (presa in carico / risolta con evidenza), notifica al cliente, ricalcolo score dopo riassessment.

## Anteprima portale fornitore (Super Admin)

- Nella tabella Fornitori ogni riga ha un'icona occhio (solo Super Admin, nascosta in "Vedi come Sales"). Apre in una nuova scheda `/supplier-portal/home?preview=<supplier_id>`.
- `PreviewPortal` (in `src/pages/SupplierPortal.tsx`) verifica `isSuperAdmin`, costruisce il contesto da `supplier_directory` + `organizations` e riusa lo stesso `Wizard` del fornitore con `ctx.preview = true`.
- In anteprima: sola lettura forzata, nessuna scrittura (profilo, risposte, invio bloccati), nessuna chiamata a `sc_start_assessment` (si legge l'ultimo assessment esistente). Raccomandazioni da `sc_supplier_gaps(_supplier)` invece di `sc_my_recommendations()`.
- Il portale (anche per il fornitore reale) mostra il nome dell'azienda committente nell'intestazione e una fascia che spiega che il programma è gestito da quell'azienda.
- "Scarica report PDF" (jsPDF, lato browser): punteggio, completamento, raccomandazioni con azione e motivo, disclaimer. Disponibile al fornitore e in anteprima.
- Produzione: l'anteprima si appoggia alle RLS del Super Admin; registrare l'apertura dell'anteprima in `supply_chain_audit_log` (evento `supplier_portal_previewed`).
