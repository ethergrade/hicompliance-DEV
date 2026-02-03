import { Playbook, PlaybookSection } from '@/types/playbook';
import { mergeCommonStandards } from './common-standards';

const physicalSecurityBaseSections: PlaybookSection[] = [
  {
    id: 'triggers',
    title: 'Trigger tipici',
    type: 'checklist',
    items: [
      { id: 't1', text: 'Furto laptop/server, accesso non autorizzato in sala server, manomissione rack', checked: false, link: '', linkLabel: 'Link all\'evidenza' },
      { id: 't2', text: 'Allarmi fisici attivati', checked: false, link: '', linkLabel: 'Link al log allarmi' },
      { id: 't3', text: 'Badge anomalies rilevate', checked: false, link: '', linkLabel: 'Link badge logs' },
      { id: 't4', text: 'CCTV evento registrato', checked: false, link: '', linkLabel: 'Link filmato' },
    ]
  },
  {
    id: 'triage',
    title: 'Triage',
    type: 'checklist',
    items: [
      { id: 'tr1', text: 'Confermare evento e delimitare area', checked: false, hasInlineInput: true, inlineInputLabel: 'Evento confermato', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
      { id: 'tr2', text: 'Inventario asset coinvolti (seriali, asset tag)', checked: false },
      { id: 'tr3', text: 'Valutare dati potenzialmente esposti (disk encryption? accessi?)', checked: false, hasInlineInput: true, inlineInputLabel: 'Disk encryption attiva', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
      { id: 'tr4', text: 'Estrarre badge logs per timeframe', checked: false },
      { id: 'tr5', text: 'Estrarre filmati CCTV per timeframe', checked: false },
      { 
        id: 'tr6', 
        text: 'Severity in base a asset critico e dati', 
        checked: false,
        hasInlineInput: true,
        inlineInputLabel: 'Severity',
        inlineInputValue: '',
        inlineInputPlaceholder: 'es. P1/P2/P3'
      },
    ]
  },
  {
    id: 'containment',
    title: 'Containment',
    type: 'checklist',
    items: [
      { id: 'c1', text: 'Revocare badge/accessi fisici correlati', checked: false },
      { id: 'c2', text: 'Disabilitare account se device conteneva token/keys', checked: false, hasInlineInput: true, inlineInputLabel: 'Token/keys nel device', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
      { id: 'c3', text: 'Ruotare credenziali se device conteneva token/keys', checked: false },
      { id: 'c4', text: 'Remote wipe/lock (se endpoint gestito)', checked: false, hasInlineInput: true, inlineInputLabel: 'Endpoint gestito', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
      { id: 'c5', text: 'Segregare rete se hardware manomesso (switch/rack)', checked: false, hasInlineInput: true, inlineInputLabel: 'Hardware manomesso', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
    ]
  },
  {
    id: 'eradication',
    title: 'Eradication',
    type: 'checklist',
    items: [
      { id: 'e1', text: 'Sostituzione hardware compromesso', checked: false },
      { id: 'e2', text: 'Rebuild da golden image', checked: false },
      { id: 'e3', text: 'Hardening fisico (locks, seals, access policy)', checked: false },
      { id: 'e4', text: 'Verifica integrità sistemi eventualmente toccati', checked: false },
    ]
  },
  {
    id: 'recovery',
    title: 'Recovery',
    type: 'checklist',
    items: [
      { id: 'r1', text: 'Ripristino operatività', checked: false },
      { id: 'r2', text: 'Audit accessi fisici', checked: false },
      { id: 'r3', text: 'Aggiornamento policy', checked: false },
      { id: 'r4', text: 'Formazione personale', checked: false },
    ]
  },
  {
    id: 'evidence',
    title: 'Evidenze Minime',
    type: 'checklist',
    items: [
      { id: 'ev1', text: 'Badge logs estratti', checked: false },
      { id: 'ev2', text: 'Estratti CCTV', checked: false },
      { id: 'ev3', text: 'Inventario asset', checked: false },
      { id: 'ev4', text: 'Denuncia (se applicabile) e numero protocollo', checked: false, hasInlineInput: true, inlineInputLabel: 'Denuncia presentata', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
      { id: 'ev5', text: 'Chain of custody se acquisizioni forensi', checked: false, hasInlineInput: true, inlineInputLabel: 'Acquisizioni forensi', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
    ]
  },
];

export const physicalSecurityPlaybook: Playbook = {
  id: 'physical-security',
  title: 'Physical Security Breach',
  category: 'Sicurezza Fisica',
  severity: 'Alta',
  icon: 'Shield',
  duration: '1-3 ore',
  description: 'Preservare scena ed evidenze, ridurre rischio su dati, ripristinare sicurezza fisica e logica',
  purpose: 'Preservare scena ed evidenze, ridurre rischio su dati, ripristinare sicurezza fisica e logica.',
  owner: [
    { id: 'owner-tech', label: 'Owner tecnico', value: '', placeholder: 'Head IT + Facilities/Security', required: true, allowDirectoryPicker: true },
    { id: 'coordinamento', label: 'Coordinamento', value: '', placeholder: 'IRM', required: true, allowDirectoryPicker: true },
    { id: 'oversight', label: 'Oversight', value: '', placeholder: 'CISO', required: false, allowDirectoryPicker: true },
    { id: 'legal', label: 'Legal', value: '', placeholder: 'Se denuncia o compliance', required: false, allowDirectoryPicker: true },
  ],
  sections: mergeCommonStandards(physicalSecurityBaseSections),
};
