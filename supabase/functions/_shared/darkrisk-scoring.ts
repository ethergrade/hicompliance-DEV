export type DarkRiskSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type DarkRiskConfidence = 'low' | 'medium' | 'high';
export type DarkRiskCompromiseType = 'direct' | 'indirect' | 'potential' | 'misconfiguration' | 'unknown';

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

export function inferCompromiseType(input: {
  findingType: string;
  title: string;
  module: string;
}): DarkRiskCompromiseType {
  const text = `${input.findingType} ${input.title} ${input.module}`.toLowerCase();

  if (/credential_leak_confirmed|password leak|stolen credential/.test(text)) return 'direct';
  if (/cve|candidate|possible|signal/.test(text)) return 'potential';
  if (/third[_ -]?party|partner|shared[_ -]?hosting/.test(text)) return 'indirect';
  if (/missing|misconfig|exposed|dns|tls|hsts|spf|dmarc|dkim|open_port|port/.test(text)) return 'misconfiguration';

  return 'unknown';
}

export function inferRiskDimensions(input: {
  findingType: string;
  title: string;
  module: string;
  confidence: DarkRiskConfidence;
  freshnessDays: number | null;
}): {
  surface_posture: number;
  identity_exposure: number;
  email_trust: number;
  evidence_confidence: number;
  freshness_trend: number;
} {
  const text = `${input.findingType} ${input.title} ${input.module}`.toLowerCase();

  const surfacePosture = /port|tls|ssl|dns|http|hsts|cve|server|service/.test(text) ? 75 : 20;
  const identityExposure = /credential|email|identity|stealer|password/.test(text) ? 80 : 10;
  const emailTrust = /spf|dmarc|dkim|mail|mx|smtp/.test(text) ? 70 : 15;

  const evidenceConfidence =
    input.confidence === 'high' ? 85 : input.confidence === 'medium' ? 60 : 35;

  let freshnessTrend = 40;
  if (input.freshnessDays !== null) {
    if (input.freshnessDays <= 7) freshnessTrend = 90;
    else if (input.freshnessDays <= 30) freshnessTrend = 75;
    else if (input.freshnessDays <= 180) freshnessTrend = 55;
    else freshnessTrend = 25;
  }

  return {
    surface_posture: surfacePosture,
    identity_exposure: identityExposure,
    email_trust: emailTrust,
    evidence_confidence: evidenceConfidence,
    freshness_trend: freshnessTrend,
  };
}
