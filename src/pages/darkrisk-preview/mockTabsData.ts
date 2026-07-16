// Dati mock per le tab aggiuntive dell'anteprima DarkRisk360 (solo demo).
export type Sev = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  id: string;
  severity: Sev;
  title: string;
  category: string;
  asset: string;
  source: string;
  status: 'new' | 'triaged' | 'investigating' | 'resolved';
  firstSeen: string;
}

export const FINDINGS: Finding[] = [
  { id: 'F-1042', severity: 'critical', title: 'Password admin in chiaro in leak "restricted"', category: 'Credential Exposure', asset: 'terenziboutique.com', source: 'leaks.restricted', status: 'new', firstSeen: 'oggi' },
  { id: 'F-1041', severity: 'critical', title: 'Dump database con 128 record utente', category: 'Data Leak Files', asset: 'cereriaterenzi.com', source: 'leaks.logs', status: 'investigating', firstSeen: '1 g fa' },
  { id: 'F-1039', severity: 'high', title: 'Menzione dominio su marketplace dark web', category: 'Dark Web Mentions', asset: 'terenziboutique.com', source: 'darkweb', status: 'triaged', firstSeen: '2 g fa' },
  { id: 'F-1036', severity: 'high', title: 'Credenziali riutilizzate su 3 servizi', category: 'Credential Exposure', asset: 'cereriaterenzi.com', source: 'leaks.logs', status: 'new', firstSeen: '2 g fa' },
  { id: 'F-1030', severity: 'high', title: 'Record WHOIS registrant modificato di recente', category: 'Domain Threat Intel', asset: '203.0.113.10', source: 'whois', status: 'triaged', firstSeen: '3 g fa' },
  { id: 'F-1024', severity: 'medium', title: 'Indirizzi email aziendali su paste pubblico', category: 'Paste / Public Dumps', asset: 'cereriaterenzi.com', source: 'paste', status: 'new', firstSeen: '4 g fa' },
  { id: 'F-1019', severity: 'medium', title: 'Sottodominio non presidiato con record A attivo', category: 'Domain Threat Intel', asset: 'terenziboutique.com', source: 'dns', status: 'investigating', firstSeen: '5 g fa' },
  { id: 'F-1011', severity: 'medium', title: 'File PDF con dati anagrafici indicizzato', category: 'Data Leak Files', asset: 'terenziboutique.com', source: 'web.public.com', status: 'triaged', firstSeen: '6 g fa' },
  { id: 'F-1004', severity: 'low', title: 'Menzione brand su forum di settore', category: 'Dark Web Mentions', asset: 'cereriaterenzi.com', source: 'forum', status: 'resolved', firstSeen: '8 g fa' },
  { id: 'F-0998', severity: 'low', title: 'Certificato TLS in scadenza tra 20 giorni', category: 'Domain Threat Intel', asset: '203.0.113.10', source: 'dns', status: 'new', firstSeen: '9 g fa' },
];

export const SEVERITY_DISTRIBUTION: Record<Sev, number> = { critical: 18, high: 64, medium: 210, low: 995, info: 0 };

export interface Asset {
  asset: string;
  type: 'Dominio' | 'IP' | 'Range' | 'CIDR';
  scope: 'approved' | 'candidate';
  findings: number;
  critical: number;
  lastSeen: string;
}

export const ASSETS: Asset[] = [
  { asset: 'terenziboutique.com', type: 'Dominio', scope: 'approved', findings: 34, critical: 9, lastSeen: 'oggi' },
  { asset: 'cereriaterenzi.com', type: 'Dominio', scope: 'approved', findings: 27, critical: 6, lastSeen: 'oggi' },
  { asset: 'shop.terenziboutique.com', type: 'Dominio', scope: 'approved', findings: 12, critical: 2, lastSeen: '1 g fa' },
  { asset: '203.0.113.10', type: 'IP', scope: 'approved', findings: 8, critical: 1, lastSeen: '1 g fa' },
  { asset: '203.0.113.0/24', type: 'CIDR', scope: 'candidate', findings: 3, critical: 0, lastSeen: '3 g fa' },
  { asset: 'mail.cereriaterenzi.com', type: 'Dominio', scope: 'candidate', findings: 2, critical: 0, lastSeen: '4 g fa' },
];

export interface SurfaceRow {
  asset: string;
  ip: string;
  port: number;
  service: string;
  severity: Sev;
  detail: string;
}

export const SURFACE: SurfaceRow[] = [
  { asset: 'terenziboutique.com', ip: '203.0.113.10', port: 443, service: 'HTTPS / nginx 1.18', severity: 'medium', detail: 'TLS 1.0 abilitato' },
  { asset: 'terenziboutique.com', ip: '203.0.113.10', port: 22, service: 'SSH / OpenSSH 7.4', severity: 'high', detail: 'Versione con CVE note' },
  { asset: 'cereriaterenzi.com', ip: '203.0.113.11', port: 3306, service: 'MySQL', severity: 'critical', detail: 'DB esposto pubblicamente' },
  { asset: 'shop.terenziboutique.com', ip: '203.0.113.12', port: 80, service: 'HTTP / Apache 2.4', severity: 'low', detail: 'Redirect a HTTPS assente' },
  { asset: '203.0.113.10', ip: '203.0.113.10', port: 8080, service: 'HTTP-alt', severity: 'medium', detail: 'Pannello admin raggiungibile' },
];

export interface IdentityHit {
  email: string;
  breaches: number;
  latest: string;
  data: string[];
}

export const MONITORED_EMAILS = [
  'admin@terenziboutique.com', 'info@terenziboutique.com', 'soc@terenziboutique.com',
  'amministrazione@cereriaterenzi.com', 'ordini@cereriaterenzi.com',
];

export const IDENTITY_HITS: IdentityHit[] = [
  { email: 'admin@terenziboutique.com', breaches: 4, latest: 'oggi', data: ['password', 'email', 'IP'] },
  { email: 'info@terenziboutique.com', breaches: 2, latest: '3 g fa', data: ['email', 'telefono'] },
  { email: 'amministrazione@cereriaterenzi.com', breaches: 3, latest: '1 g fa', data: ['password', 'indirizzo'] },
  { email: 'ordini@cereriaterenzi.com', breaches: 1, latest: '12 g fa', data: ['email'] },
  { email: 'soc@terenziboutique.com', breaches: 2, latest: '5 g fa', data: ['password', 'email'] },
];

export interface ReportRow {
  name: string;
  tier: 'Settimanale' | 'Esteso DTI';
  date: string;
  size: string;
  format: string;
}

export const REPORTS: ReportRow[] = [
  { name: 'DarkRisk360 — Report Esteso DTI', tier: 'Esteso DTI', date: '06/07/2026', size: '2.4 MB', format: 'PDF' },
  { name: 'DarkRisk360 — Snapshot settimanale W27', tier: 'Settimanale', date: '30/06/2026', size: '840 KB', format: 'PDF' },
  { name: 'DarkRisk360 — Snapshot settimanale W26', tier: 'Settimanale', date: '23/06/2026', size: '812 KB', format: 'PDF' },
  { name: 'DarkRisk360 — Snapshot settimanale W25', tier: 'Settimanale', date: '16/06/2026', size: '795 KB', format: 'PDF' },
];

export interface RoadmapPhase {
  code: string;
  title: string;
  status: 'completed' | 'in_progress' | 'blocked' | 'planned';
  progress: number;
}

export const ROADMAP: RoadmapPhase[] = [
  { code: 'MD01', title: 'Scope & selettori', status: 'completed', progress: 100 },
  { code: 'MD02', title: 'Integrazione sorgenti (IntelX, WHOIS, DNS)', status: 'completed', progress: 100 },
  { code: 'MD03', title: 'Ingest & normalizzazione record', status: 'completed', progress: 100 },
  { code: 'MD04', title: 'Tassonomia & scoring finding', status: 'completed', progress: 100 },
  { code: 'MD05', title: 'Analytics & dashboard', status: 'in_progress', progress: 70 },
  { code: 'MD06', title: 'Report & generazione PDF', status: 'in_progress', progress: 55 },
  { code: 'MD07', title: 'Snapshot settimanale & trend', status: 'in_progress', progress: 40 },
  { code: 'MD08', title: 'Notifiche multi-email', status: 'planned', progress: 10 },
  { code: 'MD09', title: 'Roadmap implementazione', status: 'planned', progress: 0 },
  { code: 'MD10', title: 'QA security snapshot', status: 'blocked', progress: 20 },
];

export const QA_CHECKS: Array<{ label: string; ok: boolean }> = [
  { label: 'RLS attiva su tutte le tabelle darkrisk', ok: true },
  { label: 'Evidenze sensibili mascherate di default', ok: true },
  { label: 'Retention dati leak configurata (90gg)', ok: true },
  { label: 'Rate limiting sorgenti IntelX', ok: true },
  { label: 'Audit log accessi evidenze privilegiate', ok: true },
  { label: 'Cifratura payload sensibili a riposo', ok: false },
  { label: 'Test end-to-end orchestratore v2', ok: false },
];

export const MANUAL_TARGETS = [
  { value: 'terenziboutique.com', type: 'Dominio' },
  { value: 'cereriaterenzi.com', type: 'Dominio' },
  { value: '203.0.113.10', type: 'IP' },
  { value: '203.0.113.0/24', type: 'CIDR' },
];

export const NOTIFICATION_RECIPIENTS = [
  'soc@terenziboutique.com', 'ciso@terenziboutique.com', 'it@cereriaterenzi.com',
];
