import { describe, expect, it } from 'vitest';
import { computeFallbackRisk, formatDateIt, type SurfaceScan360Report } from './surfaceScan360PdfReport';

const report = (overrides: Partial<SurfaceScan360Report>): SurfaceScan360Report =>
  ({ findings: [], findings_by_severity: {}, ...overrides }) as SurfaceScan360Report;

describe('formatDateIt', () => {
  it('non stampa mai "Invalid Date"', () => {
    expect(formatDateIt(undefined)).toBe('n/d');
    expect(formatDateIt('')).toBe('n/d');
    expect(formatDateIt('non-una-data')).toBe('n/d');
  });

  it('formatta una data valida in italiano', () => {
    expect(formatDateIt('2026-09-30T10:00:00Z', false)).toMatch(/^30\/0?9\/2026$/);
  });
});

describe('computeFallbackRisk', () => {
  it('senza niente di osservato il punteggio non si dà', () => {
    expect(computeFallbackRisk(report({}))).toEqual({ score: null, level: 'Non determinabile' });
  });

  // Una postura stimata dalle severità avrebbe una fascia diversa da quella
  // della Console: senza exposure_score del server non si inventa.
  it('nemmeno con finding si inventa una postura', () => {
    expect(computeFallbackRisk(report({ findings_by_severity: { high: 2 } }))).toEqual({ score: null, level: 'Non determinabile' });
  });
});
