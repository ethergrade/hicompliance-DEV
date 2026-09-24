export type BiaStatus = 'draft' | 'in_review' | 'approved' | 'superseded';
export type BiaCriticality = 'low' | 'medium' | 'high' | 'critical';
export type BiaConfidence = 'low' | 'medium' | 'high';
export type CoverageState = 'covered' | 'not_covered' | 'unknown';

export interface BusinessService {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string | null;
  service_type: 'business' | 'internal_support';
  business_owner_contact_id: string | null;
  it_owner_contact_id: string | null;
  business_unit: string | null;
  operating_schedule: { hours?: string; timezone?: string };
  peak_periods: string[] | { note?: string };
  served_population: { employees?: number; customers?: number; transactions?: number };
  source: 'manual' | 'suggested' | 'imported';
  source_ref: string | null;
  status: 'active' | 'archived';
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BiaImpactValue {
  id?: string;
  bia_assessment_id?: string;
  horizon_minutes: number;
  lost_contribution_margin: string;
  idle_labor_cost: string;
  extra_operating_cost: string;
  recovery_response_cost: string;
  contractual_penalties: string;
  regulatory_legal_cost: string;
  customer_reputation_cost: string;
  other_cost: string;
  calculated_total?: string;
  manual_total?: string | null;
  effective_total?: string;
  source_notes: string;
  confidence: BiaConfidence;
  override_reason?: string | null;
}

export interface BiaRecoveryResult {
  current_recovery_minutes: number | null;
  current_backup_interval_minutes: number | null;
  last_test_date: string | null;
  rto_gap_minutes: number | null;
  rpo_gap_minutes: number | null;
  rto: CoverageState;
  rpo: CoverageState;
  backup_test: CoverageState;
  runbook: CoverageState;
  owner: CoverageState;
  suggested_rto_upper_bound_minutes: number | null;
  suggestion_rule: string;
}

export interface BiaResult {
  model_version: string;
  weights: Record<string, number>;
  normalized: { economic: number | null; operational: number | null; regulatory: number | null; reputational: number | null; dependency: number; dependents: number };
  business_impact_score: number | null;
  criticality_class: BiaCriticality | null;
  potential_downtime_cost_24h: string | null;
  curve: { horizon_minutes: number; total: string; confidence: BiaConfidence; manual_override: boolean }[];
  technical_residual_risk: number | null;
  residual_risk_method: string;
  business_priority_index: number | null;
  expected_annual_loss: string | null;
  expected_annual_loss_status: 'calculated' | 'missing_frequency' | 'missing_cost';
  recovery: BiaRecoveryResult;
  resilience_score: number | null;
  data_coverage_percent: number;
  confidence: BiaConfidence;
  warnings: string[];
  calculated_at: string;
}

export interface BiaAssessment {
  id: string;
  organization_id: string;
  business_service_id: string;
  version: number;
  status: BiaStatus;
  model_version: string;
  currency: string;
  economic_level: number | null;
  operational_score: number | null;
  regulatory_score: number | null;
  regulatory_source: string | null;
  reputational_score: number | null;
  dependency_spof: boolean;
  dependency_workaround: boolean;
  no_dependency_reason: string | null;
  business_impact_score: number | null;
  criticality_class: BiaCriticality | null;
  mtpd_minutes: number | null;
  rto_target_minutes: number | null;
  rpo_target_minutes: number | null;
  degraded_mode: string | null;
  minimum_capacity_percent: number | null;
  recovery_rank: number | null;
  annual_frequency: number | null;
  annual_frequency_source: string | null;
  assumptions: string | null;
  data_coverage_percent: number | null;
  confidence: BiaConfidence | null;
  result: Partial<BiaResult>;
  calculated_at: string | null;
  review_comment: string | null;
  review_due_at: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BiaDependency {
  id: string;
  organization_id: string;
  service_id: string;
  depends_on_service_id: string;
  dependency_strength: BiaCriticality;
  single_point_of_failure: boolean;
  workaround_available: boolean;
  notes: string | null;
}

export interface BiaAssetLink {
  id: string;
  business_service_id: string;
  source_type: 'critical_infrastructure' | 'risk_analysis' | 'asset_irp' | 'asset_inventory' | 'consistenza';
  source_id: string;
  source_label: string | null;
  role: 'primary' | 'supporting' | 'recovery' | 'data';
  is_confirmed: boolean;
}

export interface BiaRiskLink {
  id: string;
  business_service_id: string;
  source_type: 'risk_analysis' | 'asset_irp' | 'assessment_gap' | 'surface_finding' | 'darkrisk_finding';
  source_id: string;
  source_label: string | null;
  normalized_residual_risk: number | null;
  normalization_method: string | null;
  is_confirmed: boolean;
  source_updated_at: string | null;
}

export interface BiaRemediationLink {
  id: string;
  business_service_id: string;
  bia_assessment_id: string | null;
  remediation_task_id: string;
  risk_link_id: string | null;
  impact_horizon_minutes: number | null;
  estimated_risk_reduction_percent: number | null;
  reduction_source: string | null;
  useful_life_years: number | null;
  recurring_annual_cost: number | null;
}

export interface BiaAuditEvent {
  id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface BiaDashboard {
  services_total: number;
  approved: number;
  drafts: number;
  in_review: number;
  stale: number;
  review_due_30d: number;
  critical: number;
  high: number;
  cost_24h_total: string;
  cost_24h_coverage: number;
  rto_not_covered: number;
  rpo_not_covered: number;
  recovery_unknown: number;
  no_owner: number;
  low_confidence: number;
  critical_protected: number;
  critical_total: number;
  resilience_avg: number | null;
  residual_risk_max: number | null;
  remediation_linked: number;
  remediation_budget: string;
  curve: { horizon_minutes: number; total: string; services: number }[];
  recovery_order: { service_id: string; name: string; rank: number | null; rto: number | null; rpo: number | null; mtpd: number | null; class: BiaCriticality | null; version: number }[];
  generated_at: string;
}
