# Supply Chain – visibilità per ruolo

- **Sales**: vede Dashboard, Fornitori, Assessment e "Gap e rischi filiera" (matrice criticità × score, rischi potenziali, gap per fornitore con azione consigliata neutrale, gap più diffusi). Non vede opportunità commerciali né servizi suggeriti; in dashboard vede la card "Esposizione della filiera".
- **Super Admin**: vede tutto, incluso il tab "Opportunità". Il tasto "Vedi come Sales" simula la vista Sales solo nell'interfaccia (permessi reali invariati, si azzera uscendo dalla pagina).
- I dati arrivano da `sc_org_gaps`, `supplier_assessments`, `supplier_directory`; le raccomandazioni (`supply_chain_recommendations`) vengono richieste solo se l'utente è super admin e non in modalità Sales.

## Da fare in produzione
- Restringere la RLS di `supply_chain_recommendations` a solo super admin: oggi i Sales potrebbero leggerla interrogando direttamente il DB.
