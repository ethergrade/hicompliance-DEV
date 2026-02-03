
# Piano: Wizard "Infrastruttura Critica" per IRP Esteso

## Panoramica

Creare una nuova scheda wizard nel modulo Incident Response che permette al cliente o al tecnico di censire l'infrastruttura critica dell'organizzazione. I dati compilati saranno persistiti automaticamente nel database Supabase e potranno essere esportati nel documento IRP "Esteso".

Il wizard si compone di **due sezioni collegate**:
1. **Asset Critici** - Dati identificativi e classificazione
2. **Backup & Recovery** - Parametri di continuita' operativa

---

## Struttura Dati

### Tabella 1: Asset Critici
| Campo | Tipo | Esempio |
|-------|------|---------|
| ID | Auto (C-01, C-02...) | C-01 |
| Componente/Nome | Testo | Server applicazioni |
| Criticita' | Scelta (H/M/L) | H |
| Owner (Team) | Testo | IT Operations |
| Gestione | Scelta (Interna/Esterna) | Interna |
| Ubicazione/Region | Testo | Datacenter Milano |
| Dati sensibili | Scelta (S/N) | S |
| Dipendenze | Testo | Database Oracle |
| Controlli principali | Testo | Firewall, IDS |

### Tabella 2: Backup & Recovery (collegata via ID)
| Campo | Tipo | Esempio |
|-------|------|---------|
| Backup | Scelta (S/N) | S |
| Freq backup | Testo | Giornaliero |
| Ultimo test | Data | 2026-01-15 |
| RPO (h) | Numero | 4 |
| RTO (h) | Numero | 8 |
| Runbook/Link | URL/Testo | /docs/recovery.pdf |
| Note IR | Testo libero | Procedura testata |

---

## Interfaccia Utente

### Nuova Tab "Infrastruttura Critica"
La tab sara' aggiunta accanto alle esistenti (Procedure Operative, Contatti di Emergenza, Rubrica Contatti).

### Layout Wizard
```text
+----------------------------------------------------------+
|  HEADER                                                   |
|  [Responsabile: Head IT]  [Frequenza: Semestrale]        |
|  [Progresso: 3/10 asset censiti]                         |
+----------------------------------------------------------+
|  TABELLA ASSET CRITICI (scroll orizzontale)              |
|  +------+---------------+------+-------+--------+...     |
|  | ID   | Componente    | Crit | Owner | Gest.  |...     |
|  +------+---------------+------+-------+--------+...     |
|  | C-01 | Server App    | [H]  | IT    | [Int]  |...     |
|  | C-02 | Database      | [H]  | DBA   | [Ext]  |...     |
|  +------+---------------+------+-------+--------+...     |
|  [+ Aggiungi Asset]                                       |
+----------------------------------------------------------+
|  TABELLA BACKUP & RECOVERY                                |
|  +------+--------+------+------------+-----+-----+...    |
|  | ID   | Backup | Freq | Ultimo test| RPO | RTO |...    |
|  +------+--------+------+------------+-----+-----+...    |
|  | C-01 | [S]    | 24h  | [Date]     | 4   | 8   |...    |
|  +------+--------+------+------------+-----+-----+...    |
+----------------------------------------------------------+
|  [Salva Bozza]     [Esporta Excel]                       |
+----------------------------------------------------------+
```

### Funzionalita' Wizard
- **Auto-save**: Ogni modifica viene salvata automaticamente (debounce 2 secondi)
- **ID automatico**: Generato sequenzialmente (C-01, C-02, ...)
- **Datepicker**: Per campo "Ultimo test"
- **Campi inline**: Modifica diretta nelle celle della tabella
- **Drag & drop** (futuro): Riordinamento asset
- **Validazione**: Campi obbligatori evidenziati

---

## Implementazione Tecnica

### 1. Database - Nuova Tabella Supabase

```sql
CREATE TABLE critical_infrastructure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  asset_id TEXT NOT NULL,  -- "C-01", "C-02", etc.
  
  -- Asset Critici fields
  component_name TEXT NOT NULL,
  criticality TEXT CHECK (criticality IN ('H', 'M', 'L')),
  owner_team TEXT,
  management_type TEXT CHECK (management_type IN ('internal', 'external')),
  location TEXT,
  sensitive_data TEXT CHECK (sensitive_data IN ('S', 'N', 'N/A')),
  dependencies TEXT,
  main_controls TEXT,
  
  -- Backup & Recovery fields  
  has_backup TEXT CHECK (has_backup IN ('S', 'N')),
  backup_frequency TEXT,
  last_test_date DATE,
  rpo_hours INTEGER,
  rto_hours INTEGER,
  runbook_link TEXT,
  ir_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  
  UNIQUE(organization_id, asset_id)
);

-- RLS Policies
ALTER TABLE critical_infrastructure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org infrastructure"
  ON critical_infrastructure FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM users 
    WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own org infrastructure"
  ON critical_infrastructure FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM users 
    WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can update own org infrastructure"
  ON critical_infrastructure FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM users 
    WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own org infrastructure"
  ON critical_infrastructure FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM users 
    WHERE auth_user_id = auth.uid()
  ));
```

### 2. Nuovi File da Creare

| File | Descrizione |
|------|-------------|
| `src/types/infrastructure.ts` | Tipi TypeScript per infrastruttura critica |
| `src/hooks/useCriticalInfrastructure.ts` | Hook per CRUD asset |
| `src/components/irp/CriticalInfrastructureManager.tsx` | Componente principale wizard |
| `src/components/irp/CriticalAssetRow.tsx` | Riga editabile asset |
| `src/components/irp/InfrastructureHeader.tsx` | Header con metadati |

### 3. Modifiche a File Esistenti

| File | Modifica |
|------|----------|
| `src/pages/IncidentResponse.tsx` | Aggiungere nuova tab "Infrastruttura Critica" |

### 4. Componente Principale

```text
CriticalInfrastructureManager
├── InfrastructureHeader (responsabile, frequenza, progresso)
├── Card "Asset Critici"
│   ├── ScrollArea (tabella editabile)
│   │   └── CriticalAssetRow (per ogni asset)
│   └── Button "Aggiungi Asset"
├── Card "Backup & Recovery"  
│   ├── ScrollArea (tabella editabile)
│   │   └── BackupRecoveryRow (per ogni asset)
│   └── (stesso dataset, vista diversa)
└── Actions (Salva, Esporta Excel)
```

---

## Flusso Utente

1. L'utente accede a **Incident Response > Infrastruttura Critica**
2. Visualizza la tabella degli asset (vuota se primo accesso)
3. Clicca **"+ Aggiungi Asset"** per creare un nuovo record
4. Compila i campi inline (criticita', owner, ecc.)
5. I dati si salvano automaticamente
6. Nella sezione Backup, i dati RPO/RTO vengono compilati per lo stesso asset
7. Puo' esportare in Excel o generare il documento IRP esteso

---

## Sequenza Implementazione

1. Creare migrazione database con tabella e RLS
2. Creare tipi TypeScript (`src/types/infrastructure.ts`)
3. Creare hook `useCriticalInfrastructure` per gestione dati
4. Creare componente `CriticalInfrastructureManager`
5. Integrare in `IncidentResponse.tsx` come nuova tab
6. Aggiungere export Excel
7. (Futuro) Integrare nel generatore DOCX per IRP Esteso

---

## Note Tecniche

- **Auto-save con debounce**: Uso di `useDebounce` hook per evitare troppe chiamate API
- **Ottimistic updates**: Aggiornamento UI immediato, rollback in caso di errore
- **Responsabile/Frequenza**: Campi configurabili in header, salvati come metadati org
- **Compatibilita'**: Stesso pattern di GovernanceContactsTable e ContactDirectoryManager
