

# Piano: Modulo "Consistenze" Completo con Integrazione IRP

## Panoramica

Creare un nuovo modulo **Consistenze** con 5 aree tematiche (UCC, Security, Connessioni e Fonia, Networking, IT), tabelle dinamiche editabili, KPI automatici, export Excel, e integrazione con il motore di rischio IRP. Il modulo si integra nella sidebar sotto HiCompliance e riutilizza l'architettura multi-tenant esistente (organization_id + RLS).

---

## FASE 1 -- Database (3 migrazioni)

### Migrazione 1: Tabelle Core

```text
consistenze_clienti
  - id (uuid PK)
  - organization_id (uuid, ref organizations)
  - nr_sedi (integer, default 0)
  - nr_interni_telefonici (integer, default 0)
  - descrizione_telefoni (text)
  - nr_canali_fonia (integer, default 0)
  - note_generali (text)
  - created_by (uuid)
  - updated_by (uuid)
  - created_at / updated_at (timestamptz)

consistenze_items
  - id (uuid PK)
  - organization_id (uuid, ref organizations)
  - area (text: UCC, SECURITY, CONN_FONIA, NETWORKING, IT)
  - categoria (text)
  - tecnologia (text)
  - fornitore (text)
  - quantita (integer, default 0)
  - scadenza (date, nullable)
  - metriche_json (jsonb, default '{}')
  - created_by (uuid)
  - updated_by (uuid)
  - created_at / updated_at (timestamptz)
```

RLS policies: stesse pattern esistenti (`organization_id IN (SELECT ...)` per client, `can_manage_all_organizations()` per sales/admin). Trigger `update_updated_at_column` su entrambe.

### Migrazione 2: Tabelle IRP Integration

```text
asset_irp
  - id (uuid PK)
  - organization_id (uuid)
  - consistenza_item_id (uuid, ref consistenze_items, nullable)
  - area (text)
  - categoria (text)
  - tecnologia (text)
  - fornitore (text)
  - quantita (integer)
  - esposizione_score (numeric, default 0)
  - criticita_score (numeric, default 0)
  - superficie_score (numeric, default 1)
  - rischio_intrinseco (numeric, default 0)
  - rischio_residuo (numeric, default 0)
  - last_sync_from_consistenze (timestamptz)
  - created_at / updated_at (timestamptz)

irp_history
  - id (uuid PK)
  - organization_id (uuid)
  - irp_score (numeric)
  - area_scores_json (jsonb)
  - snapshot_date (timestamptz, default now())
```

Stesse RLS policies multi-tenant.

### Migrazione 3: Funzione DB per calcolo rischio

Funzione SQL `calc_risk_intrinseco(esposizione, criticita, superficie)` che applica la formula `min((esposizione * criticita * superficie) * 4, 100)`.

---

## FASE 2 -- Pagina Consistenze (nuova route `/consistenze`)

### 2a. Nuova pagina `src/pages/Consistenze.tsx`

Struttura a tab con 6 linguette:

- **Overview** -- Riepilogo KPI per area, conteggio item, rischio medio, asset piu critico
- **UCC** -- Campi generali (Nr Sedi, Nr Canali, Nr Interni, Descrizione Telefoni) + tabella dinamica (Categoria, Tecnologia, Fornitore, Quantita, Scadenza, Nr Canali, Nr Interni)
- **Security** -- Nr Sedi + tabella (Categoria, Tecnologia, Fornitore, Scadenza, Client/Utenti, Server Fisici, Server Virtuali, IP Pubblici, VPN, Dispositivi Mobili)
- **Connessioni e Fonia** -- Nr Sedi, Nr Interni, Descrizione Telefoni + tabella (Categoria, Tecnologia, Fornitore, Banda, Quantita, Scadenza)
- **Networking** -- Nr Sedi + tabella (Categoria, Tecnologia, Fornitore, Quantita, Scadenza)
- **IT** -- Nr Sedi + tabella (Categoria, Tecnologia, Fornitore, Quantita, Scadenza)

### 2b. Componenti condivisi

- `ConsistenzeAreaTable.tsx` -- Tabella dinamica riusabile con aggiunta/rimozione righe, editing inline, debounced auto-save
- `ConsistenzeOverview.tsx` -- Dashboard KPI con card per area
- `ConsistenzeKPICards.tsx` -- Calcolo KPI automatici per area (es. "Interni per sede", "Server per sede", "Banda per utente")

### 2c. Categorie predefinite per area

Ogni tab propone categorie suggerite (dropdown) ma permette anche testo libero:

- **UCC**: Centralino, SBC, Gateway, Licenze
- **Security**: Firewall, EDR, SIEM, MDR, Email Security, Backup
- **Conn e Fonia**: FTTC, FTTH, MPLS, 4G Backup, SIP Trunk
- **Networking**: Switch centro stella, Access Switch, Access Point, Router
- **IT**: Server, PC, Notebook, Stampanti, NAS, Storage, Hypervisor

### 2d. Logica di salvataggio

- Dati generali cliente (nr_sedi, ecc.) salvati in `consistenze_clienti` (1 record per organization)
- Ogni riga della tabella salvata come record in `consistenze_items`
- Auto-save con debounce 1.5s (pattern esistente come CriticalInfrastructureManager)
- Badge stato salvataggio ("Salvando..." / "Salvato")

### 2e. Export

- Pulsante "Esporta Excel" che genera un file XLSX con un foglio per area + foglio Overview KPI
- Usa libreria `xlsx` gia installata

---

## FASE 3 -- Integrazione IRP e Risk Engine

### 3a. Hook `useConsistenzeRisk.ts`

- Quando un item viene salvato/aggiornato in `consistenze_items`, sincronizza verso `asset_irp`
- Calcola automaticamente i punteggi di rischio per area usando le regole definite nei documenti:
  - **Esposizione** (0-5): basato su IP pubblici, VPN, accessi remoti
  - **Criticita** (0-5): basato su tipo asset e impatto business
  - **Superficie Attacco** (1-3): basato su quantita e distribuzione
- Formula: `RISCHIO_INTRINSECO = min((ESP x CRIT x SUP) x 4, 100)`
- Rischio residuo: `RISCHIO_RESIDUO = RISCHIO_INTRINSECO - (Maturity_Score_Area x 0.4)`

### 3b. Scoring per area e totale

- IRP per area = media ponderata dei rischi residui degli asset dell'area
- IRP Totale = media ponderata delle 5 aree con pesi: Security 30%, IT 25%, Networking 15%, Conn/Fonia 15%, UCC 15%
- Classificazione: 0-20 Basso, 21-40 Medio-Basso, 41-60 Medio, 61-80 Alto, 81-100 Critico

### 3c. Overview con gauge rischio

- Nell'Overview mostrare per ogni area: numero asset, rischio medio, asset piu critico
- Gauge IRP Totale (0-100) con classificazione colore
- Storico salvato in `irp_history` ad ogni ricalcolo

### 3d. Flag automatici

- Se rischio area > 60: badge "Intervento Prioritario"
- Se rischio totale > 70: suggerimenti (Assessment avanzato, Remediation plan, Servizio gestito)

---

## FASE 4 -- Routing e Sidebar

### 4a. Aggiornare `AppSidebar.tsx`

Aggiungere "Consistenze" nel gruppo HiCompliance, sotto "Analisi":

```text
HiCompliance
  Assessment
  SurfaceScan360
  DarkRisk360
  Remediation
  Analisi
  Consistenze    <-- NUOVO
  Incident
    Incident Response
    Eventi Compliance
```

### 4b. Aggiornare `App.tsx`

Nuova route: `/consistenze` con `ClientSelectionGuard`

---

## FASE 5 -- Permessi e Sicurezza

- **Sales/Super Admin**: vedono tutti i tenant, possono modificare tutto, esportare
- **Client**: vede solo la propria organizzazione, puo modificare (controllato da RLS)
- Le RLS policies riusano il pattern `can_manage_all_organizations()` gia consolidato
- I campi `created_by` e `updated_by` tracciano chi ha fatto le modifiche

---

## Riepilogo file da creare/modificare

| File | Azione |
|---|---|
| `supabase/migrations/..._consistenze_tables.sql` | Creazione tabelle + RLS |
| `supabase/migrations/..._irp_tables.sql` | Tabelle IRP + funzione rischio |
| `src/pages/Consistenze.tsx` | Nuova pagina principale con tabs |
| `src/components/consistenze/ConsistenzeOverview.tsx` | Overview con KPI e gauge |
| `src/components/consistenze/ConsistenzeAreaTab.tsx` | Tab per singola area con tabella |
| `src/components/consistenze/ConsistenzeAreaTable.tsx` | Tabella dinamica editabile |
| `src/components/consistenze/ConsistenzeKPICards.tsx` | Card KPI per area |
| `src/hooks/useConsistenze.ts` | Hook CRUD per consistenze_clienti + items |
| `src/hooks/useConsistenzeRisk.ts` | Hook per calcolo e sync rischio IRP |
| `src/components/layout/AppSidebar.tsx` | Aggiunta voce menu |
| `src/App.tsx` | Nuova route |
| `src/integrations/supabase/types.ts` | Auto-aggiornamento tipi |

---

## Note implementative

- L'implementazione e progressiva: prima le tabelle DB, poi la UI base con CRUD, poi l'engine di rischio
- Il modulo coesiste con l'attuale pagina `/asset-inventory` che gestisce le consistenze HiLog -- eventualmente in futuro si potra valutare di unificare
- Data la complessita, l'implementazione procedera in piu step per garantire stabilita

