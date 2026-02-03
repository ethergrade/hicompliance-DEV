import { Playbook, PlaybookSection } from '@/types/playbook';
import { mergeCommonStandards } from './common-standards';

const dataExfiltrationBaseSections: PlaybookSection[] = [
  {
    id: 'triggers',
    title: 'Trigger Tipici',
    type: 'checklist',
    items: [
      { id: 't1', text: 'Picchi egress anomali', checked: false },
      { id: 't2', text: 'Download massivo rilevato', checked: false },
      { id: 't3', text: 'DLP alert', checked: false },
      { id: 't4', text: 'Accessi DB anomali', checked: false },
      { id: 't5', text: 'DNS tunneling rilevato', checked: false },
      { id: 't6', text: 'Upload verso servizi cloud non autorizzati', checked: false },
    ],
  },
  {
    id: 'triage',
    title: 'Triage',
    type: 'checklist',
    items: [
      {
        id: 'triage-1',
        text: 'Confermare esfiltrazione',
        checked: false,
        hasInlineInput: true,
        inlineInputLabel: '',
        inlineInputValue: '',
        inlineInputPlaceholder: 'No / Sì',
      },
      { id: 'triage-2', text: 'Identificare canale egress (proxy/FW/DNS/cloud logs) e timeframe', checked: false },
      { id: 'triage-3', text: 'Identificare dataset e sistemi sorgente (DB/file share/cloud drive)', checked: false },
      { id: 'triage-4', text: 'Stimare quantità e categoria dati (personali, finanziari, IP)', checked: false },
      { id: 'triage-5', text: 'Severity: dati sensibili + esfil confermata → CRITICO/ALTO', checked: false },
    ],
  },
  {
    id: 'containment',
    title: 'Containment',
    type: 'checklist',
    items: [
      { id: 'containment-1', text: 'Bloccare canale egress (FW/Proxy/DNS, policy cloud)', checked: false },
      { id: 'containment-2', text: 'Revoke token/sessioni e bloccare account sospetti', checked: false },
      { id: 'containment-3', text: 'Revocare share/link pubblici e ridurre permessi (least privilege)', checked: false },
      { id: 'containment-4', text: 'Attivare/rafforzare DLP (se disponibile)', checked: false },
      { id: 'containment-5', text: 'Isolare backup e repository dati da rete compromessa', checked: false },
    ],
  },
  {
    id: 'eradication',
    title: 'Eradication',
    type: 'checklist',
    items: [
      { id: 'eradication-1', text: 'Patch entry point e rimuovere persistence', checked: false },
      { id: 'eradication-2', text: 'Ruotare chiavi crittografiche e secrets se compromessi', checked: false },
      { id: 'eradication-3', text: 'Hardening accessi dati (DB audit, access policy, MFA)', checked: false },
      { id: 'eradication-4', text: 'Hunting su log per ulteriori accessi massivi', checked: false },
    ],
  },
  {
    id: 'recovery',
    title: 'Recovery',
    type: 'checklist',
    items: [
      { id: 'recovery-1', text: 'Ripristinare operatività con policy aggiornate e monitoraggio egress intensivo', checked: false },
      { id: 'recovery-2', text: 'Preparare comunicazioni (clienti/autorità) se richiesto', checked: false },
    ],
  },
  {
    id: 'compliance',
    title: 'Compliance',
    type: 'checklist',
    items: [
      { id: 'compliance-1', text: 'NIS2: se significativo o malintento/transfrontaliero → CSIRT (24h/72h)', checked: false },
      { id: 'compliance-2', text: 'GDPR: valutazione data breach e notifiche con DPO/Legal', checked: false },
    ],
  },
  {
    id: 'evidence',
    title: 'Evidenze Minime',
    type: 'checklist',
    items: [
      { id: 'evidence-1', text: 'Proxy/FW/DNS logs con volumi e destinazioni', checked: false },
      { id: 'evidence-2', text: 'Audit DB/cloud (query/download)', checked: false },
      { id: 'evidence-3', text: 'Stima record/dataset e livello confidenza', checked: false },
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
        text: 'Nessuna attività di esfiltrazione rilevata per',
        checked: false,
        hasInlineInput: true,
        inlineInputLabel: 'ore',
        inlineInputValue: '',
        inlineInputPlaceholder: 'es. 48',
      },
      { id: 'gonogo-2', text: 'Canali egress bloccati e policy DLP attive', checked: false },
      { id: 'gonogo-3', text: 'Notifiche compliance inviate (se applicabile)', checked: false },
      { id: 'gonogo-4', text: 'Stakeholder informati e incident ticket chiuso', checked: false },
    ],
  },
];

export const dataExfiltrationPlaybook: Playbook = {
  id: 'data-breach',
  title: 'Data Exfiltration / Data Breach',
  category: 'Dati',
  severity: 'Critica',
  icon: 'database',
  duration: '2 - 4 ore',
  description: 'Gestione di incidenti di esfiltrazione dati e violazioni di dati sensibili.',
  purpose: 'Fermare esfiltrazione, stimare dati coinvolti, preservare evidenze, gestire compliance.',
  owner: [
    {
      id: 'owner-tecnico',
      label: 'Owner Tecnico',
      value: 'SOC/Forensics + Head IT',
      placeholder: 'es. SOC/Forensics + Head IT',
      allowDirectoryPicker: true,
    },
    {
      id: 'compliance',
      label: 'Compliance',
      value: 'Legal/DPO',
      placeholder: 'es. Legal/DPO',
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
  ],
  sections: mergeCommonStandards(dataExfiltrationBaseSections),
};
