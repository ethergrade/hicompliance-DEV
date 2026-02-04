import { Playbook, PlaybookSection } from '@/types/playbook';
import { mergeCommonStandards } from './common-standards';

const unauthorizedAccessBaseSections: PlaybookSection[] = [
  {
    id: 'triggers',
    title: 'Trigger tipici',
    type: 'checklist',
    items: [
      { id: 't1', text: 'Login anomali su server/admin', checked: false, link: '', linkLabel: 'Link al log' },
      { id: 't2', text: 'Nuovi account/admin creati senza autorizzazione', checked: false, link: '', linkLabel: 'Link all\'evidenza' },
      { id: 't3', text: 'Escalation privilegi rilevata', checked: false, link: '', linkLabel: 'Link al report' },
      { id: 't4', text: 'Comandi sospetti eseguiti, webshell rilevata', checked: false, link: '', linkLabel: 'Link all\'alert' },
      { id: 't5', text: 'Alert IDS/IPS attivato', checked: false, link: '', linkLabel: 'Link IDS/IPS' },
      { id: 't6', text: 'Scansioni interne rilevate', checked: false, link: '', linkLabel: 'Link scan log' },
      { id: 't7', text: 'EDR lateral movement alert', checked: false, link: '', linkLabel: 'Link EDR' },
    ]
  },
  {
    id: 'triage',
    title: 'Triage',
    type: 'checklist',
    items: [
      { id: 'tr1', text: 'Confermare intrusion (evidenze accesso non autorizzato/abuso privilegi)', checked: false, hasInlineInput: true, inlineInputLabel: 'Intrusione confermata', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
      { id: 'tr2', text: 'Identificare entry point', checked: false },
      { id: 'tr3', text: 'Identificare account coinvolti', checked: false },
      { id: 'tr4', text: 'Determinare se l\'attaccante è ancora attivo (sessioni, beaconing)', checked: false, hasInlineInput: true, inlineInputLabel: 'Attaccante attivo', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
      { id: 'tr5', text: 'Scope: server, DB, app, cloud, AD/IAM', checked: false },
      { 
        id: 'tr6', 
        text: 'Severity in base a asset critici e impatto CIA', 
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
      { id: 'c1', text: 'Disabilitare account compromessi', checked: false },
      { id: 'c2', text: 'Terminare sessioni attive', checked: false },
      { id: 'c3', text: 'Bloccare accessi esterni (IP/ASN) con cautela (falsi positivi)', checked: false },
      { id: 'c4', text: 'Segmentazione d\'emergenza (limitare east-west)', checked: false },
      { id: 'c5', text: 'Preservare log (IAM, VPN, FW, proxy, app, DB) prima retention', checked: false },
      { id: 'c6', text: 'Proteggere asset critici: limitare admin access', checked: false },
      { id: 'c7', text: 'Enforce jump host per accessi privilegiati', checked: false },
    ]
  },
  {
    id: 'eradication',
    title: 'Eradication',
    type: 'checklist',
    items: [
      { id: 'e1', text: 'Rimuovere webshell', checked: false },
      { id: 'e2', text: 'Rimuovere SSH keys non autorizzate', checked: false },
      { id: 'e3', text: 'Rimuovere scheduled tasks malevoli', checked: false },
      { id: 'e4', text: 'Rimuovere servizi sospetti', checked: false },
      { id: 'e5', text: 'Rimuovere WMI persistence (Windows)', checked: false },
      { id: 'e6', text: 'Verificare rimozione completa backdoor', checked: false, hasInlineInput: true, inlineInputLabel: 'Backdoor rimossa', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
    ]
  },
  {
    id: 'recovery',
    title: 'Recovery',
    type: 'checklist',
    items: [
      { id: 'r1', text: 'Ripristinare servizi con policy rafforzate', checked: false },
      { id: 'r2', text: 'Enforce MFA su tutti gli account coinvolti', checked: false },
      { id: 'r3', text: 'Implementare conditional access', checked: false },
      { id: 'r4', text: 'Verifiche end-to-end', checked: false },
      { id: 'r5', text: 'Attivare monitoraggio potenziato', checked: false },
    ]
  },
  {
    id: 'compliance',
    title: 'Compliance',
    type: 'checklist',
    items: [
      { id: 'comp1', text: 'Se malintento sospetto/confermato → valutare Pre-alert CSIRT 24h', checked: false, hasInlineInput: true, inlineInputLabel: 'Malintento', inlineInputValue: '', inlineInputPlaceholder: 'No / Sospetto / Confermato' },
      { id: 'comp2', text: 'Se dati personali coinvolti → coinvolgere Legal/DPO', checked: false, hasInlineInput: true, inlineInputLabel: 'Dati personali coinvolti', inlineInputValue: '', inlineInputPlaceholder: 'No / Sì' },
    ]
  },
  {
    id: 'evidence',
    title: 'Evidenze Minime',
    type: 'checklist',
    items: [
      { id: 'ev1', text: 'Log autenticazioni e privilegi', checked: false },
      { id: 'ev2', text: 'Artefatti persistenza rimossi (con hash e path)', checked: false },
      { id: 'ev3', text: 'Timeline completa (T0–Tn)', checked: false },
    ]
  },
];

export const unauthorizedAccessPlaybook: Playbook = {
  id: 'unauthorized-access',
  title: 'Unauthorized Access / Intrusion',
  category: 'Sicurezza',
  severity: 'Critica',
  icon: 'ShieldAlert',
  duration: '2-4 ore',
  description: 'Interrompere l\'accesso e il movimento laterale, rimuovere persistenze, ripristinare sicurezza',
  purpose: 'Interrompere l\'accesso e il movimento laterale, rimuovere persistenze, ripristinare sicurezza.',
  owner: [
    { id: 'incident-date', label: 'Data Incidente', value: '', placeholder: 'Seleziona data', required: true, fieldType: 'date', allowDirectoryPicker: false },
    { id: 'owner-tech', label: 'Owner tecnico', value: '', placeholder: 'SOC/Head IT', required: true, allowDirectoryPicker: true },
    { id: 'forensics', label: 'Forensics', value: '', placeholder: 'Se sospetto illegittimo', required: false, allowDirectoryPicker: true },
    { id: 'coordinamento', label: 'Coordinamento', value: '', placeholder: 'IRM', required: true, allowDirectoryPicker: true },
    { id: 'oversight', label: 'Oversight', value: '', placeholder: 'CISO', required: false, allowDirectoryPicker: true },
  ],
  sections: mergeCommonStandards(unauthorizedAccessBaseSections),
};
