
# Piano: Analisi Rischi per IRP Esteso

## Obiettivo
Creare una nuova scheda "Analisi Rischi" nel modulo Incident Response che permette di censire asset/archivi con le relative misure di sicurezza implementate. La matrice compilata verra' salvata automaticamente e, se completa, esportata come allegato nella "Gestione Documenti".

---

## Analisi Excel - Struttura Dati

L'Excel contiene una matrice di valutazione dove:
- **Righe**: Asset/Archivi (raggruppati per fonte di rischio: Non Umane, Umane Esterne, Umane Interne)
- **Colonne**: 33 misure di sicurezza raggruppate in categorie
- **Valori**: Score 0-3 per ogni combinazione asset/misura

### Legenda Score
| Valore | Significato |
|--------|-------------|
| 0 | Non presente / Non applicabile |
| 1 | Presente ma non incide sulla mitigazione |
| 2 | Presente e parzialmente implementata |
| 3 | Presente e totalmente implementata |

---

## Struttura Database

### Nuova Tabella: `risk_analysis`

```text
+---------------------+-------------+----------------------------------+
| Campo               | Tipo        | Descrizione                      |
+---------------------+-------------+----------------------------------+
| id                  | UUID        | Primary key                      |
| organization_id     | UUID        | FK a organizations               |
| asset_name          | TEXT        | Nome asset/archivio              |
| threat_source       | TEXT        | non_umana/umana_esterna/interna  |
| control_scores      | JSONB       | Mappa controllo -> score 0-3     |
| risk_score          | INTEGER     | Score medio calcolato            |
| notes               | TEXT        | Note libere                      |
| created_at          | TIMESTAMPTZ | Data creazione                   |
| updated_at          | TIMESTAMPTZ | Data aggiornamento               |
+---------------------+-------------+----------------------------------+
```

### Tabella di Supporto: `security_controls` (statica)
Contiene i 33 controlli con categoria e ordine per popolare la UI.

---

## Interfaccia Utente

### Approccio UX Proposto
Invece di replicare l'intera matrice Excel (troppo complessa per un wizard), propongo un approccio **wizard guidato per asset**:

```text
+----------------------------------------------------------+
|  ANALISI RISCHI - IRP Esteso                              |
+----------------------------------------------------------+
|                                                           |
|  [Progresso: 2/5 asset analizzati] [Esporta Excel]       |
|                                                           |
|  +-- ELENCO ASSET ----------------------------------------+
|  | Asset                    | Fonti | Completezza | Azioni|
|  |--------------------------|-------|-------------|-------|
|  | Server Applicazioni      | 3/3   | 85%         | [>]   |
|  | Database Oracle          | 2/3   | 60%         | [>]   |
|  | NAS Videosorveglianza    | 0/3   | 0%          | [>]   |
|  +--------------------------------------------------------+
|                                                           |
|  [+ Aggiungi Asset]                                       |
|                                                           |
+----------------------------------------------------------+
```

### Wizard Dettaglio Asset (quando si clicca ">")

```text
+----------------------------------------------------------+
|  Asset: Server Applicazioni                    [< Torna] |
+----------------------------------------------------------+
|                                                           |
|  Seleziona fonte di rischio:                             |
|  [Fonti Non Umane] [Fonti Umane Esterne] [Fonti Interne] |
|                                                           |
|  +-- SICUREZZA FISICA ------------------------------------+
|  | Impianto antincendio          [0] [1] [2] [3]         |
|  | Porta blindata                [0] [1] [2] [3]         |
|  | Videosorveglianza             [0] [1] [2] [3]         |
|  | Allarme                       [0] [1] [2] [3]         |
|  | Archivio con serratura        [0] [1] [2] [3]         |
|  | Estintori                     [0] [1] [2] [3]         |
|  +--------------------------------------------------------+
|                                                           |
|  +-- CONTROLLO ACCESSI -----------------------------------+
|  | Sistemi accesso controllato   [0] [1] [2] [3]         |
|  | Armadio blindato/ignifugo     [0] [1] [2] [3]         |
|  | Solo autorizzati              [0] [1] [2] [3]         |
|  +--------------------------------------------------------+
|                                                           |
|  +-- SICUREZZA IT ----------------------------------------+
|  | Firewall                      [0] [1] [2] [3]         |
|  | Credenziali per addetto       [0] [1] [2] [3]         |
|  | Complessita' password         [0] [1] [2] [3]         |
|  | MFA                           [0] [1] [2] [3]         |
|  | Antivirus/Antimalware         [0] [1] [2] [3]         |
|  | Monitoraggio log              [0] [1] [2] [3]         |
|  | Cifratura dati                [0] [1] [2] [3]         |
|  +--------------------------------------------------------+
|                                                           |
|  ... altre categorie (Backup, Organizzativo, Compliance) |
|                                                           |
|  [Salvataggio automatico attivo]           [Risk: 2.3/3] |
+----------------------------------------------------------+
```

---

## Categorizzazione Controlli

| Categoria | Controlli |
|-----------|-----------|
| **Sicurezza Fisica** | Antincendio, Porta blindata, Videosorveglianza, Allarme, Serratura, Estintori, Drenaggio, Accesso controllato locali, Armadio blindato |
| **Controllo Accessi** | Archivio solo autorizzati, Max tentativi PSW, Sospensione sessioni |
| **Gestione Documenti** | Distruggi documenti, Digitalizzazione |
| **Sicurezza IT** | Firewall, Credenziali, Complessita' PSW, Log monitoring, MFA, Antivirus, Aggiornamenti SW, Cifratura |
| **Continuita' Operativa** | Backup, Disaster Recovery |
| **Organizzativo** | Formazione, Ruoli/Responsabilita', Gestione IT esterna, Tempi conservazione |
| **Compliance** | Procedure Data Breach, Privacy docs, Consensi, Regolamento informatico, Diritti interessati |

---

## Flusso Implementazione

### 1. Database Migration
- Creare tabella `risk_analysis`
- Creare tabella `security_controls` con seed dei 33 controlli
- RLS policies per organization_id

### 2. Nuovi File

| File | Descrizione |
|------|-------------|
| `src/types/riskAnalysis.ts` | Tipi TypeScript |
| `src/hooks/useRiskAnalysis.ts` | Hook CRUD per analisi rischi |
| `src/data/securityControls.ts` | Definizione statica dei 33 controlli categorizzati |
| `src/components/irp/RiskAnalysisManager.tsx` | Componente principale (lista asset) |
| `src/components/irp/RiskAnalysisWizard.tsx` | Wizard dettaglio singolo asset |
| `src/components/irp/RiskControlGroup.tsx` | Gruppo controlli con toggle 0-3 |

### 3. Modifiche Esistenti

| File | Modifica |
|------|----------|
| `src/pages/IncidentResponse.tsx` | Nuova tab "Analisi Rischi" |
| `src/integrations/supabase/types.ts` | Aggiornamento tipi |

---

## Integrazione con Gestione Documenti

Quando l'analisi e' compilata (almeno 1 asset con valutazioni):

1. **Pulsante "Esporta Excel"**: Genera un file Excel con la matrice completa
2. **Salvataggio automatico in Documenti**: 
   - Quando l'utente esporta, il file viene caricato automaticamente su Supabase Storage
   - Viene creato un record in `incident_documents` con categoria "Tecnico" o nuova categoria "Analisi Rischi"
   - L'utente puo' accedervi dalla Gestione Documenti

---

## Integrazione con IRP Documento

Nel generatore DOCX dell'IRP Esteso:
- Se `risk_analysis` contiene dati per l'organizzazione
- Viene aggiunta una sezione "Allegato: Analisi dei Rischi"
- Con tabella riepilogativa degli asset e risk score medio
- Il documento Excel viene referenziato come allegato

---

## Calcolo Risk Score

Per ogni asset, il risk score viene calcolato come:
```text
Risk Score = (Somma score controlli valorizzati) / (Numero controlli valorizzati * 3) * 100

Esempio:
- 10 controlli valorizzati
- Somma score = 25
- Risk Score = 25 / (10 * 3) * 100 = 83%
```

Indicatori:
- **0-40%**: Rischio Alto (rosso)
- **41-70%**: Rischio Medio (giallo)
- **71-100%**: Rischio Basso (verde)

---

## Vantaggi UX del Wizard

1. **Guidato**: L'utente compila un asset alla volta, non si perde in una matrice enorme
2. **Progressivo**: Puo' salvare e riprendere in qualita ` momento
3. **Auto-save**: Ogni modifica viene persistita automaticamente
4. **Feedback visivo**: Score calcolato in tempo reale
5. **Categorizzato**: Controlli raggruppati per facilitare la comprensione
6. **3 fonti separate**: Per ogni asset si valutano le 3 fonti di minaccia distintamente

---

## Riepilogo Tecnico

### Componenti da Creare
- 1 migrazione database (2 tabelle + RLS)
- 3 tipi TypeScript
- 2 hooks React
- 3 componenti UI
- 1 file dati statici

### Pattern Riutilizzati
- Stesso pattern di `useCriticalInfrastructure` per CRUD
- Stesso pattern di `CriticalInfrastructureManager` per UI tabellare
- Export Excel come gia' implementato
- Integrazione con `incident_documents` per allegati
