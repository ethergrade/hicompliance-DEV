

## Piano: Estensione Inventario Asset con sezione HiLog e Export Excel

### Obiettivo
Aggiungere alla pagina `/asset-inventory`:
1. **Export Excel** dell'inventario completo
2. **Nuova sezione "Consistenze HiLog"** con i campi richiesti (Syslog, IIS, Apache, SQL, Custom PATH, Endpoint sotto Log, Server sotto Log, DLP File Server Linux/Windows, SharePoint DLP con toggle si/no + quantita, Entra ID Microsoft con toggle si/no)
3. Persistenza nel DB (nuove colonne nella tabella `asset_inventory`)

---

### Step 1 -- Migrazione Database

Aggiungere le seguenti colonne alla tabella `asset_inventory`:

| Colonna | Tipo | Default |
|---|---|---|
| `hilog_syslog_count` | integer | 0 |
| `hilog_iis_count` | integer | 0 |
| `hilog_apache_count` | integer | 0 |
| `hilog_sql_count` | integer | 0 |
| `hilog_custom_path_count` | integer | 0 |
| `hilog_endpoint_count` | integer | 0 |
| `hilog_server_count` | integer | 0 |
| `hilog_dlp_linux_count` | integer | 0 |
| `hilog_dlp_windows_count` | integer | 0 |
| `hilog_sharepoint_dlp_enabled` | boolean | false |
| `hilog_sharepoint_dlp_count` | integer | 0 |
| `hilog_entra_id_enabled` | boolean | false |

Le RLS policies esistenti coprono gia INSERT/UPDATE/SELECT per organization_id, quindi non servono nuove policy.

---

### Step 2 -- Aggiornamento pagina `AssetInventory.tsx`

**2a. Aggiungere pulsante "Esporta Excel"** in cima alla pagina (accanto al titolo), usando la libreria `xlsx` gia installata. Il file esportera tutti i campi dell'inventario in un foglio Excel con nome del cliente.

**2b. Aggiungere interfaccia e stato** per i nuovi campi HiLog nel tipo `AssetInventoryData` e nello stato iniziale.

**2c. Nuova Card "Consistenze HiLog"** dopo la sezione IP/Subnet VA, con:
- Campi numerici: Syslog, IIS, Apache, SQL, Custom PATH, Endpoint sotto Log, Server sotto Log, DLP File Server Linux, DLP File Server Windows
- Toggle (Switch) SharePoint DLP si/no, con campo numerico quantita (visibile solo se abilitato)
- Toggle (Switch) Integrazione Entra ID Microsoft si/no

**2d. Aggiornare `handleSave`** per includere i nuovi campi nel payload e `loadData` per leggerli.

---

### Step 3 -- Aggiornamento `ClientAssetSheet.tsx`

Aggiungere gli stessi campi HiLog anche nel pannello laterale "Consistenze" usato dalla pagina `/clients`, mantenendo coerenza con la pagina principale.

---

### Dettagli tecnici

- La migrazione SQL aggiungera 12 nuove colonne con `ALTER TABLE asset_inventory ADD COLUMN ... DEFAULT ...`
- L'export Excel usera `xlsx.utils.json_to_sheet` per generare il file con tutti i campi formattati
- I toggle SharePoint DLP e Entra ID useranno il componente `Switch` di Radix UI
- Il campo quantita SharePoint DLP sara condizionalmente visibile in base al toggle

