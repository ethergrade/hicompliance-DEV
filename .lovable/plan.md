# Asset Management per cliente in HiConsole (con collegamento HaloPSA facoltativo)

## Obiettivo
Un vero registro asset per ogni cliente, costruito sui 27 campi del file Excel AKC. Se il cliente usa HaloPSA, gli asset si importano e si aggiornano da Halo. Se non lo usa, gli asset si gestiscono a mano (inserimento, modifica, import Excel).

## Cosa vedrà l'utente
- Nuova pagina "Asset Management" nella sezione Generale del menu, sempre legata al cliente selezionato.
- Tabella asset con filtri per colonna, ricerca, raggruppamento per tipo, stato o assegnatario, e paginazione. In cima gli asset con contratto o garanzia in scadenza.
- Scheda asset laterale divisa in sezioni: Identificazione, Assegnazione, Acquisto e contratto, Garanzia, Documento di trasporto (DDT), Note e sito. Salvataggio automatico dopo 1,5 secondi.
- Contatori in alto: totale, assegnati, disponibili, da riparare o dismettere, valore totale, scadenze entro 180 giorni.
- Liste configurabili per cliente: Tipo asset, Stato, Tipo acquisto, Fornitori, Assegnatari (persone, Magazzino IT, sale riunioni). Valori iniziali presi dal foglio "Variabili".
- Import ed export Excel con le stesse colonne del file AKC.
- Tab "Collegamento HaloPSA": indirizzo Halo, client ID, ID cliente Halo, test connessione, sincronizzazione manuale e ultima sincronizzazione.
- Report scadenze: soglia di anticipo modificabile (default 180 giorni), elenco "dal–al", email settimanale ai destinatari scelti.

## Campi (dal file Excel)
Internal Code (progressivo 001–999 per cliente, automatico), Asset Number, Asset Type*, Model*, Name, Serial Number*, Status*, Status Cliente, PIN, PUK, Assignee*, Date of assign, Purchase type, Contract number, Start/End contract date, Asset cost* (con valore "N/D"), Warranty type, Warranty cost, Warranty start/expiration, DDT number, DDT date, Supplier*, Note, Sito.
(* = obbligatorio come da file)

PIN e PUK sono dati sensibili: vengono mascherati in tabella e visibili solo a chi ha il permesso di modifica.

## Collegamento con HaloPSA
```text
Cliente HiConsole ──(halo_client_id)──> Cliente Halo
        │
  Sincronizza (manuale + ogni notte)
        │
  GET /api/Asset?client_id=...  ──> mappatura campi
        │                         (campi standard + custom field CFAS*)
  upsert su chiave halo_asset_id
```
- Ogni cliente HiConsole ha un campo "ID cliente Halo". Per sceglierlo si apre un elenco dei clienti Halo (`GET /api/Client`) con ricerca per nome.
- Mappatura: i campi standard Halo (inventory number, type, serial, status, site, user) e i custom field indicati nell'Excel (CFASInternalCode, CFASsetType, CFASModelCustomer, CFASName, CFASerialNumber, CFStatus_Cliente, eccetera) vengono letti con nomi configurabili, perché "Asset Number" nel file è ancora "???".
- Ogni asset ha un'origine (Halo o Manuale). Per gli asset Halo i campi importati sono in sola lettura, così Halo resta la fonte principale. Note e campi non presenti in Halo restano modificabili.
- Prima fase in sola lettura (Halo → HiConsole). La scrittura verso Halo arriva in una fase successiva.
- Le credenziali Halo (client secret) restano solo sul server, mai nel browser.

## Dettagli tecnici
- Database Supabase:
  - `managed_assets` con i 27 campi più organization_id, source (manual/halo), halo_asset_id, last_synced_at e un indice unico su (organization_id, internal_code);
  - `asset_lookup_values` per le liste di ogni cliente;
  - `asset_halo_links` con l'URL Halo, halo_client_id, l'ultima sincronizzazione e l'esito;
  - `asset_expiry_settings` con soglia in giorni, destinatari e flag attivo.
  - Policy di accesso basate su organization_id, come nel resto dell'app. Sales e super admin possono modificare, il cliente vede e modifica il proprio registro.
- Server: funzioni `halo-asset-sync` (token OAuth client credentials, paginazione, upsert) e `asset-expiry-report` (settimanale con pg_cron, rispetta la modalità Stage).
- Secret: `HALO_CLIENT_ID`, `HALO_CLIENT_SECRET`, `HALO_BASE_URL`. Per ora un'unica istanza Halo (quella HiSolution) con mappatura per cliente.
- Invio email: richiede un dominio email configurato. Senza dominio il report resta consultabile in app.
- Il report scadenze generato entra anche nella Gestione Documenti.
- La pagina esistente "Inventario Asset" (consistenze numeriche) resta com'è. Da quella nuova si può mostrare un riepilogo dei conteggi.

## Fasi
1. Database, liste e pagina con gestione manuale, import ed export Excel.
2. Scadenze: vista, impostazioni e cron email.
3. Collegamento HaloPSA: secret, scelta del cliente Halo, sincronizzazione in lettura.
4. Dati demo su Innovatech e verifica completa.

## Da confermare
- Credenziali API Halo (URL dell'istanza, client ID e secret con scope di lettura asset).
- A quale campo Halo corrisponde "Asset Number".
- Dominio mittente per le email delle scadenze.
