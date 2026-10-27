# Supply Chain: taglio business per Sales + "Vedi come Sales" per Super Admin

## Obiettivo
Nella pagina Supply Chain (Innovatech) il profilo Sales non deve vedere opportunità commerciali HiSolution, ma una lettura business del rischio di filiera. Il Super Admin può attivare con un tasto la stessa vista del Sales.

## Vista Sales (e Super Admin in modalità "Vedi come Sales")
- Rimossi: tab "Opportunità", card "Opportunità commerciali", servizi suggeriti, stato commerciale. I dati commerciali non vengono neppure caricati.
- Nuovo tab "Gap e rischi filiera" al posto di "Opportunità":
  - Matrice rischio: criticità del fornitore x score assessment (fornitori critici con score basso in evidenza).
  - Rischi potenziali: fornitori critici/alti senza assessment, inviti scaduti o in attesa, assessment non completati, score sotto 60.
  - Gap per fornitore: elenco gap (titolo, priorità, azione consigliata neutrale), ordinati dal più grave, con filtro per priorità e fornitore.
  - Gap più diffusi nella filiera, con numero di fornitori coinvolti.
- Dashboard: al posto della card opportunità, card "Esposizione della filiera" (fornitori critici a rischio, gap ad alta priorità aperti, copertura assessment %).
- Tutti i dati vengono dai gap e dagli assessment già calcolati: niente valori inventati.

## Vista Super Admin
- Vede tutto come oggi (incluso il tab Opportunità) più il nuovo tab Gap e rischi.
- Tasto "Vedi come Sales" nell'intestazione: nasconde tutto ciò che il Sales non vede e mostra un banner "Stai vedendo la pagina come Sales" con "Esci". Vale solo in questa pagina e si azzera al cambio pagina.
- È solo una simulazione di interfaccia: i permessi reali restano quelli del Super Admin.

## Dettagli tecnici
- `src/pages/SupplyChain.tsx`: stato `viewAsSales` (visibile solo se `isSuperAdmin`); `canSeeCommercial = isSuperAdmin && !viewAsSales`; la query delle raccomandazioni parte solo con `canSeeCommercial`.
- Nuovo componente `src/features/supply-chain/components/SupplyChainRiskTab.tsx` alimentato da `sc_org_gaps`, assessment e anagrafica fornitori già caricati.
- Le raccomandazioni commerciali restano leggibili dai Sales a livello DB (RLS invariata): nota nel doc DEV per restringerle a solo super admin in produzione.
- Aggiornare la documentazione Supply Chain in `docs/` con la nuova regola di visibilità.
