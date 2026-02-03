import { SecurityControl, SecurityControlCategory } from '@/types/riskAnalysis';

export const SECURITY_CONTROLS: SecurityControl[] = [
  // Sicurezza Fisica (9 controlli)
  { id: 'antincendio', name: 'Impianto antincendio', category: 'sicurezza_fisica', order: 1 },
  { id: 'porta_blindata', name: 'Porta blindata', category: 'sicurezza_fisica', order: 2 },
  { id: 'videosorveglianza', name: 'Videosorveglianza', category: 'sicurezza_fisica', order: 3 },
  { id: 'allarme', name: 'Allarme', category: 'sicurezza_fisica', order: 4 },
  { id: 'serratura', name: 'Archivio con serratura', category: 'sicurezza_fisica', order: 5 },
  { id: 'estintori', name: 'Estintori', category: 'sicurezza_fisica', order: 6 },
  { id: 'drenaggio', name: 'Sistema drenaggio/allagamento', category: 'sicurezza_fisica', order: 7 },
  { id: 'accesso_locali', name: 'Sistemi accesso controllato locali', category: 'sicurezza_fisica', order: 8 },
  { id: 'armadio_blindato', name: 'Armadio blindato/ignifugo', category: 'sicurezza_fisica', order: 9 },

  // Controllo Accessi (3 controlli)
  { id: 'solo_autorizzati', name: 'Archivio accessibile solo da autorizzati', category: 'controllo_accessi', order: 10 },
  { id: 'max_tentativi_psw', name: 'Max tentativi password errata', category: 'controllo_accessi', order: 11 },
  { id: 'sospensione_sessioni', name: 'Sospensione sessioni inattive', category: 'controllo_accessi', order: 12 },

  // Gestione Documenti (2 controlli)
  { id: 'distruggi_documenti', name: 'Distruggi documenti', category: 'gestione_documenti', order: 13 },
  { id: 'digitalizzazione', name: 'Digitalizzazione e archiviazione sicura', category: 'gestione_documenti', order: 14 },

  // Sicurezza IT (8 controlli)
  { id: 'firewall', name: 'Firewall', category: 'sicurezza_it', order: 15 },
  { id: 'credenziali', name: 'Credenziali per addetto', category: 'sicurezza_it', order: 16 },
  { id: 'complessita_psw', name: 'Complessità password', category: 'sicurezza_it', order: 17 },
  { id: 'mfa', name: 'MFA (Multi-Factor Authentication)', category: 'sicurezza_it', order: 18 },
  { id: 'antivirus', name: 'Antivirus/Antimalware', category: 'sicurezza_it', order: 19 },
  { id: 'log_monitoring', name: 'Monitoraggio log', category: 'sicurezza_it', order: 20 },
  { id: 'cifratura', name: 'Cifratura dati', category: 'sicurezza_it', order: 21 },
  { id: 'aggiornamenti_sw', name: 'Aggiornamenti software regolari', category: 'sicurezza_it', order: 22 },

  // Continuità Operativa (2 controlli)
  { id: 'backup', name: 'Backup regolare', category: 'continuita_operativa', order: 23 },
  { id: 'disaster_recovery', name: 'Piano Disaster Recovery', category: 'continuita_operativa', order: 24 },

  // Organizzativo (4 controlli)
  { id: 'formazione', name: 'Formazione personale', category: 'organizzativo', order: 25 },
  { id: 'ruoli_responsabilita', name: 'Definizione ruoli e responsabilità', category: 'organizzativo', order: 26 },
  { id: 'gestione_it_esterna', name: 'Gestione IT esterna qualificata', category: 'organizzativo', order: 27 },
  { id: 'tempi_conservazione', name: 'Tempi conservazione definiti', category: 'organizzativo', order: 28 },

  // Compliance (5 controlli)
  { id: 'procedure_breach', name: 'Procedure Data Breach', category: 'compliance', order: 29 },
  { id: 'privacy_docs', name: 'Documentazione privacy (informative, registro)', category: 'compliance', order: 30 },
  { id: 'consensi', name: 'Gestione consensi', category: 'compliance', order: 31 },
  { id: 'regolamento_info', name: 'Regolamento informatico', category: 'compliance', order: 32 },
  { id: 'diritti_interessati', name: 'Gestione diritti interessati', category: 'compliance', order: 33 },
];

export const getControlsByCategory = (category: SecurityControlCategory): SecurityControl[] => {
  return SECURITY_CONTROLS.filter(c => c.category === category).sort((a, b) => a.order - b.order);
};

export const getAllCategories = (): SecurityControlCategory[] => {
  return [
    'sicurezza_fisica',
    'controllo_accessi',
    'gestione_documenti',
    'sicurezza_it',
    'continuita_operativa',
    'organizzativo',
    'compliance',
  ];
};
