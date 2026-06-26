const SOURCE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(connectsecure|cybercns)\b/i, label: 'Scanner esterno' },
  { pattern: /\bshodan\b/i, label: 'OSINT' },
  { pattern: /\burlscan\b/i, label: 'OSINT' },
  { pattern: /\b(pentest[-_\s]?tools?|ptools)\b/i, label: 'Motore exposure' },
  { pattern: /\b(nmap|nuclei|nikto|httpx|wappalyzer)\b/i, label: 'Motore exposure' },
  { pattern: /\bsurface[_-\s]?scan(?:360)?(?:[_-\s]?engine)?\b/i, label: 'Motore exposure' },
  { pattern: /\bcertificate[_-\s]?transparency|ct[_-\s]?log\b/i, label: 'Certificate Transparency' },
  { pattern: /\breverse[_-\s]?dns\b/i, label: 'Reverse DNS' },
  { pattern: /\bsubdomain[_-\s]?dump\b/i, label: 'Discovery sottodomini' },
  { pattern: /\bmanual|scope\b/i, label: 'Scope' },
  { pattern: /\bcve|nvd|kev|epss\b/i, label: 'CVE/NVD' },
];

const INTERNAL_SOURCE_TOKENS: RegExp[] = [
  /\bconnectsecure\b/gi,
  /\bcybercns\b/gi,
  /\bshodan\b/gi,
  /\burlscan\b/gi,
  /\bpentest[-_\s]?tools?\b/gi,
  /\bptools\b/gi,
  /\bnmap\b/gi,
  /\bnuclei\b/gi,
  /\bnikto\b/gi,
  /\bhttpx\b/gi,
  /\bwappalyzer\b/gi,
  /\bsurface[_-\s]?scan(?:360)?[_-\s]?engine\b/gi,
  /\b[a-z0-9]+(?:_[a-z0-9]+){2,}\b/gi,
];

export const publicSourceLabel = (source: unknown, fallback = 'Evidenza esterna'): string => {
  const raw = String(source || '').trim();
  if (!raw) return fallback;

  for (const entry of SOURCE_PATTERNS) {
    if (entry.pattern.test(raw)) return entry.label;
  }

  const cleaned = raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length > 36 || /[/:]/.test(cleaned)) return fallback;
  return cleaned;
};

export const publicScanTypeLabel = (scanType: unknown): string => {
  const key = String(scanType || '').toLowerCase();
  if (key.includes('connectsecure')) return 'Scanner esterno';
  if (key.includes('exposure')) return 'Motore exposure';
  if (key.includes('subdomain')) return 'Discovery sottodomini';
  return publicSourceLabel(scanType, 'Scan');
};

export const redactInternalSourceNames = (value: unknown, replacement = 'Motore exposure'): string => {
  let out = String(value || '');
  for (const pattern of INTERNAL_SOURCE_TOKENS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s{2,}/g, ' ').trim();
};
