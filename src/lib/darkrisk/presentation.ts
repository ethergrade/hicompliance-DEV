const INTELX_PATTERN = /intelligence\s*x|intelx/gi;

const SOURCE_LABELS: Record<string, string> = {
  surfacescan360: 'SurfaceScan360',
  surface_scan_engine: 'SurfaceScan360',
  surface_exposure_engine: 'SurfaceScan360',
  openai: 'DarkRisk360',
  intelx: 'DarkRisk360',
};

export function maskDarkRiskProvider(value: string | null | undefined): string {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text.replace(INTELX_PATTERN, 'DarkRisk360');
}

export function presentDarkRiskSource(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return 'DarkRisk360';

  const mapped = SOURCE_LABELS[raw.toLowerCase()];
  if (mapped) return mapped;

  return maskDarkRiskProvider(raw);
}

export function presentDarkRiskFindingType(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return 'darkrisk_signal';

  const sanitized = raw
    .replace(/^intelx_/i, 'darkrisk_')
    .replace(INTELX_PATTERN, 'darkrisk360');

  return sanitized;
}
