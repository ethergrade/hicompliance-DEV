import { PlaybookSection } from '@/types/playbook';

// Standard comune che vale per tutti i playbook
export const commonStandardsSections: PlaybookSection[] = [
  {
    id: 'severity-sla',
    title: 'Severity, SLA e Escalation',
    subtitle: 'riferimento unico',
    type: 'checklist',
    items: [
      {
        id: 'sla-critico',
        text: 'CRITICO: 0–2h escalation IRM + CISO + CdA',
        checked: false,
      },
      {
        id: 'sla-alto',
        text: 'ALTO: 2–8h escalation IRM + CISO',
        checked: false,
      },
      {
        id: 'sla-medio',
        text: 'MEDIO: 8–24h escalation IRM',
        checked: false,
      },
      {
        id: 'sla-basso',
        text: 'BASSO: 24–72h escalation Technical team',
        checked: false,
      },
    ],
  },
  {
    id: 'csirt-privacy',
    title: 'Trigger CSIRT (NIS2) e Privacy',
    subtitle: 'riuso',
    type: 'checklist',
    items: [
      {
        id: 'csirt-1',
        text: 'Se atti illegittimi (confermato o sospetto) o possibile impatto transfrontaliero → Pre-alert CSIRT entro 24h',
        checked: false,
      },
      {
        id: 'csirt-2',
        text: 'Se dati personali potenzialmente esfiltrati/violati → coinvolgere Legal/DPO e valutare obblighi GDPR',
        checked: false,
      },
    ],
  },
];

// Helper function to merge common standards into a playbook's sections
export const mergeCommonStandards = (sections: PlaybookSection[]): PlaybookSection[] => {
  // Insert common standards after the first section (usually triggers) 
  // or at the beginning if no sections exist
  if (sections.length === 0) {
    return [...commonStandardsSections];
  }
  
  // Find the index after 'triggers' section, or insert at position 1
  const triggersIndex = sections.findIndex(s => s.id === 'triggers');
  const insertIndex = triggersIndex >= 0 ? triggersIndex + 1 : 1;
  
  return [
    ...sections.slice(0, insertIndex),
    ...commonStandardsSections,
    ...sections.slice(insertIndex),
  ];
};
