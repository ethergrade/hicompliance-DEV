import { Playbook, PlaybookSection } from '@/types/playbook';
import { ransomwarePlaybook } from './ransomware';
import { mergeCommonStandards } from './common-standards';

const phishingBaseSections: PlaybookSection[] = [
  {
    id: 'triggers',
    title: 'Trigger tipici',
    type: 'checklist',
    items: [
      { id: 't1', text: 'Segnalazione utente di email sospetta (link/allegato cliccato)', checked: false, link: '', linkLabel: 'Link all\'email' },
      { id: 't2', text: 'Login anomalo (geo, impossible travel, device nuovo)', checked: false, link: '', linkLabel: 'Link al log' },
      { id: 't3', text: 'Inbox rule/forwarding creati, OAuth app sconosciuta', checked: false, link: '', linkLabel: 'Link all\'evidenza' },
      { id: 't4', text: 'Accessi non coerenti a mailbox, CRM, cloud drive, VPN', checked: false, link: '', linkLabel: 'Link al report' },
    ]
  },
  {
    id: 'triage',
    title: 'Triage',
    subtitle: 'Entro 60 min',
    type: 'checklist',
    items: [
      { id: 'tr1', text: 'Confermare se evento (tentativo) o incidente (accesso effettivo)', checked: false },
      { id: 'tr2', text: 'Identificare account/utente coinvolto (UPN, mailbox, app SaaS)', checked: false },
      { id: 'tr3', text: 'Verificare IdP/IAM logs: orari login, IP, device', checked: false },
      { id: 'tr4', text: 'Controllare se MFA by-passato (token rubato, SIM swap, fatigue)', checked: false },
      { id: 'tr5', text: 'Verificare se email di phishing ancora presenti in altre mailbox', checked: false },
      { id: 'tr6', text: 'Richiedere log Mail Transport se necessario', checked: false },
      { 
        id: 'tr7', 
        text: 'Assegnare severity in base a impatto stimato', 
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
      { id: 'c1', text: 'Disabilitare o forzare logout account compromesso', checked: false },
      { id: 'c2', text: 'Terminare sessioni attive (es. Entra ID, Google Workspace, Okta)', checked: false },
      { id: 'c3', text: 'Revocare OAuth app sospette', checked: false },
      { id: 'c4', text: 'Rimuovere regole di inoltro/forwarding malevole', checked: false },
      { id: 'c5', text: 'Bloccare IP/dominio coinvolti se fattibile (firewall, WAF, proxy)', checked: false },
      { id: 'c6', text: 'Isolare endpoint se sospetto malware correlato', checked: false },
      { id: 'c7', text: 'Se VIP/C-level: informare subito Crisis Manager', checked: false },
      { id: 'c8', text: 'Verificare attività laterale: access audit SharePoint, Teams, S3', checked: false },
      { id: 'c9', text: 'Verificare esfiltrazione: download massivo, mail forward esterne', checked: false },
    ]
  },
  {
    id: 'eradication',
    title: 'Eradication',
    type: 'checklist',
    items: [
      { id: 'e1', text: 'Confermare rimozione forwarding, inbox rules malevole', checked: false },
      { id: 'e2', text: 'Verificare token OAuth/refresh token invalidati', checked: false },
      { id: 'e3', text: 'Eliminare mail phishing da tutte le mailbox (purge)', checked: false },
      { id: 'e4', text: 'Bloccare URL/dominio sul filtro mail e proxy', checked: false },
      { id: 'e5', text: 'Se malware presente: seguire procedura Malware Infection', checked: false },
    ]
  },
  {
    id: 'recovery',
    title: 'Recovery',
    type: 'checklist',
    items: [
      { id: 'r1', text: 'Ripristinare accesso utente con nuovo MFA enrollment', checked: false },
      { id: 'r2', text: 'Forzare cambio password (e di tutti i servizi condivisi se uguali)', checked: false },
      { id: 'r3', text: 'Monitorare nuovo login 48–72 h', checked: false },
      { id: 'r4', text: 'Informare utente su cos\'è accaduto e prevenzione futura', checked: false },
    ]
  },
  {
    id: 'communications',
    title: 'Comunicazioni e Compliance',
    type: 'checklist',
    items: [
      { id: 'com1', text: 'Valutare obbligo notifica Data Breach (art. 33 GDPR) → coinvolgere DPO', checked: false },
      { id: 'com2', text: 'Se dati personali/sanitari/finanziari: comunicare a interessati (art. 34)', checked: false },
    ]
  },
  {
    id: 'evidence',
    title: 'Evidenze Minime',
    type: 'checklist',
    items: [
      { id: 'ev1', text: 'Screenshot mail di phishing originale (header completi)', checked: false },
      { id: 'ev2', text: 'Export log IdP (login attempts, geo, device)', checked: false },
      { id: 'ev3', text: 'Export audit trail (mailbox rules, OAuth apps)', checked: false },
      { id: 'ev4', text: 'Traccia comunicazioni stakeholder (timestamp, destinatari)', checked: false },
    ]
  },
  {
    id: 'gonogo',
    title: 'Go/No-Go',
    subtitle: 'Criteri di chiusura',
    type: 'checklist',
    items: [
      { 
        id: 'g1', 
        text: 'Nessun login anomalo per', 
        checked: false,
        hasInlineInput: true,
        inlineInputLabel: 'ore',
        inlineInputValue: '24',
        inlineInputPlaceholder: '24'
      },
      { id: 'g2', text: 'Nessuna regola inbox/forwarding sospetta residua', checked: false },
      { id: 'g3', text: 'MFA e policy rafforzate attive', checked: false },
      { id: 'g4', text: 'Stakeholder informati e incident ticket chiuso', checked: false },
    ]
  },
];

export const phishingPlaybook: Playbook = {
  id: 'phishing-attack',
  title: 'Phishing / Account Compromise',
  category: 'Social Engineering',
  severity: 'Media',
  icon: 'Mail',
  duration: '30 min - 1 ora',
  description: 'Gestione di campagne phishing e compromissione credenziali',
  purpose: 'Bloccare l\'accesso non autorizzato, limitare impatto su dati e reputazione, ripristinare fiducia nell\'account compromesso.',
  owner: [
    { id: 'owner-tech', label: 'Owner tecnico', value: '', placeholder: 'Head IT / SOC', required: true, allowDirectoryPicker: true },
    { id: 'coordinamento', label: 'Coordinamento', value: '', placeholder: 'IRM', required: true, allowDirectoryPicker: true },
    { id: 'oversight', label: 'Oversight', value: '', placeholder: 'CISO', required: false, allowDirectoryPicker: true },
    { id: 'compliance', label: 'Compliance', value: '', placeholder: 'Legal/DPO (se dati personali impattati)', required: false, allowDirectoryPicker: true },
  ],
  sections: mergeCommonStandards(phishingBaseSections),
};

// Export map of all playbooks for easy access
export const playbooksMap: Record<string, Playbook> = {
  'phishing-attack': phishingPlaybook,
  'ransomware': ransomwarePlaybook,
};
