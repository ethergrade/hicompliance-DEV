export type SurfaceRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ScoreBreakdown = {
  transportScore: number;
  dnsScore: number;
  httpSecurityScore: number;
  exposureScore: number;
  reputationScore: number;
  qualityScore: number;
  domainHygieneScore: number;
  overallScore: number;
  riskLevel: SurfaceRiskLevel;
};

export type ScoreInput = Omit<ScoreBreakdown, 'overallScore' | 'riskLevel'>;

const clamp = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export function calculateSurfaceScore(input: ScoreInput): ScoreBreakdown {
  const transportScore = clamp(input.transportScore);
  const dnsScore = clamp(input.dnsScore);
  const httpSecurityScore = clamp(input.httpSecurityScore);
  const exposureScore = clamp(input.exposureScore);
  const reputationScore = clamp(input.reputationScore);
  const qualityScore = clamp(input.qualityScore);
  const domainHygieneScore = clamp(input.domainHygieneScore);

  const overallScore = clamp(
    transportScore * 0.2 +
      dnsScore * 0.15 +
      httpSecurityScore * 0.2 +
      exposureScore * 0.15 +
      reputationScore * 0.15 +
      qualityScore * 0.1 +
      domainHygieneScore * 0.05,
  );

  const riskLevel: SurfaceRiskLevel =
    overallScore >= 85 ? 'low' : overallScore >= 70 ? 'medium' : overallScore >= 50 ? 'high' : 'critical';

  return {
    transportScore,
    dnsScore,
    httpSecurityScore,
    exposureScore,
    reputationScore,
    qualityScore,
    domainHygieneScore,
    overallScore,
    riskLevel,
  };
}
