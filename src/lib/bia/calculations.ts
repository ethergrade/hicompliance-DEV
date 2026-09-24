/**
 * Anteprima frontend del modello BIA_SCORE_V1.
 * Il database (funzione bia_compute) è la fonte autoritativa: queste funzioni
 * servono solo a mostrare il ricalcolo durante la compilazione e sono coperte
 * da test che replicano gli esempi della specifica.
 * Nessun arrotondamento nei passaggi intermedi.
 */
import type { BiaCriticality } from '@/types/bia';

export const MODEL_VERSION = 'BIA_SCORE_V1';

export const BIA_WEIGHTS_V1 = {
  economic: 0.4,
  operational: 0.25,
  regulatory: 0.15,
  reputational: 0.1,
  dependency: 0.1,
} as const;

export const CLASS_THRESHOLDS_V1 = { medium: 31, high: 61, critical: 81 };

export const ECONOMIC_BUCKETS_V1 = [
  { min: 10000, score: 50 },
  { min: 50000, score: 75 },
  { min: 100000, score: 100 },
];

export const DEFAULT_HORIZONS = [240, 480, 1440, 4320];

export interface Dimensions {
  economic: number | null;
  operational: number | null;
  regulatory: number | null;
  reputational: number | null;
  dependency: number;
}

/** Scala ordinale: level 0 = nessun impatto, 1..max = livelli. */
export function normalizeOrdinal(level: number | null, maxLevel: number): number | null {
  if (level === null || level === undefined) return null;
  if (!Number.isInteger(maxLevel) || maxLevel < 1) throw new Error('invalid_max_level');
  if (!Number.isInteger(level) || level < 0 || level > maxLevel) throw new Error('level_out_of_range');
  if (level === 0) return 0;
  return Math.round((level / maxLevel) * 100 * 100) / 100;
}

export function economicScoreFrom24h(cost: number | null): number | null {
  if (cost === null || cost === undefined || Number.isNaN(cost)) return null;
  if (cost < 0) throw new Error('negative_amount');
  if (cost === 0) return 0;
  let score = 25;
  for (const b of ECONOMIC_BUCKETS_V1) if (cost >= b.min) score = b.score;
  return score;
}

export function dependencyScore(dependents: number, spof: boolean, workaround: boolean): number {
  const base = dependents <= 0 ? 0 : dependents <= 2 ? 33.33 : dependents <= 5 ? 66.67 : 100;
  return Math.min(100, base + (spof ? 15 : 0) + (workaround ? 0 : 10));
}

export function businessImpactScore(d: Dimensions, model = MODEL_VERSION): number | null {
  if (model !== MODEL_VERSION) throw new Error(`unknown_model_version: ${model}`);
  if (d.economic === null || d.operational === null || d.regulatory === null || d.reputational === null) return null;
  for (const v of [d.economic, d.operational, d.regulatory, d.reputational, d.dependency]) {
    if (v < 0 || v > 100) throw new Error('dimension_out_of_range');
  }
  const w = BIA_WEIGHTS_V1;
  const raw = d.economic * w.economic + d.operational * w.operational + d.regulatory * w.regulatory
    + d.reputational * w.reputational + d.dependency * w.dependency;
  return Math.round((raw + 1e-9) * 100) / 100; // compensa errori binari; il DB usa numeric esatto
}

export function criticalityClass(score: number | null): BiaCriticality | null {
  if (score === null) return null;
  // Fasce 0-30, 31-60, 61-80, 81-100 su valori continui: 80.42 è oltre 80, quindi Critica (esempio della specifica)
  if (score > CLASS_THRESHOLDS_V1.critical - 1) return 'critical';
  if (score > CLASS_THRESHOLDS_V1.high - 1) return 'high';
  if (score > CLASS_THRESHOLDS_V1.medium - 1) return 'medium';
  return 'low';
}

export function businessPriorityIndex(bis: number | null, residualRisk: number | null): number | null {
  if (bis === null || residualRisk === null) return null;
  return Math.round(((bis * residualRisk) / 100) * 100) / 100;
}

/** Converte score "più alto = meglio" in rischio residuo 0-100. */
export function residualFromRiskAnalysis(riskScore: number): number {
  if (riskScore < 0 || riskScore > 100) throw new Error('out_of_range');
  return 100 - riskScore;
}

export function expectedAnnualLoss(cost: number | null, frequency: number | null, source: string | null) {
  if (frequency !== null && frequency < 0) throw new Error('negative_frequency');
  if (frequency !== null && !source?.trim()) throw new Error('frequency_source_required');
  if (cost === null) return { value: null, status: 'missing_cost' as const };
  if (frequency === null) return { value: null, status: 'missing_frequency' as const };
  return { value: cost * frequency, status: 'calculated' as const };
}

export interface ImpactComponents {
  lost_contribution_margin: number; idle_labor_cost: number; extra_operating_cost: number;
  recovery_response_cost: number; contractual_penalties: number; regulatory_legal_cost: number;
  customer_reputation_cost: number; other_cost: number;
}

export function impactTotals(c: ImpactComponents, manual: number | null, overrideReason?: string | null) {
  const values = Object.values(c);
  if (values.some((v) => v < 0) || (manual !== null && manual < 0)) throw new Error('negative_amount');
  if (manual !== null && !overrideReason?.trim()) throw new Error('override_reason_required');
  const calculated = values.reduce((a, b) => a + b, 0);
  return { calculated, effective: manual ?? calculated };
}

export function isMonotonic(curve: { horizon_minutes: number; total: number }[]): boolean {
  const sorted = [...curve].sort((a, b) => a.horizon_minutes - b.horizon_minutes);
  return sorted.every((p, i) => i === 0 || p.total >= sorted[i - 1].total);
}

export function recoveryGap(current: number | null, target: number | null): { state: 'covered' | 'not_covered' | 'unknown'; gap: number | null } {
  if (current === null || target === null) return { state: 'unknown', gap: null };
  const gap = Math.max(0, current - target);
  return { state: gap === 0 ? 'covered' : 'not_covered', gap };
}

export function rtoValid(rto: number | null, mtpd: number | null): boolean {
  return rto !== null && mtpd !== null && rto < mtpd;
}

export interface RoiInput {
  baselineEal: number | null;
  reductionPercent: number | null;
  implementationCost: number | null;
  recurringAnnualCost: number | null;
  usefulLifeYears: number | null;
}

/** ROI e payback: null = "non calcolabile", mai 0. */
export function remediationValue(i: RoiInput) {
  if (i.usefulLifeYears !== null && i.usefulLifeYears <= 0) throw new Error('invalid_useful_life');
  if (i.baselineEal === null || i.reductionPercent === null) return { annualBenefit: null, roiPercent: null, paybackMonths: null, annualizedCost: null };
  const annualBenefit = i.baselineEal - i.baselineEal * (1 - i.reductionPercent / 100);
  const impl = i.implementationCost ?? 0;
  const annualizedCost = (i.recurringAnnualCost ?? 0) + (i.usefulLifeYears ? impl / i.usefulLifeYears : impl);
  const roiPercent = annualizedCost > 0 ? ((annualBenefit - annualizedCost) / annualizedCost) * 100 : null;
  const paybackMonths = annualBenefit > 0 && impl > 0 ? (impl / annualBenefit) * 12 : null;
  return { annualBenefit, roiPercent, paybackMonths, annualizedCost };
}
