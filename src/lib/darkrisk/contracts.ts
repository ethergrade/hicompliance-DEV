export type DarkRiskTier = 'standard' | 'extended';
export type DarkRiskSourceName = 'surfacescan360' | 'intelx' | 'openai';

export interface DarkRiskEntitlement {
  organizationId: string;
  tier: DarkRiskTier;
  enabled: boolean;
  scanFrequency: string;
  maxIntelxResultsPerSelector: number;
  enablePhonebook: boolean;
  enableRawEvidence: boolean;
  enableAiRecommendations: boolean;
  retentionDays: number;
}

export interface SourceAdapterContext {
  organizationId: string;
  scanRunId: string;
  tier: DarkRiskTier;
  requestedBy: string;
  entitlement: DarkRiskEntitlement;
}

export interface SourceAdapterError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SourceAdapterResult {
  source: DarkRiskSourceName;
  recordsCreated: number;
  evidenceCreated: number;
  findingsCreated: number;
  alertsCreated: number;
  warnings: string[];
  errors: SourceAdapterError[];
  creditsUsed?: number;
  startedAt: string;
  completedAt: string;
}

export interface SourceAdapter {
  name: DarkRiskSourceName;
  run(ctx: SourceAdapterContext): Promise<SourceAdapterResult>;
}
