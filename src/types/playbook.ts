// Playbook Types for Interactive Incident Response Wizards

export interface PlaybookChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  notes?: string;
  link?: string; // Optional link URL for the item
  linkLabel?: string; // Optional custom label for the link
  hasInlineInput?: boolean;
  inlineInputLabel?: string;
  inlineInputValue?: string;
  inlineInputPlaceholder?: string;
}

export interface PlaybookInputField {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  required?: boolean;
  allowDirectoryPicker?: boolean; // Allow picking from contact directory
  contactId?: string; // ID of selected contact from directory
}

export interface PlaybookSection {
  id: string;
  title: string;
  subtitle?: string;
  type: 'text' | 'checklist' | 'input-list' | 'notes';
  items?: PlaybookChecklistItem[];
  inputs?: PlaybookInputField[];
  content?: string;
}

export interface Playbook {
  id: string;
  title: string;
  category: string;
  severity: 'Bassa' | 'Media' | 'Alta' | 'Critica';
  icon: string;
  duration: string;
  description: string;
  purpose: string;
  owner: PlaybookInputField[];
  sections: PlaybookSection[];
}

export interface PlaybookState extends Playbook {
  completedItems: number;
  totalItems: number;
  completionPercentage: number;
}

export interface PlaybookProgress {
  id: string;
  playbook_id: string;
  organization_id: string;
  user_id: string;
  data: Playbook;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

// Helper function to calculate progress
export const calculatePlaybookProgress = (playbook: Playbook): { completed: number; total: number; percentage: number } => {
  let completed = 0;
  let total = 0;

  // Count owner fields filled
  playbook.owner.forEach(field => {
    total++;
    if (field.value.trim() !== '') completed++;
  });

  // Count checklist items
  playbook.sections.forEach(section => {
    if (section.type === 'checklist' && section.items) {
      section.items.forEach(item => {
        total++;
        if (item.checked) completed++;
      });
    }
    if (section.type === 'input-list' && section.inputs) {
      section.inputs.forEach(input => {
        total++;
        if (input.value.trim() !== '') completed++;
      });
    }
  });

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percentage };
};
