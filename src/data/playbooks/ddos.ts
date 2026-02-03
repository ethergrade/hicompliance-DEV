import { Playbook, PlaybookSection } from '@/types/playbook';
import { mergeCommonStandards } from './common-standards';

const ddosBaseSections: PlaybookSection[] = [
  {
    id: 'triggers',
    title: 'Trigger Tipici',
    type: 'checklist',
    items: [
      { id: 't1', text: 'Saturazione banda rilevata', checked: false },
      { id: 't2', text: 'Errori 5xx in aumento', checked: false },
      { id: 't3', text: 'Latenza alta rilevata', checked: false },
      { id: 't4', text: 'Alert WAF/CDN', checked: false },
      { id: 't5', text: 'Servizio customer-facing down o degradato', checked: false },
    ],
  },
  {
    id: 'triage',
    title: 'Triage',
    type: 'checklist',
    items: [
      { id: 'triage-1', text: 'Distinguere DDoS vs outage tecnico (guasto, config, capacity)', checked: false, hasInlineInput: true, inlineInputLabel: 'Tipo', inlineInputValue: '', inlineInputPlaceholder: 'DDoS / Outage tecnico' },
      { id: 'triage-2', text: 'Identificare servizi/endpoint colpiti e pattern (L3/L4/L7)', checked: false, hasInlineInput: true, inlineInputLabel: 'Pattern', inlineInputValue: '', inlineInputPlaceholder: 'L3 / L4 / L7' },
      { id: 'triage-3', text: 'Misurare impatto su SLA e utenti', checked: false },
      { id: 'triage-4', text: 'Severity: servizio critico down → ALTO/CRITICO', checked: false, hasInlineInput: true, inlineInputLabel: 'Severity', inlineInputValue: '', inlineInputPlaceholder: 'P1 / P2 / P3' },
    ],
  },
  {
    id: 'containment',
    title: 'Containment',
    subtitle: 'mitigazione',
    type: 'checklist',
    items: [
      { id: 'containment-1', text: 'Attivare mitigazione CDN/WAF (DDoS mode, bot protection)', checked: false },
      { id: 'containment-2', text: 'Rate limiting e regole WAF mirate (path, user-agent, geo)', checked: false },
      { id: 'containment-3', text: 'Failover/scale out (se disponibile)', checked: false, hasInlineInput: true, inlineInputLabel: 'Failover disponibile', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
      { id: 'containment-4', text: 'Coinvolgere ISP per scrubbing/blackhole controllato (se necessario)', checked: false, hasInlineInput: true, inlineInputLabel: 'ISP coinvolto', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
      { id: 'containment-5', text: 'Proteggere servizi core (priorità traffico, isolare admin, API critical)', checked: false },
    ],
  },
  {
    id: 'eradication',
    title: 'Eradication',
    subtitle: 'stabilizzazione',
    type: 'checklist',
    items: [
      { id: 'eradication-1', text: 'Tuning regole WAF e whitelisting controllato', checked: false },
      { id: 'eradication-2', text: 'Fix bottleneck applicativi (cache, DB, pool connessioni)', checked: false },
      { id: 'eradication-3', text: 'Patch misconfig o endpoint troppo "costosi" (L7)', checked: false },
      { id: 'eradication-4', text: 'Aggiornare runbook e capacity planning', checked: false },
    ],
  },
  {
    id: 'recovery',
    title: 'Recovery',
    type: 'checklist',
    items: [
      { id: 'recovery-1', text: 'Validare performance e stabilità', checked: false },
      { id: 'recovery-2', text: 'Rimuovere mitigazioni temporanee non necessarie (con cautela)', checked: false },
      { id: 'recovery-3', text: 'Monitoring e reporting con provider', checked: false },
    ],
  },
  {
    id: 'evidence',
    title: 'Evidenze Minime',
    type: 'checklist',
    items: [
      { id: 'evidence-1', text: 'Metriche traffico (pps, bps, req/s), log WAF/CDN', checked: false },
      { id: 'evidence-2', text: 'Timeline mitigazioni e cambi config', checked: false },
      { id: 'evidence-3', text: 'Downtime totale e impatto utenti', checked: false, hasInlineInput: true, inlineInputLabel: 'Downtime (ore)', inlineInputValue: '', inlineInputPlaceholder: 'es. 2' },
    ],
  },
  {
    id: 'gonogo',
    title: 'Go/No-Go',
    subtitle: 'Criteri di chiusura',
    type: 'checklist',
    items: [
      {
        id: 'gonogo-1',
        text: 'Servizi stabili e performance nella norma per',
        checked: false,
        hasInlineInput: true,
        inlineInputLabel: 'ore',
        inlineInputValue: '',
        inlineInputPlaceholder: 'es. 24',
      },
      { id: 'gonogo-2', text: 'Mitigazioni permanenti attive e testate', checked: false },
      { id: 'gonogo-3', text: 'Comunicazioni con provider/ISP chiuse', checked: false },
      { id: 'gonogo-4', text: 'Stakeholder informati e incident ticket chiuso', checked: false },
    ],
  },
];

export const ddosPlaybook: Playbook = {
  id: 'ddos-attack',
  title: 'DDoS / Availability Loss',
  category: 'Rete',
  severity: 'Alta',
  icon: 'network',
  duration: '1 - 2 ore',
  description: 'Mitigazione degli attacchi DDoS e perdita di disponibilità dei servizi.',
  purpose: 'Ripristinare disponibilità e ridurre impatto, coordinandosi con ISP/CDN/WAF e continuità.',
  owner: [
    {
      id: 'owner-tecnico',
      label: 'Owner Tecnico',
      value: 'Head IT/Network',
      placeholder: 'es. Head IT/Network',
      allowDirectoryPicker: true,
    },
    {
      id: 'coordinamento',
      label: 'Coordinamento',
      value: 'IRM',
      placeholder: 'es. IRM',
      allowDirectoryPicker: true,
    },
    {
      id: 'oversight',
      label: 'Oversight',
      value: 'CISO',
      placeholder: 'es. CISO',
      allowDirectoryPicker: true,
    },
    {
      id: 'terze-parti',
      label: 'Terze Parti',
      value: 'ISP/CDN/WAF provider',
      placeholder: 'es. ISP/CDN/WAF provider',
      allowDirectoryPicker: true,
    },
  ],
  sections: mergeCommonStandards(ddosBaseSections),
};
