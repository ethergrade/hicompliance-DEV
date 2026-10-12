# Asset Management: collegamento HiTrack, modifica, tag, gruppi e flag

## Cosa vedrà l'utente
- **Origine HiTrack:** se un asset del registro è anche in HiTrack, la colonna "Origine" mostra "HiTrack" accanto a "Halo" o "Manuale". Un asset può avere più origini.
- **Semaforo disponibilità:** per gli asset collegati a HiTrack, un pallino verde (Up), giallo (attenzione) o rosso (Down) e grigio (sconosciuto), con l'ora dell'ultimo cambio di stato. Si può filtrare per semaforo.
- **Info HiTrack nella scheda asset:** nuova sezione "HiTrack" con gli stessi dati della pagina HiTrack per quel dispositivo: tipo, IP, stato, latenza (peggiore e mediana), perdita pacchetti, sede, marca, modello, sistema operativo e ultimo cambio di stato. Se HiTrack ha anche dischi e RAM per quel dispositivo, li mostra. Un pulsante apre HiTrack.
- **Clic sul nome:** nella tabella il nome dell'asset diventa un link che apre la scheda in modifica. Si possono modificare gli asset creati da sé. Super admin e commerciali possono modificare tutti. Gli altri asset si aprono in sola lettura. Per gli asset Halo restano bloccati i campi che arrivano da Halo.
- **Tag:** si scrivono liberamente nella scheda, con suggerimenti dai tag già usati nel cliente. Sono filtrabili in tabella.
- **Gruppi:** ogni utente crea la propria lista di gruppi, per esempio "Ufficio Milano" o "Da rinnovare". Si gestisce in una nuova tab "Gruppi" e ogni asset si può mettere in uno o più gruppi. Un filtro "Gruppo" mostra solo gli asset di quel gruppo.
- **Flag:** una bandierina colorata (rosso, arancio, giallo, verde, blu) con una nota facoltativa. Si attiva dalla tabella con un clic oppure dalla scheda. C'è un filtro "Solo con flag" e gli asset con flag stanno in cima, dopo quelli in scadenza.

## Come si riconosce lo stesso asset in HiTrack
L'asset del registro e il dispositivo HiTrack si collegano in questo ordine:
1. collegamento scelto a mano nella scheda ("Collega a dispositivo HiTrack", con un elenco dei dispositivi del cliente);
2. stesso indirizzo IP;
3. stesso nome (senza differenze tra maiuscole e minuscole), confrontato con nome, codice inventario e Asset Number.

Il collegamento trovato in automatico si può confermare o togliere. I dati HiTrack si leggono quando apri la pagina, non vengono copiati nel registro: così semaforo e metriche sono sempre quelli attuali.

## Limite da sapere
I dati HiTrack su questo ramo arrivano dal server HiConsole precedente. Oggi sono disponibili solo i dati demo di Innovatech. Per i clienti reali, come AKC, origine e semaforo compaiono solo quando quel server risponde, oppure quando HiTrack viene portato su Supabase come gli altri moduli. Senza dati HiTrack la pagina funziona come oggi, senza errori.

## Dettagli tecnici
- **Database (migrazione):**
  - `managed_assets`: nuove colonne `created_by uuid`, `tags text[]`, `flag_color text`, `flag_note text`, `hitrack_device_id text`, `hitrack_link_mode text` (manual/auto), `ip_address text`.
  - Il trigger imposta `created_by = auth.uid()` all'inserimento.
  - Nuova tabella `asset_groups` con id, organization_id, owner_user_id e name, unica per (owner, organization, name).
  - Nuova tabella `asset_group_members` con group_id e asset_id.
  - Accesso: i gruppi li vede e gestisce solo chi li ha creati, all'interno di un cliente a cui ha accesso.
- **Permesso di modifica:** RLS UPDATE/DELETE su `managed_assets` consentito se `created_by = auth.uid()`, se l'utente è super_admin o sales, oppure se l'asset è di origine Halo (per i soli campi locali). Lettura invariata per chi accede al cliente. La UI usa la stessa regola per decidere tra modifica e sola lettura.
- **Frontend:**
  - `useHiTrackDashboard` riusato nella pagina Asset Management.
  - Funzione `matchHiTrack(assets, devices, disks, ram)` che restituisce mappa asset → dispositivo, con origine del match.
  - Componenti nuovi: `AvailabilityDot`, `HiTrackPanel` (scheda), `TagInput`, `FlagButton`, tab `GroupsTab`.
- Gli asset Halo con IP restano modificabili solo nei campi locali (tag, flag, gruppi, note, IP, collegamento HiTrack).
- Verifica con Playwright su Innovatech, dove ci sono asset demo e HiTrack demo, aggiungendo alcuni asset demo con nome/IP uguali a dispositivi HiTrack demo. Poi su AKC per controllare che, senza HiTrack, tag, flag, gruppi e modifica funzionino.
