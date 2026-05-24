export type DarkRiskSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export function normalizeText(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function normalizeAssetValue(value: string | null | undefined): string {
  return normalizeText(value).toLowerCase();
}

export function mapSurfaceSeverity(value: string | null | undefined): DarkRiskSeverity {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'low') return 'low';
  return 'info';
}

export function riskScoreFromSeverity(severity: DarkRiskSeverity): number {
  switch (severity) {
    case 'critical':
      return 95;
    case 'high':
      return 80;
    case 'medium':
      return 55;
    case 'low':
      return 25;
    default:
      return 10;
  }
}

export function maskEmail(value: string): string {
  const email = normalizeText(value);
  const [local, domain] = email.split('@');
  if (!local || !domain) return '[REDACTED_EMAIL]';
  return `${local.slice(0, 1)}***@${domain}`;
}

export function maskPotentialSecrets(text: string): string {
  const input = normalizeText(text);
  if (!input) return input;

  return input
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => maskEmail(m))
    .replace(/\b(?:password|passwd|pwd)\s*[=:]\s*\S+/gi, 'password=[REDACTED]')
    .replace(/\b(?:token|apikey|api_key|secret)\s*[=:]\s*\S+/gi, 'token=[TOKEN_REDACTED]');
}
