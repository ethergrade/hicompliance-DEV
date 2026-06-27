// Tassonomia statica per finding_type non-CVE (Web Check / OSINT / security headers).
// Mappa ogni finding interno a CWE + OWASP Top 10 2021 + score baseline 0-10.

export interface FindingTaxonomy {
  cwe: string;
  owasp: string;
  owaspLabel: string;
  baseScore: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
}

const OWASP_2021: Record<string, string> = {
  'A01:2021': 'Broken Access Control',
  'A02:2021': 'Cryptographic Failures',
  'A03:2021': 'Injection',
  'A04:2021': 'Insecure Design',
  'A05:2021': 'Security Misconfiguration',
  'A06:2021': 'Vulnerable & Outdated Components',
  'A07:2021': 'Identification & Authentication Failures',
  'A08:2021': 'Software & Data Integrity Failures',
  'A09:2021': 'Security Logging & Monitoring Failures',
  'A10:2021': 'Server-Side Request Forgery',
};

const TAXONOMY: Record<string, Omit<FindingTaxonomy, 'owaspLabel'>> = {
  missing_referrer_policy: { cwe: 'CWE-200', owasp: 'A01:2021', baseScore: 3.1, severity: 'low', category: 'security_headers' },
  missing_xfo:             { cwe: 'CWE-1021', owasp: 'A05:2021', baseScore: 5.4, severity: 'medium', category: 'security_headers' },
  missing_xcto:            { cwe: 'CWE-79', owasp: 'A03:2021', baseScore: 4.3, severity: 'medium', category: 'security_headers' },
  missing_x_content_type_options: { cwe: 'CWE-79', owasp: 'A03:2021', baseScore: 4.3, severity: 'medium', category: 'security_headers' },
  missing_csp:             { cwe: 'CWE-1021', owasp: 'A05:2021', baseScore: 6.1, severity: 'medium', category: 'security_headers' },
  missing_hsts:            { cwe: 'CWE-319', owasp: 'A02:2021', baseScore: 5.9, severity: 'medium', category: 'security_headers' },
  weak_hsts:               { cwe: 'CWE-319', owasp: 'A02:2021', baseScore: 4.0, severity: 'low', category: 'security_headers' },
  missing_permissions_policy: { cwe: 'CWE-693', owasp: 'A05:2021', baseScore: 3.1, severity: 'low', category: 'security_headers' },
  server_header_leak:      { cwe: 'CWE-200', owasp: 'A05:2021', baseScore: 2.7, severity: 'low', category: 'security_headers' },
  server_header_exposed:   { cwe: 'CWE-200', owasp: 'A05:2021', baseScore: 2.7, severity: 'low', category: 'security_headers' },
  x_powered_by_leak:       { cwe: 'CWE-200', owasp: 'A05:2021', baseScore: 2.7, severity: 'low', category: 'security_headers' },
  x_powered_by_exposed:    { cwe: 'CWE-200', owasp: 'A05:2021', baseScore: 2.7, severity: 'low', category: 'security_headers' },
  missing_framing_protection: { cwe: 'CWE-1021', owasp: 'A05:2021', baseScore: 5.4, severity: 'medium', category: 'security_headers' },
  tls_expired:             { cwe: 'CWE-298', owasp: 'A02:2021', baseScore: 7.5, severity: 'high', category: 'tls' },
  tls_self_signed:         { cwe: 'CWE-295', owasp: 'A02:2021', baseScore: 5.9, severity: 'medium', category: 'tls' },
  tls_weak_protocol:       { cwe: 'CWE-326', owasp: 'A02:2021', baseScore: 7.4, severity: 'high', category: 'tls' },
  tls_weak_cipher:         { cwe: 'CWE-327', owasp: 'A02:2021', baseScore: 5.9, severity: 'medium', category: 'tls' },
  tls_expiring_soon:       { cwe: 'CWE-298', owasp: 'A02:2021', baseScore: 3.7, severity: 'low', category: 'tls' },
  spf_missing:             { cwe: 'CWE-290', owasp: 'A07:2021', baseScore: 5.3, severity: 'medium', category: 'email_auth' },
  spf_weak:                { cwe: 'CWE-290', owasp: 'A07:2021', baseScore: 4.3, severity: 'medium', category: 'email_auth' },
  dmarc_missing:           { cwe: 'CWE-290', owasp: 'A07:2021', baseScore: 5.3, severity: 'medium', category: 'email_auth' },
  dmarc_weak:              { cwe: 'CWE-290', owasp: 'A07:2021', baseScore: 4.3, severity: 'medium', category: 'email_auth' },
  dkim_missing:            { cwe: 'CWE-290', owasp: 'A07:2021', baseScore: 4.3, severity: 'medium', category: 'email_auth' },
  dnssec_missing:          { cwe: 'CWE-345', owasp: 'A08:2021', baseScore: 4.0, severity: 'low', category: 'dns' },
  cookie_missing_secure:   { cwe: 'CWE-614', owasp: 'A02:2021', baseScore: 5.4, severity: 'medium', category: 'cookies' },
  cookie_missing_httponly: { cwe: 'CWE-1004', owasp: 'A05:2021', baseScore: 5.4, severity: 'medium', category: 'cookies' },
  cookie_missing_samesite: { cwe: 'CWE-1275', owasp: 'A05:2021', baseScore: 4.3, severity: 'low', category: 'cookies' },
  open_directory_listing:  { cwe: 'CWE-548', owasp: 'A05:2021', baseScore: 5.3, severity: 'medium', category: 'exposure' },
  exposed_admin_panel:     { cwe: 'CWE-284', owasp: 'A01:2021', baseScore: 7.5, severity: 'high', category: 'exposure' },
  sensitive_file_exposed:  { cwe: 'CWE-538', owasp: 'A01:2021', baseScore: 7.5, severity: 'high', category: 'exposure' },
  outdated_software:       { cwe: 'CWE-1104', owasp: 'A06:2021', baseScore: 6.5, severity: 'medium', category: 'components' },
  default_credentials:     { cwe: 'CWE-798', owasp: 'A07:2021', baseScore: 9.8, severity: 'critical', category: 'auth' },
  open_port_exposed:       { cwe: 'CWE-284', owasp: 'A05:2021', baseScore: 0, severity: 'medium', category: 'network_exposure' },
  internet_exposed_service:{ cwe: 'CWE-284', owasp: 'A05:2021', baseScore: 0, severity: 'medium', category: 'network_exposure' },
  service_fingerprint_exposed: { cwe: 'CWE-200', owasp: 'A05:2021', baseScore: 0, severity: 'low', category: 'network_exposure' },
  shodan_cve_signal:       { cwe: 'CWE-1104', owasp: 'A06:2021', baseScore: 6.8, severity: 'medium', category: 'threat_intel' },
  shodan_cve_signal_domain:{ cwe: 'CWE-1104', owasp: 'A06:2021', baseScore: 6.8, severity: 'medium', category: 'threat_intel' },
  shodan_cve_signal_ip:    { cwe: 'CWE-1104', owasp: 'A06:2021', baseScore: 7.2, severity: 'medium', category: 'threat_intel' },
  shodan_cve_signal_unattributed: { cwe: 'CWE-200', owasp: 'A05:2021', baseScore: 3.5, severity: 'low', category: 'threat_intel' },
};

export function getFindingTaxonomy(findingType?: string | null): FindingTaxonomy | null {
  if (!findingType) return null;
  const t = TAXONOMY[findingType];
  if (!t) return null;
  return { ...t, owaspLabel: OWASP_2021[t.owasp] ?? t.owasp };
}

export const OWASP_TOP_10 = OWASP_2021;

export function nvdLink(cve: string): string {
  return `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`;
}

export function cweLink(cwe: string): string {
  const num = cwe.replace(/^CWE-/i, '');
  return `https://cwe.mitre.org/data/definitions/${num}.html`;
}

export const CVE_REGEX = /CVE-\d{4}-\d{4,7}/gi;
export const CWE_REGEX = /CWE-\d{1,5}/gi;

// Descrizioni brevi (IT) per CWE usate dalla tassonomia interna
export const CWE_DESCRIPTIONS: Record<string, string> = {
  'CWE-79': 'Cross-site Scripting (XSS): input non sanitizzato che permette iniezione di script nel browser della vittima.',
  'CWE-200': 'Esposizione di informazioni sensibili a soggetti non autorizzati.',
  'CWE-284': 'Controllo accessi improprio: risorse accessibili senza adeguata autorizzazione.',
  'CWE-290': 'Bypass dell\'autenticazione tramite spoofing (es. mittente email falsificato).',
  'CWE-295': 'Validazione del certificato TLS impropria o assente.',
  'CWE-298': 'Validazione della scadenza del certificato impropria.',
  'CWE-319': 'Trasmissione di dati sensibili in chiaro (senza HTTPS/HSTS).',
  'CWE-326': 'Algoritmo crittografico debole o inadeguato.',
  'CWE-327': 'Uso di cipher TLS deboli o obsoleti.',
  'CWE-345': 'Verifica insufficiente dell\'autenticità dei dati (es. DNSSEC mancante).',
  'CWE-538': 'File con informazioni sensibili esposti pubblicamente.',
  'CWE-548': 'Directory listing abilitato che espone la struttura del server.',
  'CWE-614': 'Cookie sensibile senza attributo Secure (rischio man-in-the-middle).',
  'CWE-693': 'Meccanismo di protezione mancante (es. Permissions-Policy).',
  'CWE-798': 'Credenziali di default o hard-coded utilizzate in produzione.',
  'CWE-1004': 'Cookie sensibile senza flag HttpOnly (rischio XSS).',
  'CWE-1021': 'Restrizioni sul rendering improprie: rischio clickjacking / framing.',
  'CWE-1104': 'Uso di componenti software non mantenuti o vulnerabili.',
  'CWE-1275': 'Cookie sensibile con SameSite mancante o non restrittivo.',
};

export function cweDescription(cwe?: string | null): string | null {
  if (!cwe) return null;
  return CWE_DESCRIPTIONS[cwe.toUpperCase()] ?? null;
}

export function owaspDescription(code?: string | null): string | null {
  if (!code) return null;
  const label = OWASP_2021[code];
  return label ? `OWASP Top 10 (${code}) — ${label}` : null;
}

// Sintesi leggibile (IT) per un finding interno
export function findingSummary(findingType?: string | null): string | null {
  if (!findingType) return null;
  const tax = getFindingTaxonomy(findingType);
  if (!tax) return null;
  const cweDesc = cweDescription(tax.cwe);
  const owaspLabel = OWASP_2021[tax.owasp];
  const parts = [
    cweDesc,
    owaspLabel ? `Categoria OWASP ${tax.owasp}: ${owaspLabel}.` : null,
  ].filter(Boolean);
  return parts.join(' ');
}
