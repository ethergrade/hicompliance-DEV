export type DarkRiskSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type DarkRiskConfidence = 'low' | 'medium' | 'high';

const severityBase: Record<DarkRiskSeverity, number> = {
  info: 5,
  low: 20,
  medium: 45,
  high: 70,
  critical: 90,
};

export interface FindingScoreInput {
  severity: DarkRiskSeverity;
  confidence: DarkRiskConfidence;
  freshnessDays: number | null;
  recurrenceCount: number;
  affectedAssetCriticality: 'low' | 'medium' | 'high';
  isDirectCompromise: boolean;
  isThirdPartyOnly: boolean;
}

export function calculateFindingRiskScore(input: FindingScoreInput): number {
  let score = severityBase[input.severity];

  if (input.confidence === 'high') score += 5;
  if (input.confidence === 'low') score -= 10;

  if (input.freshnessDays !== null) {
    if (input.freshnessDays <= 7) score += 10;
    else if (input.freshnessDays <= 30) score += 6;
    else if (input.freshnessDays <= 180) score += 2;
    else score -= 5;
  }

  if (input.recurrenceCount >= 10) score += 10;
  else if (input.recurrenceCount >= 3) score += 5;

  if (input.affectedAssetCriticality === 'high') score += 5;
  if (input.affectedAssetCriticality === 'low') score -= 5;

  if (input.isDirectCompromise) score += 10;
  if (input.isThirdPartyOnly) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function severityFromScore(score: number): DarkRiskSeverity {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'info';
}
