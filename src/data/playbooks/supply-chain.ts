import { Playbook, PlaybookSection } from '@/types/playbook';
import { mergeCommonStandards } from './common-standards';

const supplyChainBaseSections: PlaybookSection[] = [
  {
    id: 'triggers',
    title: 'Trigger tipici',
    type: 'checklist',
    items: [
      { id: 't1', text: 'Vendor comunica breach o update malevolo', checked: false, link: '', linkLabel: 'Link comunicazione vendor' },
      { id: 't2', text: 'Compromissione dipendenze (package)', checked: false, link: '', linkLabel: 'Link advisory' },
      { id: 't3', text: 'CI/CD anomalo rilevato', checked: false, link: '', linkLabel: 'Link log CI/CD' },
      { id: 't4', text: 'Firma artefatti non valida', checked: false, link: '', linkLabel: 'Link evidenza' },
      { id: 't5', text: 'Vulnerabilità critica in libreria usata (con exploit attivo)', checked: false, link: '', linkLabel: 'Link CVE' },
    ]
  },
  {
    id: 'triage',
    title: 'Triage',
    type: 'checklist',
    items: [
      { id: 'tr1', text: 'Identificare componente/fornitore impattato', checked: false },
      { id: 'tr2', text: 'Identificare versioni coinvolte', checked: false },
      { id: 'tr3', text: 'Mappare sistemi/app dipendenti (prod, staging, clienti)', checked: false },
      { id: 'tr4', text: 'Verificare integrità artefatti (hash, firme, provenance)', checked: false },
      { 
        id: 'tr5', 
        text: 'Severity: se impatta produzione/servizi critici o clienti → ALTO/CRITICO', 
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
      { id: 'c1', text: 'Stop deploy e freeze release (change freeze)', checked: false },
      { id: 'c2', text: 'Rollback a versione nota-buona', checked: false },
      { id: 'c3', text: 'Bloccare aggiornamenti automatici/package (pin version)', checked: false },
      { id: 'c4', text: 'Revocare chiavi API e integrazioni vendor', checked: false },
      { id: 'c5', text: 'Ruotare credenziali integrazioni vendor', checked: false },
      { id: 'c6', text: 'Segmentare integrazioni e limitare permessi (least privilege)', checked: false },
    ]
  },
  {
    id: 'eradication',
    title: 'Eradication',
    type: 'checklist',
    items: [
      { id: 'e1', text: 'Patch/upgrade a versione sicura (vendor advisory)', checked: false },
      { id: 'e2', text: 'Rebuild artefatti da pipeline trusted e ambiente pulito', checked: false },
      { id: 'e3', text: 'Audit CI/CD: accessi, token, secret leakage', checked: false },
      { id: 'e4', text: 'Verificare runner non compromessi', checked: false },
      { id: 'e5', text: 'Aggiornare SBOM', checked: false },
      { id: 'e6', text: 'Aggiornare policy supply chain (firma, SLSA, scanning)', checked: false },
    ]
  },
  {
    id: 'recovery',
    title: 'Recovery',
    type: 'checklist',
    items: [
      { id: 'r1', text: 'Ripristinare servizi', checked: false },
      { id: 'r2', text: 'Validare integrità end-to-end', checked: false },
      { id: 'r3', text: 'Monitoraggio mirato su componenti dipendenti', checked: false },
      { id: 'r4', text: 'Comunicazioni a clienti/partner se necessario', checked: false },
    ]
  },
  {
    id: 'evidence',
    title: 'Evidenze Minime',
    type: 'checklist',
    items: [
      { id: 'ev1', text: 'Versioni impattate documentate', checked: false },
      { id: 'ev2', text: 'Timeline comunicazione vendor', checked: false },
      { id: 'ev3', text: 'Hash/firme artefatti', checked: false },
      { id: 'ev4', text: 'Log CI/CD', checked: false },
      { id: 'ev5', text: 'Evidenze di rollback/stop', checked: false },
      { id: 'ev6', text: 'Lista applicazioni e ambienti dipendenti', checked: false },
    ]
  },
];

export const supplyChainPlaybook: Playbook = {
  id: 'supply-chain',
  title: 'Supply Chain Incident',
  category: 'Supply Chain',
  severity: 'Critica',
  icon: 'Package',
  duration: '2-6 ore',
  description: 'Bloccare distribuzione di componenti compromessi, verificare integrità software, isolare impatto su ambienti e clienti',
  purpose: 'Bloccare distribuzione di componenti compromessi, verificare integrità software, isolare impatto su ambienti e clienti.',
  owner: [
    { id: 'owner-tech', label: 'Owner tecnico', value: '', placeholder: 'CISO + Head IT/DevOps', required: true, allowDirectoryPicker: true },
    { id: 'coordinamento', label: 'Coordinamento', value: '', placeholder: 'IRM', required: true, allowDirectoryPicker: true },
    { id: 'legal', label: 'Legal/Vendor mgmt', value: '', placeholder: 'Gestione fornitore e comunicazioni', required: false, allowDirectoryPicker: true },
  ],
  sections: mergeCommonStandards(supplyChainBaseSections),
};
