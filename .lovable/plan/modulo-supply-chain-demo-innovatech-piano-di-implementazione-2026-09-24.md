# Modulo Supply Chain (demo Innovatech) — piano di implementazione

Implementazione del documento caricato, a fasi. Ogni fase si chiude con una verifica nell'anteprima prima di passare alla successiva. Tutti i dati si salvano nel database e restano dopo il ricaricamento della pagina: niente dati finti in memoria.

## Fase 1 — Database e sicurezza
- La rubrica fornitori esistente si arricchisce con i campi del documento: partita IVA, categoria, descrizione del servizio, criticità, stato, sito, paese, archiviazione.
- Nuovi archivi: utenti del portale fornitore, inviti, profilo tecnologico (le "consistenze"), le 20 domande, gli assessment, le risposte, le raccomandazioni, lo storico delle azioni.
- Le 20 domande light vengono caricate dal documento.
- Regole di accesso:
  - il cliente vede solo i propri fornitori;
  - il fornitore vede solo la propria scheda e il proprio assessment, mai le note interne né le opportunità;
  - le opportunità commerciali le vedono solo sales e super admin;
  - lo storico si può solo aggiungere, mai modificare o cancellare.
- Il punteggio viene calcolato dal database all'invio, non dal browser.

## Fase 2 — Pagina cliente "Supply Chain"
- Nuova voce di menu nel gruppo HiCompliance, subito dopo Consistenze. È visibile solo con Innovatech selezionata. Se si apre la pagina con un altro cliente compare "Modulo non disponibile per questa organizzazione".
- Tab:
  - **Dashboard:** indicatori e grafici.
  - **Fornitori:** tabella con filtri e azioni (modifica, invito, sospendi, riapri, archivia).
  - **Assessment:** elenco degli assessment con stato e punteggio.
  - **Opportunità:** solo per sales e super admin.
- Scheda del fornitore con cinque tab: Panoramica, Consistenze e tecnologie, Assessment light, Gap e azioni, Cronologia.
- Il tab fornitori di Incident Response usa la stessa rubrica e rimanda al nuovo modulo. Oggi quel tab non salva nulla: con questa fase inizia a salvare.

## Fase 3 — Inviti e portale fornitore
- Un'operazione lato server gestisce gli inviti. Due modalità: "Invia email" oppure "Genera link", con il link mostrato una sola volta.
- Non si salvano mai token o link di accesso in chiaro.
- Portale separato, senza la barra laterale della console: accesso, attivazione con password personale, home, profilo tecnologico, assessment a step e riepilogo finale prima dell'invio.
- Un indirizzo email già usato da un utente della console viene rifiutato.

## Fase 4 — Punteggio, gap e dati demo
- Fasce di punteggio: 80–100 Buono, 60–79 Da rafforzare, 40–59 Rischio significativo, 0–39 Critico.
- Sotto il punteggio compare sempre la dicitura "non costituisce certificazione".
- Le raccomandazioni nascono da regole fisse legate ai gap. Il cliente vede azioni neutre, senza nomi di servizi HiSolution; sales e super admin vedono il servizio suggerito.
- Vengono caricati alcuni fornitori demo per Innovatech, con stati diversi: completato, in corso, invitato, non invitato.

## Fase 5 — Verifica
- Prova completa nell'anteprima:
  1. creo un fornitore;
  2. genero l'invito;
  3. attivo l'account fornitore;
  4. compilo profilo e assessment;
  5. controllo punteggio e gap lato cliente;
  6. controllo che il fornitore non veda i dati di un altro fornitore né le opportunità.

## Da sapere
- La modalità Stage resta attiva e non blocca questo modulo.
- L'invio email reale dipende dal servizio email di Supabase già configurato. Se non consegna, si può usare "Genera link".

## Dettagli tecnici
- Migrazione: ALTER idempotente su `supplier_directory` + 8 tabelle con GRANT, RLS e trigger `updated_at`. Funzioni security definer: `is_supplier_user`, `supplier_org_id`, `submit_supplier_assessment`, che calcola score, risk_band e raccomandazioni.
- Edge function `supply-chain-invite`: valida il JWT del chiamante e usa `inviteUserByEmail` oppure `generateLink({type:'invite'})` con service role solo lato server.
- Frontend:
  - `src/features/supply-chain/` con api, hook TanStack Query e componenti;
  - route `/supply-chain` e `/supplier-portal/*` in `App.tsx`, protette da `SupplierPortalGuard`;
  - aggiornamento di `AppSidebar`, `permissions/catalog.ts` e `usePermissions`;
  - riscrittura di `useSupplierDirectory` e `SupplierDirectoryTab` su Supabase.
- AuthProvider: `/supplier-portal` escluso dai redirect della console.
