import { Playbook, PlaybookSection } from '@/types/playbook';
import { mergeCommonStandards } from './common-standards';

const ransomwareBaseSections: PlaybookSection[] = [
  {
    id: 'triggers',
    title: 'Trigger Tipici',
    type: 'text',
    content: 'Alert EDR, file cifrati, ransom note, comunicazioni C2, tool di lateral movement. Disabilitazione AV, cancellazione shadow copies, backup jobs falliti.',
  },
  {
    id: 'triage',
    title: 'Triage',
    subtitle: 'entro 60 min',
    type: 'checklist',
    items: [
      {
        id: 'triage-1',
        text: 'Confermare se cifratura/malware è in corso (attivo o contenuto)',
        checked: false,
      },
      {
        id: 'triage-2',
        text: 'Identificare "patient zero" e vettore (email, RDP/VPN, vuln, supply chain)',
        checked: false,
      },
      {
        id: 'triage-3',
        text: 'Scope: endpoint, server, file share, hypervisor, AD/IAM, backup',
        checked: false,
      },
      {
        id: 'triage-4',
        text: 'Verificare integrità e isolamento backup (immutabile/offline)',
        checked: false,
      },
      {
        id: 'triage-5',
        text: 'Severity: se sistemi core o downtime critico → CRITICO/ALTO',
        checked: false,
      },
    ],
  },
  {
    id: 'containment',
    title: 'Containment',
    subtitle: 'immediato',
    type: 'checklist',
    items: [
      {
        id: 'containment-1',
        text: 'Isolare host infetti (EDR network isolation o disconnessione fisica se necessario)',
        checked: false,
      },
      {
        id: 'containment-2',
        text: 'Segmentare rete per bloccare lateral movement (VLAN/subnet ACL)',
        checked: false,
      },
      {
        id: 'containment-3',
        text: 'Disabilitare credenziali sospette (admin/service) e revocare sessioni',
        checked: false,
      },
      {
        id: 'containment-4',
        text: 'Bloccare IoC su FW/Proxy/DNS/EDR (C2, domini, IP, hash)',
        checked: false,
      },
      {
        id: 'containment-5',
        text: 'Preservare evidenze (snapshot/dump) prima di reboot/cleanup (se forensics)',
        checked: false,
      },
      {
        id: 'containment-6',
        text: 'Proteggere backup: bloccare accessi non necessari, segregare repository',
        checked: false,
      },
      {
        id: 'containment-7',
        text: 'Notificare IRM/CISO e avviare Situation Room se ALTO/CRITICO',
        checked: false,
      },
    ],
  },
  {
    id: 'eradication',
    title: 'Eradication',
    type: 'checklist',
    items: [
      {
        id: 'eradication-1',
        text: 'Re-image/rebuild sistemi compromessi (preferibile su core)',
        checked: false,
      },
      {
        id: 'eradication-2',
        text: 'Patch root cause (vuln/misconfig) e hardening (RDP, macro, SMB, admin shares)',
        checked: false,
      },
      {
        id: 'eradication-3',
        text: 'Ruotare credenziali: domain admin, local admin, service account, API keys',
        checked: false,
      },
      {
        id: 'eradication-4',
        text: 'Rimuovere persistence: scheduled tasks, services, webshell, SSH keys, tool remoti',
        checked: false,
      },
      {
        id: 'eradication-5',
        text: 'Hunting su rete: IoC e TTP su sistemi adiacenti',
        checked: false,
      },
    ],
  },
  {
    id: 'recovery',
    title: 'Recovery',
    subtitle: 'strategia',
    type: 'checklist',
    items: [
      {
        id: 'recovery-1',
        text: 'Restore da backup pulito oppure Fresh Install (golden image)',
        checked: false,
      },
      {
        id: 'recovery-2',
        text: 'Test integrità dati e applicazioni (constraint, checks)',
        checked: false,
      },
      {
        id: 'recovery-3',
        text: 'Go-live progressivo: prima infrastruttura base, poi DB, poi app, poi endpoint',
        checked: false,
      },
      {
        id: 'recovery-4',
        text: 'Monitoring potenziato 14–30 gg (alerting aggressivo su indicatori ransomware)',
        checked: false,
      },
    ],
  },
  {
    id: 'communications',
    title: 'Comunicazioni e Compliance',
    type: 'checklist',
    items: [
      {
        id: 'comm-1',
        text: 'Valutare CSIRT (NIS2) se significativo o malintento sospetto',
        checked: false,
      },
      {
        id: 'comm-2',
        text: 'Valutare GDPR se dati personali esfiltrati o accessibili',
        checked: false,
      },
      {
        id: 'comm-3',
        text: 'Comunicazioni stakeholder (CdA/AD) per CRITICO',
        checked: false,
      },
    ],
  },
  {
    id: 'evidence',
    title: 'Evidenze Minime',
    type: 'checklist',
    items: [
      {
        id: 'evidence-1',
        text: 'EDR telemetry (process tree, hash, command line)',
        checked: false,
      },
      {
        id: 'evidence-2',
        text: 'Lista host cifrati + timestamp primo evento',
        checked: false,
      },
      {
        id: 'evidence-3',
        text: 'Snapshot/immagini e chain of custody (se illegittimo)',
        checked: false,
      },
      {
        id: 'evidence-4',
        text: 'Stato backup: ultimo backup "pulito" verificato',
        checked: false,
      },
    ],
  },
  {
    id: 'gonogo',
    title: 'Go/No-Go',
    type: 'checklist',
    items: [
      {
        id: 'gonogo-1',
        text: 'Nessuna attività malevola osservata per ____ ore',
        checked: false,
        hasInlineInput: true,
        inlineInputLabel: 'Ore di osservazione',
        inlineInputValue: '',
        inlineInputPlaceholder: 'es. 24',
      },
      {
        id: 'gonogo-2',
        text: 'Backup reinstituted e test recovery eseguito',
        checked: false,
      },
      {
        id: 'gonogo-3',
        text: 'Credenziali ruotate e MFA enforced dove applicabile',
        checked: false,
      },
    ],
  },
];

export const ransomwarePlaybook: Playbook = {
  id: 'ransomware-malware',
  title: 'Ransomware / Malware',
  category: 'Malware',
  severity: 'Critica',
  icon: 'bug',
  duration: '1 - 4 ore',
  description: 'Playbook per gestione incidenti ransomware e malware con cifratura dati.',
  purpose: 'Fermare propagazione, preservare evidenze, ripristinare da fonti "known-clean", prevenire recidive.',
  owner: [
    {
      id: 'owner-tecnico',
      label: 'Owner Tecnico',
      value: 'Head IT + SOC/Forensics',
      placeholder: 'es. Head IT + SOC/Forensics',
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
      id: 'legal-dpo',
      label: 'Legal/DPO',
      value: 'se dati esfiltrati o breach',
      placeholder: 'es. DPO aziendale',
      allowDirectoryPicker: true,
    },
  ],
  sections: mergeCommonStandards(ransomwareBaseSections),
};
