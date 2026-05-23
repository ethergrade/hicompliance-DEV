export type ExposureSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export function severityWeight(severity: string): number {
  const key = String(severity || '').toLowerCase();
  if (key === 'critical') return 5;
  if (key === 'high') return 4;
  if (key === 'medium') return 3;
  if (key === 'low') return 2;
  return 1;
}

export function normalizeSeverity(value: string): ExposureSeverity {
  const key = String(value || '').toLowerCase();
  if (key === 'critical') return 'critical';
  if (key === 'high') return 'high';
  if (key === 'medium') return 'medium';
  if (key === 'low') return 'low';
  return 'info';
}

export function severityBadgeClass(severity: string): string {
  const key = normalizeSeverity(severity);
  if (key === 'critical') return 'bg-red-600 text-white';
  if (key === 'high') return 'bg-orange-600 text-white';
  if (key === 'medium') return 'bg-yellow-500 text-black';
  if (key === 'low') return 'bg-green-600 text-white';
  return 'bg-slate-600 text-white';
}

export function computeExposureRiskScore(input: {
  openPortsTotal: number;
  criticalExposures: number;
  findingsBySeverity?: {
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    info?: number;
  };
}): { score: number; level: 'Basso' | 'Medio' | 'Alto' | 'Critico' } {
  const openPortsTotal = Number(input.openPortsTotal || 0);
  const criticalExposures = Number(input.criticalExposures || 0);
  const sev = input.findingsBySeverity || {};
  const penalty =
    criticalExposures * 12 +
    Number(sev.critical || 0) * 18 +
    Number(sev.high || 0) * 10 +
    Number(sev.medium || 0) * 5 +
    Number(sev.low || 0) * 2 +
    Math.min(openPortsTotal, 50);

  const score = Math.max(5, Math.min(100, 100 - penalty));

  if (score <= 30) return { score, level: 'Critico' };
  if (score <= 50) return { score, level: 'Alto' };
  if (score <= 75) return { score, level: 'Medio' };
  return { score, level: 'Basso' };
}

