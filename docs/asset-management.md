# Asset Management HiConsole – Documento per il DEV (porting in produzione)

Ultimo aggiornamento: 12/10/2026 (aggiunta modifica multipla).
Stato: prototipo funzionante sul ramo PROTOTIPO (Supabase `hcllvyzhefcqftesahnv`).
Scopo: descrivere tutto ciò che serve per portare l'Asset Management in produzione: dati, sicurezza, integrazioni HaloPSA e HiTrack, UI, test e attività mancanti.

---

## 1. Obiettivo e perimetro

- Registro asset **per cliente** (organization), separato da "Inventario Asset" (consistenze numeriche usate da IRP/HiLog). Le due cose non vanno unite.
- Funziona **anche senza HaloPSA**: gestione manuale completa (crea, modifica, elimina, import/export Excel).
- Se il cliente ha HaloPSA: sincronizzazione **in sola lettura** Halo -> HiConsole tramite funzione server `halo-asset-sync`. Le credenziali Halo non arrivano mai al browser.
- Se l'asset è presente in HiTrack: origine "HiTrack", dettagli di monitoraggio e semaforo di disponibilità (Up / Attenzione / Down / Sconosciuto).
- Funzioni utente: tag, flag colorati con nota, gruppi personali, filtri, scadenze contratto/garanzia.
- Colonne derivate dal file cliente `2024-03-22_-_AKC_-_Requisiti_Asset_Management_v.1.xlsx`.

## 2. File coinvolti

| Area | File |
|---|---|
| Pagina | `src/pages/AssetManagement.tsx` (route `/asset-management`, protetta da `ClientSelectionGuard` in `src/App.tsx`) |
| Componenti extra | `src/components/asset-management/AssetExtras.tsx` (match HiTrack, semaforo, flag, tag, pannello HiTrack) |
| Modifica multipla | `src/components/asset-management/BulkEditBar.tsx` (tag, gruppi, persona, location su piu asset) |
| API client | `src/lib/api/managed-assets.ts` (CRUD, lookup, gruppi, scadenze, chiamata funzione Halo) |
| Funzione server | `supabase/functions/halo-asset-sync/index.ts` |
| Migrazioni | `supabase/migrations/20261012095328_*.sql` (tabelle base), `supabase/migrations/20261012104327_*.sql` (autore, tag, flag, HiTrack, gruppi, policy) |
| Sidebar | voce in sezione Generale (`AppSidebar.tsx`, `src/config/moduleVisibility.ts`) |

## 3. Modello dati

### 3.1 `managed_assets` (registro asset)

Colonne Excel AKC (ordine di import/export, * = obbligatoria nel file):

| Campo DB | Intestazione Excel | Note |
|---|---|---|
| internal_code * | Internal Code | progressivo `001, 002…` per organizzazione, univoco `(organization_id, internal_code)` |
| asset_number * | Asset Number | |
| asset_type * | Asset Type | lista configurabile |
| model * | Model | |
| name | Name | |
| serial_number * | Serial Number | |
| status * | Status | lista configurabile, default `New` |
| status_cliente | Status Cliente | |
| pin / puk | PIN / PUK | mascherati in UI. **In produzione cifrare** (vedi par. 8) |
| assignee * | Assignee | lista configurabile |
| date_of_assign | Date of assign | date |
| purchase_type | Purchase type | Noleggio / Acquisto |
| contract_number, start_contract_date, end_contract_date | Contract … | `end_contract_date` usata per scadenze |
| asset_cost * / asset_cost_nd | Asset cost | se costo non noto: `asset_cost_nd = true` (mostrato "N/D") |
| warranty_type, warranty_cost, warranty_start_date, warranty_expiration | Warranty … | `warranty_expiration` usata per scadenze |
| ddt_number, ddt_date | DDT … | |
| supplier * | Supplier | lista configurabile |
| note | Note | |
| site | Sito | |

Colonne tecniche:

| Campo | Uso |
|---|---|
| organization_id | tenant (obbligatorio) |
| source | `manual` oppure `halo` |
| halo_asset_id, last_synced_at | chiave di upsert Halo; indice univoco parziale `(organization_id, halo_asset_id)` |
| created_by | default `auth.uid()`; determina chi può modificare |
| tags `text[]` | tag liberi |
| flag_color, flag_note | flag (colori definiti in `FLAG_COLORS`) |
| hitrack_device_id, hitrack_link_mode | collegamento HiTrack (`manual`, `ip`, `name`) |
| ip_address | usato per il match HiTrack |
| created_at, updated_at | trigger `update_updated_at_column` |

### 3.2 Tabelle di supporto

| Tabella | Scopo | Chiave |
|---|---|---|
| `asset_lookup_values` | valori delle liste (asset_type, status, purchase_type, supplier, assignee) per cliente. Se vuota si usano i default `DEFAULT_LOOKUPS`; alla prima modifica i default vengono materializzati | univoco `(organization_id, kind, value)` |
| `asset_halo_links` | collegamento cliente HiConsole <-> cliente Halo: `halo_client_id`, `halo_client_name`, `field_mapping` jsonb, esito ultima sync | PK `organization_id` (1 cliente Halo per organizzazione) |
| `asset_expiry_settings` | preavviso scadenze (`lead_days` default 180), destinatari, abilitazione | PK `organization_id` |
| `asset_groups` | gruppi **personali** per utente e cliente | univoco `(owner_user_id, organization_id, name)` |
| `asset_group_members` | asset nei gruppi | PK `(group_id, asset_id)`, cascade su entrambi |

## 4. Sicurezza e permessi (RLS)

Isolamento tenant tramite la funzione esistente `public.doc_can_access_org(organization_id)` (la stessa della Gestione Documentale).

| Tabella | Lettura | Inserimento | Modifica | Eliminazione |
|---|---|---|---|---|
| managed_assets | utenti del cliente | utenti del cliente | autore **oppure** asset Halo **oppure** super_admin / sales | autore oppure super_admin / sales |
| asset_lookup_values, asset_halo_links, asset_expiry_settings | utenti del cliente | idem | idem | idem |
| asset_groups / members | solo proprietario | solo proprietario | solo proprietario | solo proprietario |

Regole applicative (in UI, da replicare lato server in produzione):
- Asset Halo: i campi sincronizzati sono in sola lettura; modificabili solo tag, flag, gruppi, collegamento HiTrack, note interne.
- Asset senza autore (seed/import storici): modificabili solo da super_admin/sales.
- `managedAssetsApi.update` rimuove sempre `id`, `organization_id`, `source`, `created_by` dal payload.

## 5. Integrazione HaloPSA (sola lettura)

### 5.1 Secret backend
`HALO_BASE_URL`, `HALO_CLIENT_ID`, `HALO_CLIENT_SECRET` (già impostati sul progetto Supabase; in produzione impostarli sull'istanza di destinazione). Il client Halo deve avere solo permessi di lettura.

### 5.2 Funzione `halo-asset-sync`
Chiamata dal browser con `supabase.functions.invoke("halo-asset-sync", { body: { action, organization_id, search } })`. Verifica il token utente, poi:

| action | Cosa fa |
|---|---|
| `test` | prova il token OAuth (`POST {base}/auth/token`, client_credentials) |
| `clients` | elenca clienti Halo (`GET /api/Client?pageinate=true&page_size=50&search=`) per il collegamento |
| `sync` | legge `asset_halo_links` con il token utente (quindi rispetta RLS), poi con service role pagina `GET /api/Asset?client_id=…&page_size=50` (max 50 pagine) e per ogni asset `GET /api/Asset/{id}?includedetails=true` (10 in parallelo) |

Mappatura Halo -> HiConsole (custom field prima, campo standard come fallback):

| Campo HiConsole | Halo |
|---|---|
| asset_number | `CFASAssetNumber` (configurabile in `field_mapping.asset_number`), poi `CFnumerazioneas` |
| asset_type | `CFASsetType`, poi `assettype_name` |
| model | `CFASModelCustomer`, poi `model` |
| name | `CFASName`, `CFtitolo`, `inventory_number`, poi `"{tipo} #{device_number}"` |
| serial_number | `CFASerialNumber`, poi `key_field2` |
| status | `status_name` |
| status_cliente | `CFStatus_Cliente`, poi `CFstato` |
| assignee | primo `users[].name`, poi `username` |
| site / supplier | `site_name` / `supplier_name` |

Regole di sync:
- Upsert per `halo_asset_id`: asset esistenti mantengono `id` e `internal_code`; nuovi ricevono il prossimo progressivo.
- Ripetibile senza duplicati (verificato su AKC: 119 asset, 2 sync consecutive).
- I custom field di tipo password **non** vengono importati.
- Esito salvato in `asset_halo_links.last_sync_*`.
- Asset eliminati in Halo **non** vengono eliminati in HiConsole (da decidere: vedi par. 8).

### 5.3 Dati verificati (cliente reale)
- Halo client 265 = AKC, collegato al cliente HiConsole "AKC".
- Distribuzione: Notebook 72, PBX 28, Switch 6, Main System Chassis 5, Virtual Machine 5, Desktop 2, altro 1.
- Licenze: Halo non ne restituisce per AKC (endpoint licenze non ancora integrato).
- Molti campi (seriale, modello, assegnatario, fornitore) sono vuoti in Halo: è un dato sorgente, non un errore di mapping.

## 6. Integrazione HiTrack

- Match calcolato in `matchHiTrack(assets, devices)` con priorità: collegamento **manuale** (`hitrack_device_id`) -> **IP** (`ip_address`) -> **nome** (case-insensitive).
- Se c'è match: badge origine "HiTrack", pannello dettagli (`HiTrackPanel`) con le stesse informazioni visibili in HiTrack e semaforo `availabilityOf()`:
  - Up = online, Attenzione = degradato/alert, Down = offline, Sconosciuto = nessun dato.
- L'utente può collegare/scollegare manualmente un device dal pannello.
- **Stato attuale:** i dati HiTrack sono demo e solo per Innovatech (3 match di esempio, es. CAM-ENTRY-01). In produzione collegare la fonte reale HiTrack mantenendo la stessa interfaccia `HiTrackMonitoredDevice`.

## 7. Funzioni UI

- Tabella con tutte le colonne Excel (scroll orizzontale), ricerca, filtri per tipo/stato/assegnatario/fornitore/origine/disponibilità/gruppo/tag/flag, paginazione.
- Clic sul nome asset: apre la scheda laterale, modificabile se l'utente ha i permessi, altrimenti in sola lettura.
- Import Excel (stesse intestazioni del file AKC, upsert su `internal_code`) ed export Excel.
- Liste configurabili per cliente (aggiunta/rimozione valori).
- Scadenze: `nearestExpiry` = minimo tra fine contratto e fine garanzia; evidenza in tabella sotto `lead_days`.
- Tag con suggerimenti, flag colorati con nota, gruppi personali (crea, rinomina, elimina, assegna).
- Modifica multipla: selezione righe (anche tutti i filtrati) e barra azioni per tag, gruppi, persona assegnataria e location (dettagli al par. 11).
- Pannello Halo: test connessione, ricerca e collegamento cliente Halo, "Sincronizza ora", esito ultima sync.

## 8. Checklist per la produzione

### Obbligatorie
1. Applicare le due migrazioni nell'ordine indicato sull'istanza di produzione (verificare che `doc_can_access_org`, `has_role`, `update_updated_at_column` esistano).
2. Impostare i secret Halo di produzione e deployare `halo-asset-sync`.
3. **Restringere** le modifiche a `asset_halo_links` (e l'azione `sync`/`clients`) a super_admin e sales: oggi qualsiasi utente del cliente può modificare il collegamento.
4. **Cifrare PIN/PUK** (es. Supabase Vault o colonna cifrata lato server) e mostrarli solo a ruoli autorizzati con audit di lettura.
5. Proteggere lato DB i campi Halo sincronizzati (trigger che blocca la modifica di quei campi quando `source = 'halo'`, salvo service role). Oggi il blocco è solo in UI.
6. `list()` legge senza paginazione: oltre 1000 asset Supabase tronca. Implementare paginazione server o `range()`.
7. Sostituire i dati demo HiTrack con la fonte reale; rimuovere i mock Innovatech in produzione.
8. Audit log su creazione/modifica/eliminazione asset e sulle sync (riusare il pattern `integration_audit_logs`).

### Consigliate
9. Sync pianificata (es. notturna) rispettando la modalità Stage (`platform_runtime_settings`) e un lock per evitare sync concorrenti.
10. Cache del token OAuth Halo e gestione rate limit/429 con retry.
11. Politica per asset rimossi in Halo: marcare `status = 'Disposed of'` o flag "non più in Halo" invece di eliminare.
12. Integrazione licenze Halo (`/api/SoftwareLicence` o equivalente da verificare sul tenant).
13. Invio notifiche scadenze: le impostazioni esistono (`asset_expiry_settings`) ma l'invio email **non è implementato**.
14. Validazione import Excel: date, numeri, valori fuori lista, report righe scartate.
15. RPC transazionale per la modifica multipla con audit (par. 11), al posto degli aggiornamenti uno per asset.
16. Indici: `managed_assets(organization_id)`, GIN su `tags`, `(organization_id, ip_address)`.

## 9. Criteri di accettazione

- Un utente del cliente A non vede né modifica asset, liste, gruppi o collegamenti del cliente B.
- Un cliente senza Halo può creare, modificare, eliminare, importare ed esportare asset.
- La sync Halo importa tutti gli asset del cliente collegato, è ripetibile senza duplicati e non modifica `internal_code` esistenti.
- Nessuna credenziale Halo è visibile nel browser o nelle risposte di rete.
- I campi Halo non sono modificabili (UI e DB); tag, flag e gruppi lo sono.
- Un utente modifica solo i propri asset manuali; super_admin e sales modificano tutto.
- I gruppi sono visibili solo al proprietario.
- Un asset collegato a HiTrack mostra origine, dettagli e semaforo coerenti con HiTrack.
- Export Excel ha le stesse colonne e lo stesso ordine del file AKC e può essere reimportato senza perdite.
- PIN/PUK cifrati a riposo e mascherati per default.
- La modifica multipla aggiorna tutti gli asset selezionati consentiti, salta quelli non modificabili e non cambia persona/location degli asset Halo, riportando il conteggio di aggiornati e saltati.

## 10. Test manuali suggeriti

1. Cliente demo Innovatech: 28 asset demo, match HiTrack su CAM-ENTRY-01 con semaforo Up, crea gruppo e assegna asset, imposta flag.
2. Cliente AKC: collegato a Halo 265, "Sincronizza ora" due volte -> totale invariato (119).
3. Utente cliente (non sales): prova a modificare un asset Halo o di un altro utente -> negato.
4. Seleziona 5 asset manuali + 1 Halo, assegna persona e location: 5 aggiornati, 1 saltato; aggiungi tag e gruppo: 6 aggiornati.
5. Import del file Excel AKC e successivo export -> colonne identiche.

## 11. Modifica multipla (bulk edit)

File: `src/components/asset-management/BulkEditBar.tsx`, integrata in `AssetManagement.tsx`.

- Casella di selezione per riga e "seleziona tutti i filtrati" in intestazione (seleziona tutti i risultati del filtro, non solo la pagina).
- Barra fissa con azioni: aggiungi tag, rimuovi tag, aggiungi a gruppo, togli dal gruppo, assegna a persona (`assignee`, imposta `date_of_assign` a oggi se cambia), imposta location (`site`).
- Suggerimenti: persone da lista "assignee" + valori presenti; location e tag dai valori esistenti.
- Regole: asset non modificabili dall'utente vengono saltati; su asset Halo assegnatario e location sono sincronizzati e non vengono toccati (tag e gruppi sì). Il messaggio finale indica aggiornati e saltati.
- Produzione: oggi gli aggiornamenti sono uno per asset dal browser. Per volumi grandi creare una RPC `bulk_update_managed_assets(ids uuid[], patch jsonb)` che applichi le stesse regole lato DB in un'unica transazione e scriva l'audit.
