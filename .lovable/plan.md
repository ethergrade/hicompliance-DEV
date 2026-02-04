
# Piano: Migrazione Automatica dei Playbook Salvati in localStorage

## Problema
Quando la struttura di un playbook cambia (es. aggiunta di `singleChoice`, nuovi campi, nuove sezioni), i dati salvati in localStorage diventano obsoleti. Attualmente il sistema carica i dati vecchi senza verificare se sono compatibili con la nuova struttura.

**Conseguenze:**
- La sezione "Severity SLA" continua a mostrare "1/4" invece di "0/1 o 1/1"
- Nuovi campi (es. "Data Incidente") non appaiono
- Nuove sezioni non vengono visualizzate

---

## Soluzione: Sistema di Migrazione con Versioning

Implementare un sistema che:
1. Assegna una versione a ogni definizione di playbook
2. Salva la versione insieme ai dati in localStorage
3. Al caricamento, confronta le versioni e fa il merge intelligente se necessario

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/lib/playbookMigration.ts` | **NUOVO** | Logica di migrazione e merge |
| `src/types/playbook.ts` | Modifica | Aggiungere campo `version` opzionale |
| `src/data/playbooks/phishing.ts` | Modifica | Aggiungere `version` a ogni playbook |
| `src/data/playbooks/*.ts` | Modifica | Aggiungere `version` a tutti i playbook |
| `src/components/irp/PlaybookViewer.tsx` | Modifica | Usare la funzione di migrazione al caricamento |
| `src/hooks/usePlaybookAutoSave.ts` | Modifica | Salvare la versione insieme ai dati |

---

## Dettagli Implementazione

### 1. Nuovo File: `src/lib/playbookMigration.ts`

```typescript
import { Playbook, PlaybookSection, PlaybookChecklistItem, PlaybookInputField } from '@/types/playbook';

// Current schema version - increment when structure changes
export const PLAYBOOK_SCHEMA_VERSION = 2;

interface SavedPlaybookData {
  version?: number;
  playbook: Playbook;
}

/**
 * Merge saved user data with the latest playbook template.
 * Preserves user input (checked items, notes, screenshots, field values)
 * while adopting new structure (singleChoice, new sections, new fields).
 */
export const migratePlaybook = (
  savedData: Playbook,
  latestTemplate: Playbook
): Playbook => {
  // Deep clone the latest template as base
  const migrated: Playbook = JSON.parse(JSON.stringify(latestTemplate));

  // 1. Migrate owner fields - preserve user values
  migrated.owner = migrated.owner.map(templateField => {
    const savedField = savedData.owner?.find(f => f.id === templateField.id);
    if (savedField) {
      return {
        ...templateField,           // Use new structure (fieldType, etc.)
        value: savedField.value,    // Preserve user input
        contactId: savedField.contactId,
      };
    }
    return templateField;
  });

  // 2. Migrate sections - preserve user data per item
  migrated.sections = migrated.sections.map(templateSection => {
    const savedSection = savedData.sections?.find(s => s.id === templateSection.id);
    
    if (!savedSection) {
      return templateSection; // New section, use defaults
    }

    // Merge items (checklist items)
    if (templateSection.items && savedSection.items) {
      templateSection.items = templateSection.items.map(templateItem => {
        const savedItem = savedSection.items?.find(i => i.id === templateItem.id);
        if (savedItem) {
          return {
            ...templateItem,               // New structure (link labels, etc.)
            checked: savedItem.checked,    // Preserve checked state
            notes: savedItem.notes,        // Preserve notes
            screenshot: savedItem.screenshot,
            screenshotName: savedItem.screenshotName,
            link: savedItem.link || templateItem.link,
            inlineInputValue: savedItem.inlineInputValue,
          };
        }
        return templateItem;
      });
    }

    // Merge inputs (input-list sections)
    if (templateSection.inputs && savedSection.inputs) {
      templateSection.inputs = templateSection.inputs.map(templateInput => {
        const savedInput = savedSection.inputs?.find(i => i.id === templateInput.id);
        if (savedInput) {
          return {
            ...templateInput,
            value: savedInput.value,
            contactId: savedInput.contactId,
          };
        }
        return templateInput;
      });
    }

    return {
      ...templateSection,  // Use new structure (singleChoice, etc.)
      items: templateSection.items,
      inputs: templateSection.inputs,
    };
  });

  return migrated;
};

/**
 * Load playbook from localStorage with automatic migration.
 */
export const loadPlaybookWithMigration = (
  playbookId: string,
  latestTemplate: Playbook
): Playbook => {
  const storageKey = `playbook_progress_${playbookId}`;
  const saved = localStorage.getItem(storageKey);
  
  if (!saved) {
    return JSON.parse(JSON.stringify(latestTemplate));
  }

  try {
    const savedData = JSON.parse(saved);
    
    // Check version
    const savedVersion = savedData._schemaVersion || 1;
    
    if (savedVersion < PLAYBOOK_SCHEMA_VERSION) {
      // Migration needed
      console.log(`Migrating playbook ${playbookId} from v${savedVersion} to v${PLAYBOOK_SCHEMA_VERSION}`);
      const migrated = migratePlaybook(savedData, latestTemplate);
      
      // Save migrated data with new version
      savePlaybookWithVersion(playbookId, migrated);
      
      return migrated;
    }
    
    // Same version, use saved data as-is
    return savedData;
  } catch (error) {
    console.error('Error loading playbook:', error);
    return JSON.parse(JSON.stringify(latestTemplate));
  }
};

/**
 * Save playbook to localStorage with version tag.
 */
export const savePlaybookWithVersion = (
  playbookId: string,
  playbook: Playbook
): void => {
  const storageKey = `playbook_progress_${playbookId}`;
  const dataToSave = {
    ...playbook,
    _schemaVersion: PLAYBOOK_SCHEMA_VERSION,
  };
  localStorage.setItem(storageKey, JSON.stringify(dataToSave));
};
```

### 2. Aggiornare `PlaybookViewer.tsx`

Modificare il caricamento per usare la migrazione:

```typescript
import { loadPlaybookWithMigration } from '@/lib/playbookMigration';

// Nel useEffect di caricamento (linee 190-202):
useEffect(() => {
  if (initialPlaybook && open) {
    // Use migration-aware loading
    const loadedPlaybook = loadPlaybookWithMigration(
      initialPlaybook.id,
      initialPlaybook
    );
    setPlaybookState(loadedPlaybook);
  }
}, [initialPlaybook, open]);
```

### 3. Aggiornare `usePlaybookAutoSave.ts`

Usare la funzione di salvataggio con versione:

```typescript
import { savePlaybookWithVersion } from '@/lib/playbookMigration';

// Nel triggerSave, sostituire il salvataggio diretto:
saveTimeoutRef.current = setTimeout(() => {
  savePlaybookWithVersion(playbook.id, playbook);  // <-- Usa nuova funzione
  setSaveStatus('saved');
  setLastSaved(new Date());
  // ... rest of sync logic
}, 500);
```

---

## Flusso di Migrazione

```text
Utente apre playbook
        |
        v
loadPlaybookWithMigration()
        |
        v
   Ha dati salvati?
   /           \
  No            Si
  |              |
  v              v
Usa template   Controlla versione
  |              |
  v          Versione < attuale?
Return      /           \
           Si            No
           |              |
           v              v
    migratePlaybook()   Usa dati salvati
           |              |
           v              v
    Salva migrato     Return
           |
           v
        Return
```

---

## Comportamento della Migrazione

**Cosa viene preservato:**
- Checkbox selezionate (`checked: true`)
- Note scritte dall'utente (`notes`)
- Screenshot caricati (`screenshot`, `screenshotName`)
- Valori dei campi input (`value`)
- Link aggiunti (`link`)
- Valori inline input (`inlineInputValue`)
- Contatti selezionati dalla rubrica (`contactId`)

**Cosa viene aggiornato:**
- Flag `singleChoice` sulle sezioni
- Nuove sezioni aggiunte al template
- Nuovi campi owner (es. "Data Incidente")
- Nuovi item nelle checklist esistenti
- Etichette e placeholder aggiornati

---

## Incremento Versione

Ogni volta che si modifica la struttura dei playbook (es. aggiunta `singleChoice`), incrementare `PLAYBOOK_SCHEMA_VERSION` in `playbookMigration.ts`:

```typescript
// v1: Struttura originale
// v2: Aggiunto singleChoice + Data Incidente
export const PLAYBOOK_SCHEMA_VERSION = 2;
```

---

## Risultato Finale

1. **Prima visita dopo aggiornamento**: Il sistema rileva la versione obsoleta, esegue la migrazione preservando i dati utente, e salva la versione aggiornata

2. **Visite successive**: I dati sono gia' alla versione corretta, nessuna migrazione necessaria

3. **L'utente vede**: La sezione "Severity SLA" con radio button e "0/1" o "1/1", il nuovo campo "Data Incidente", e tutti i suoi dati precedenti preservati
