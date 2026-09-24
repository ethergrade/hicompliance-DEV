import { describe, it, expect } from 'vitest';
import {
  normalizeOrdinal, businessImpactScore, criticalityClass, businessPriorityIndex, residualFromRiskAnalysis,
  expectedAnnualLoss, impactTotals, isMonotonic, recoveryGap, rtoValid, remediationValue, economicScoreFrom24h,
  dependencyScore, BIA_WEIGHTS_V1,
} from './calculations';
import { parseMoney } from './formatters';

const zero = { lost_contribution_margin: 0, idle_labor_cost: 0, extra_operating_cost: 0, recovery_response_cost: 0, contractual_penalties: 0, regulatory_legal_cost: 0, customer_reputation_cost: 0, other_cost: 0 };

describe('normalizzazione', () => {
  it('scala a 4 livelli', () => expect([1, 2, 3, 4].map((l) => normalizeOrdinal(l, 4))).toEqual([25, 50, 75, 100]));
  it('scala a 3 livelli', () => expect([1, 2, 3].map((l) => normalizeOrdinal(l, 3))).toEqual([33.33, 66.67, 100]));
  it('nessun impatto = 0', () => expect(normalizeOrdinal(0, 4)).toBe(0));
  it('fuori intervallo', () => expect(() => normalizeOrdinal(5, 4)).toThrow());
  it('null resta null', () => expect(normalizeOrdinal(null, 4)).toBeNull());
});

describe('Business Impact Score', () => {
  it('pesi sommano a 1', () => expect(Object.values(BIA_WEIGHTS_V1).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10));
  it('tutti zero', () => {
    const s = businessImpactScore({ economic: 0, operational: 0, regulatory: 0, reputational: 0, dependency: 0 });
    expect(s).toBe(0); expect(criticalityClass(s)).toBe('low');
  });
  it('tutti 100', () => {
    const s = businessImpactScore({ economic: 100, operational: 100, regulatory: 100, reputational: 100, dependency: 100 });
    expect(s).toBe(100); expect(criticalityClass(s)).toBe('critical');
  });
  it('esempio Gestione ordini = 80.42 critica', () => {
    const s = businessImpactScore({ economic: 100, operational: 75, regulatory: 33.33, reputational: 66.67, dependency: 100 });
    expect(s).toBe(80.42); expect(criticalityClass(s)).toBe('critical');
    expect(businessPriorityIndex(s, 70)).toBe(56.29);
  });
  it('soglie di classe', () => {
    expect([30, 31, 60, 61, 80, 81].map(criticalityClass)).toEqual(['low', 'medium', 'medium', 'high', 'high', 'critical']);
  });
  it('modello sconosciuto', () => expect(() => businessImpactScore({ economic: 0, operational: 0, regulatory: 0, reputational: 0, dependency: 0 }, 'X')).toThrow());
  it('dimensione mancante = null', () => expect(businessImpactScore({ economic: null, operational: 50, regulatory: 0, reputational: 0, dependency: 0 })).toBeNull());
});

describe('economico', () => {
  it('bucket 24h', () => expect([0, 5000, 10000, 49999, 50000, 100000].map(economicScoreFrom24h)).toEqual([0, 25, 50, 50, 75, 100]));
  it('somma e override', () => {
    expect(impactTotals({ ...zero, lost_contribution_margin: 60000, idle_labor_cost: 15000, contractual_penalties: 25000 }, null).effective).toBe(100000);
    expect(impactTotals(zero, 5000, 'stima CFO').effective).toBe(5000);
  });
  it('override senza motivo', () => expect(() => impactTotals(zero, 10, '')).toThrow());
  it('negativi rifiutati', () => expect(() => impactTotals({ ...zero, other_cost: -1 }, null)).toThrow());
  it('formati valuta italiani', () => {
    expect(parseMoney('1.234,56')).toBe('1234.56'); expect(parseMoney('1234.56')).toBe('1234.56');
    expect(parseMoney('')).toBeNull(); expect(parseMoney('0')).toBe('0'); expect(parseMoney('125.000')).toBe('125000');
  });
  it('curva non monotona', () => expect(isMonotonic([{ horizon_minutes: 1440, total: 10 }, { horizon_minutes: 4320, total: 5 }])).toBe(false));
});

describe('recovery', () => {
  it('RTO vs MTPD', () => { expect(rtoValid(240, 1440)).toBe(true); expect(rtoValid(1440, 1440)).toBe(false); });
  it('gap e sconosciuto', () => {
    expect(recoveryGap(1440, 60)).toEqual({ state: 'not_covered', gap: 1380 });
    expect(recoveryGap(null, 60).state).toBe('unknown');
    expect(recoveryGap(0, 0).state).toBe('covered');
  });
  it('dipendenza', () => { expect(dependencyScore(0, false, true)).toBe(0); expect(dependencyScore(6, true, false)).toBe(100); expect(dependencyScore(2, true, true)).toBe(48.33); });
});

describe('rischio, EAL, ROI', () => {
  it('risk analysis invertito', () => expect(residualFromRiskAnalysis(80)).toBe(20));
  it('EAL senza frequenza', () => expect(expectedAnnualLoss(125000, null, null)).toEqual({ value: null, status: 'missing_frequency' }));
  it('EAL 125000 x 0.2', () => expect(expectedAnnualLoss(125000, 0.2, 'storico incidenti').value).toBe(25000));
  it('frequenza negativa o senza fonte', () => {
    expect(() => expectedAnnualLoss(1, -1, 'x')).toThrow(); expect(() => expectedAnnualLoss(1, 1, '')).toThrow();
  });
  it('costo zero non divide per zero', () => expect(remediationValue({ baselineEal: 1000, reductionPercent: 50, implementationCost: 0, recurringAnnualCost: 0, usefulLifeYears: 3 }).roiPercent).toBeNull());
  it('beneficio zero: payback non calcolabile', () => expect(remediationValue({ baselineEal: 1000, reductionPercent: 0, implementationCost: 100, recurringAnnualCost: 0, usefulLifeYears: 3 }).paybackMonths).toBeNull());
  it('vita utile non valida', () => expect(() => remediationValue({ baselineEal: 1, reductionPercent: 1, implementationCost: 1, recurringAnnualCost: 0, usefulLifeYears: 0 })).toThrow());
  it('ROI calcolato', () => {
    const r = remediationValue({ baselineEal: 25000, reductionPercent: 60, implementationCost: 12000, recurringAnnualCost: 1000, usefulLifeYears: 3 });
    expect(r.annualBenefit).toBe(15000); expect(r.annualizedCost).toBe(5000); expect(r.roiPercent).toBe(200); expect(r.paybackMonths).toBeCloseTo(9.6, 6);
  });
});
