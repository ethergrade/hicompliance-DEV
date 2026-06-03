/**
 * Portfolio-level Risk Index (0-100) per DarkRisk360.
 *
 * Distinto dal per-finding risk_score (darkrisk-scoring.ts):
 * questo aggrega tutti i finding attivi di un'organizzazione in un
 * indice sintetico che rappresenta l'esposizione complessiva.
 */

export interface ActiveFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  risk_score: number;        // 0-100
  confidence: 'low' | 'medium' | 'high';
  last_seen_at: string | null;
  status: string;
}

const INACTIVE_STATUSES = new Set([
  'resolved',
  'suppressed',
  'false_positive',
  'accepted_risk',
]);

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 1.0,
  high:     0.7,
  medium:   0.4,
  low:      0.2,
  info:     0.05,
};

/**
 * Calcola il Risk Index di portfolio per una lista di finding.
 *
 * Formula:
 *   countFactor   = min(100, 20 × log10(N+1))
 *   severityScore = media ponderata (weight × risk_score/100) × 100
 *   recencyBoost  = (finding visti negli ultimi 7gg / totale) × 20  [max +20]
 *   criticalFloor = 60 se esiste almeno 1 finding critical
 *   RiskIndex     = max(criticalFloor, min(100, round(countFactor×0.3 + severityScore×0.5 + recencyBoost)))
 */
export function calculatePortfolioRiskIndex(findings: ActiveFinding[]): number {
  const active = findings.filter((f) => !INACTIVE_STATUSES.has(f.status));
  if (active.length === 0) return 0;

  const n = active.length;

  // Componente 1: fattore quantità (scala log per evitare dominio di volume)
  const countFactor = Math.min(100, 20 * Math.log10(n + 1));

  // Componente 2: severità ponderata
  const weightedSum = active.reduce((sum, f) => {
    const w = SEVERITY_WEIGHT[f.severity] ?? 0.1;
    return sum + w * (Math.max(0, Math.min(100, f.risk_score)) / 100);
  }, 0);
  const severityScore = (weightedSum / n) * 100;

  // Componente 3: recency boost — finding visti nella settimana corrente
  const recentCutoffMs = Date.now() - 7 * 86_400_000;
  const recentCount = active.filter((f) => {
    const ts = f.last_seen_at ? Date.parse(f.last_seen_at) : 0;
    return ts > recentCutoffMs;
  }).length;
  const recencyBoost = (recentCount / n) * 20;

  // Floor: se c'è almeno un critical il minimo è 60
  const hasCritical = active.some((f) => f.severity === 'critical');
  const criticalFloor = hasCritical ? 60 : 0;

  const raw = countFactor * 0.3 + severityScore * 0.5 + recencyBoost;
  return Math.max(criticalFloor, Math.min(100, Math.round(raw)));
}

/**
 * Mappa interi media type IntelX → label leggibili per results_by_filetype.
 * Documentazione Search API v5.
 */
export const INTELX_MEDIA_LABELS: Record<number, string> = {
  0:  'unknown',
  1:  'html',
  2:  'text',
  3:  'paste',
  4:  'csv',
  5:  'pdf',
  6:  'word',
  7:  'image',
  8:  'video',
  9:  'mobile_app',
  13: 'audio',
  14: 'database',
  15: 'archive',
  16: 'email_body',
  17: 'forum',
  18: 'code',
  19: 'certificate',
  20: 'social',
};

/**
 * Label UI per bucket IntelX (results_by_source).
 */
export const INTELX_BUCKET_LABELS: Record<string, string> = {
  // underscore form
  leaks_restricted:      'Leaks › Restricted',
  leaks_logs:            'Leaks › Logs',
  leaks_public:          'Leaks › Public',
  // dot form (IntelX API actual values)
  'leaks.logs':          'Leaks › Logs',
  'leaks.private.general': 'Leaks › Private',
  'leaks.public.general':  'Leaks › Public',
  'leaks.restricted':    'Leaks › Restricted',
  'web.public.com':      'Web: .com',
  'web.public.it':       'Web: .it',
  'web.public.org':      'Web: .org',
  'web.public.net':      'Web: .net',
  whois:                 'WHOIS',
  dns:                   'DNS',
  DNS:                   'DNS',
  paste:                 'Paste Sites',
  social:                'Social Media',
  forum:                 'Forum',
  darkweb:               'Dark Web',
  '.com':                'Web: .com',
  '.it':                 'Web: .it',
  '.org':                'Web: .org',
  '.net':                'Web: .net',
};

export function mediaLabel(mediaInt: number | null | undefined): string {
  if (mediaInt == null) return 'unknown';
  return INTELX_MEDIA_LABELS[mediaInt] ?? 'unknown';
}

export function bucketLabel(bucket: string | null | undefined): string {
  if (!bucket) return 'other';
  return INTELX_BUCKET_LABELS[bucket] ?? bucket;
}

/**
 * Formato ISO week key: '2026-W23'
 */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Data di inizio della settimana ISO (lunedì) per un dato ISO week key.
 */
export function weekStartDate(weekKey: string): string {
  const [year, weekPart] = weekKey.split('-W');
  const week = parseInt(weekPart, 10);
  const jan4 = new Date(Date.UTC(parseInt(year, 10), 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() - (dayOfWeek - 1) * 86_400_000 + (week - 1) * 7 * 86_400_000);
  return monday.toISOString().slice(0, 10);
}
