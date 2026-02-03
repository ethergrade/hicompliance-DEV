
# Piano: Playbook Wizard Interattivi per Procedure Operative

## Obiettivo

Trasformare le procedure operative esistenti in **Playbook Wizard interattivi** e compilabili dal cliente, partendo dall'**Attacco Phishing**. L'utente potra:

1. **Visualizzare** il playbook completo direttamente a schermo con checklist interattiva
2. **Compilare** i campi personalizzabili (es. numero ore Go/No-Go, account coinvolti, ecc.)
3. **Scaricare** una checklist compilata in formato Word/PDF

---

## Analisi Documento Phishing Playbook

Dal documento caricato, il playbook e strutturato in queste sezioni:

```text
+--------------------------------------------------+
|  PLAYBOOK: Phishing / Account Compromise         |
+--------------------------------------------------+
|                                                  |
|  SCOPO                                           |
|  - Descrizione obiettivo                         |
|                                                  |
|  TRIGGER TIPICI                                  |
|  - [ ] Segnalazione utente email sospetta        |
|  - [ ] Login anomalo                             |
|  - [ ] Inbox rule/forwarding creati              |
|  - [ ] Accessi non coerenti                      |
|                                                  |
|  OWNER E SQUAD                                   |
|  - Owner tecnico: ____________                   |
|  - Coordinamento: ____________                   |
|  - Oversight: ____________                       |
|  - Compliance: ____________                      |
|                                                  |
|  TRIAGE (entro 60 min)                           |
|  - [ ] Confermare evento/incidente               |
|  - [ ] Identificare account coinvolti            |
|  - [ ] Verificare IdP/IAM logs                   |
|  ...                                             |
|                                                  |
|  CONTAINMENT                                     |
|  - [ ] Disabilitare account compromesso          |
|  - [ ] Terminare sessioni                        |
|  ...                                             |
|                                                  |
|  ERADICATION                                     |
|  - [ ] Verificare forwarding                     |
|  ...                                             |
|                                                  |
|  RECOVERY                                        |
|  - [ ] Ripristinare accesso utente               |
|  ...                                             |
|                                                  |
|  GO/NO-GO (chiusura)                             |
|  - Nessun login anomalo per ____ ore             |
|  - [ ] Nessuna regola inbox sospetta             |
|  ...                                             |
|                                                  |
+--------------------------------------------------+
```

---

## Struttura Dati Playbook

Creo un tipo TypeScript per i playbook:

```typescript
interface PlaybookSection {
  id: string;
  title: string;
  type: 'text' | 'checklist' | 'input-list' | 'notes';
  items?: PlaybookChecklistItem[];
  inputs?: PlaybookInputField[];
  content?: string;
}

interface PlaybookChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  notes?: string;
}

interface PlaybookInputField {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
}

interface Playbook {
  id: string;
  title: string;
  category: string;
  severity: string;
  icon: string;
  duration: string;
  description: string;
  purpose: string;
  owner: PlaybookInputField[];
  sections: PlaybookSection[];
}

interface PlaybookProgress {
  id: string;
  playbook_id: string;
  organization_id: string;
  user_id: string;
  data: Playbook; // stato corrente con check/valori
  completed_at?: string;
  created_at: string;
  updated_at: string;
}
```

---

## Componenti da Creare

### 1. `PlaybookViewer.tsx`
Dialog/Sheet full-screen per visualizzare e compilare il playbook:

- Header con titolo, severity, durata
- Progress bar per sezioni completate
- Sezioni accordion espandibili:
  - **Scopo**: testo fisso
  - **Trigger tipici**: checklist interattiva
  - **Owner e Squad**: campi input compilabili
  - **Triage/Containment/Eradication/Recovery**: checklist con note opzionali
  - **Go/No-Go**: checklist con campo input per ore
  - **Evidenze minime**: checklist
  - **Comunicazioni e compliance**: checklist
- Footer con pulsanti: Salva Progresso | Scarica Checklist

### 2. `PlaybookChecklistSection.tsx`
Componente per sezioni checklist:

- Checkbox con label
- Campo note opzionale per ogni item
- Indicatore visivo completamento

### 3. `PlaybookInputSection.tsx`
Componente per sezioni con campi input:

- Input fields con label
- Validazione opzionale

### 4. `PlaybookCard.tsx` (refactor card esistente)
Aggiorno la card esistente in IncidentResponse.tsx:

- Pulsante "Visualizza" apre il PlaybookViewer
- Pulsante "Download" scarica la checklist compilata
- Badge con stato completamento (se salvato)

### 5. `playbookDocxGenerator.ts`
Generatore Word per checklist compilata:

- Usa docxtemplater con template dedicato
- Esporta lo stato corrente del playbook

---

## UX Flow

```text
+-------------------+     +------------------------+
| Procedure Cards   | --> | PlaybookViewer (Sheet) |
| (grid esistente)  |     |                        |
|                   |     | - Scopo (read-only)    |
| [Visualizza]      |     | - Trigger [checkboxes] |
| [Download]        |     | - Owner [inputs]       |
+-------------------+     | - Triage [checklist]   |
                          | - ...                  |
                          |                        |
                          | [Salva] [Scarica DOCX] |
                          +------------------------+
```

---

## File da Creare/Modificare

### Nuovi File

| File | Descrizione |
|------|-------------|
| `src/types/playbook.ts` | Tipi TypeScript per playbook |
| `src/data/playbooks/phishing.ts` | Dati playbook Phishing |
| `src/components/irp/PlaybookViewer.tsx` | Viewer/editor principale |
| `src/components/irp/PlaybookChecklistSection.tsx` | Sezione checklist |
| `src/components/irp/PlaybookInputSection.tsx` | Sezione input |
| `src/components/irp/PlaybookProgressBar.tsx` | Barra progresso |
| `src/components/irp/playbookDocxGenerator.ts` | Generatore DOCX |
| `public/playbooks/phishing_checklist_template.docx` | Template Word (opzionale) |

### File da Modificare

| File | Modifiche |
|------|-----------|
| `src/pages/IncidentResponse.tsx` | Integra PlaybookViewer, aggiorna logica pulsanti |

---

## Dettaglio Implementazione

### Step 1: Tipi TypeScript

Creo `src/types/playbook.ts` con le interfacce per:
- Playbook structure
- Checklist items
- Input fields
- Progress state

### Step 2: Dati Playbook Phishing

Creo `src/data/playbooks/phishing.ts` con la struttura completa derivata dal documento Word:

- **Scopo**: testo
- **Trigger tipici**: 4 checkbox
- **Owner e Squad**: 4 campi input (Owner tecnico, Coordinamento, Oversight, Compliance)
- **Triage**: 7 checkbox + campo Severity
- **Containment**: 9 checkbox
- **Eradication**: 5 checkbox
- **Recovery**: 4 checkbox
- **Comunicazioni**: 2 checkbox
- **Evidenze minime**: 4 checkbox
- **Go/No-Go**: 4 checkbox con campo "ore" editabile

### Step 3: PlaybookViewer Component

Componente principale che:

1. Riceve l'ID del playbook
2. Carica i dati (inizialmente statici, poi da DB)
3. Gestisce lo stato locale dei check/input
4. Renderizza le sezioni con Accordion
5. Calcola la percentuale completamento
6. Gestisce salvataggio/export

### Step 4: Integrazione in IncidentResponse

Modifico la pagina per:

1. Aggiungere stato per il playbook selezionato
2. Aprire PlaybookViewer al click su "Visualizza"
3. Collegare il pulsante "Download" all'export

### Step 5: Export DOCX

Creo generatore che:

1. Genera un documento Word con tutte le sezioni
2. Include checkbox compilati (usando caratteri Unicode)
3. Include i valori dei campi input
4. Formattazione professionale

---

## Dettagli Tecnici

### Playbook Phishing - Struttura Completa

```typescript
const phishingPlaybook: Playbook = {
  id: 'phishing-attack',
  title: 'Phishing / Account Compromise',
  category: 'Social Engineering',
  severity: 'Media',
  icon: 'Mail',
  duration: '30 min - 1 ora',
  description: 'Gestione di campagne phishing e compromissione credenziali',
  purpose: 'Bloccare l\'accesso non autorizzato, limitare impatto...',
  owner: [
    { id: 'owner-tech', label: 'Owner tecnico', value: '', placeholder: 'Head IT / SOC' },
    { id: 'coordinamento', label: 'Coordinamento', value: '', placeholder: 'IRM' },
    { id: 'oversight', label: 'Oversight', value: '', placeholder: 'CISO' },
    { id: 'compliance', label: 'Compliance', value: '', placeholder: 'Legal/DPO' },
  ],
  sections: [
    {
      id: 'triggers',
      title: 'Trigger tipici',
      type: 'checklist',
      items: [
        { id: 't1', text: 'Segnalazione utente di email sospetta', checked: false },
        { id: 't2', text: 'Login anomalo (geo, impossible travel, device nuovo)', checked: false },
        { id: 't3', text: 'Inbox rule/forwarding creati, OAuth app sconosciuta', checked: false },
        { id: 't4', text: 'Accessi non coerenti a mailbox, CRM, cloud drive, VPN', checked: false },
      ]
    },
    // ... altre sezioni (Triage, Containment, Eradication, Recovery, etc.)
  ]
};
```

### UI Preview (ASCII)

```text
+----------------------------------------------------------------+
|  PLAYBOOK: Phishing / Account Compromise              [Media]  |
|  Durata: 30 min - 1 ora                                        |
+----------------------------------------------------------------+
|  Completamento: [==========--------] 60%                       |
+----------------------------------------------------------------+
|                                                                |
|  > SCOPO                                                       |
|    Bloccare l'accesso non autorizzato, limitare impatto...    |
|                                                                |
|  > TRIGGER TIPICI                                              |
|    [x] Segnalazione utente di email sospetta                  |
|    [ ] Login anomalo (geo, impossible travel, device nuovo)    |
|    [x] Inbox rule/forwarding creati                            |
|    [ ] Accessi non coerenti                                    |
|                                                                |
|  > OWNER E SQUAD                                               |
|    Owner tecnico: [__Head IT / SOC__]                         |
|    Coordinamento: [__IRM____________]                         |
|    Oversight:     [__CISO___________]                         |
|    Compliance:    [__Legal/DPO______]                         |
|                                                                |
|  > TRIAGE (entro 60 min)                                       |
|    [x] Confermare se evento o incidente                        |
|    [ ] Identificare account coinvolti                          |
|        Note: [_________________________]                       |
|    [x] Verificare IdP/IAM logs                                 |
|    ...                                                         |
|                                                                |
|  > GO/NO-GO (chiusura)                                         |
|    [x] Nessun login anomalo per [_24_] ore                     |
|    [x] Nessuna regola inbox/forwarding sospetta                |
|    [ ] MFA e policy rafforzate attive                          |
|    [ ] Stakeholder informati                                   |
|                                                                |
+----------------------------------------------------------------+
|  [Salva Progresso]                    [Scarica Checklist DOCX] |
+----------------------------------------------------------------+
```

---

## Estensibilita Futura

Una volta implementato il playbook Phishing, sara semplice aggiungere gli altri:

1. **Data Breach** - Struttura simile con sezioni GDPR
2. **Ransomware** - Focus su backup/recovery
3. **DDoS** - Focus su mitigazione rete
4. **Malware** - Focus su eradication
5. **Insider Threat** - Focus su HR/Legal

Ogni playbook avra il proprio file in `src/data/playbooks/` seguendo lo stesso schema.

---

## Riepilogo Deliverable

1. Sistema di tipi TypeScript per playbook
2. Dati completi playbook Phishing (dal documento fornito)
3. PlaybookViewer con UI checklist interattiva
4. Componenti riutilizzabili (ChecklistSection, InputSection, ProgressBar)
5. Integrazione nella pagina IncidentResponse
6. Export DOCX della checklist compilata
7. Salvataggio progresso locale (estendibile a database)
