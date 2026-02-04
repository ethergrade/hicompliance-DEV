import { Playbook } from '@/types/playbook';

// Current schema version - increment when structure changes
// v1: Original structure
// v2: Added singleChoice + Data Incidente field
export const PLAYBOOK_SCHEMA_VERSION = 2;

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

    // Clone template section to avoid mutation
    const migratedSection = { ...templateSection };

    // Merge items (checklist items)
    if (templateSection.items && savedSection.items) {
      migratedSection.items = templateSection.items.map(templateItem => {
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
      migratedSection.inputs = templateSection.inputs.map(templateInput => {
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

    return migratedSection;
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
