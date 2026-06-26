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

