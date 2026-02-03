export interface SecurityControl {
  id: string;
  name: string;
  category: SecurityControlCategory;
  order: number;
}

export type SecurityControlCategory = 
  | 'sicurezza_fisica'
  | 'controllo_accessi'
  | 'gestione_documenti'
  | 'sicurezza_it'
  | 'continuita_operativa'
  | 'organizzativo'
  | 'compliance';

export type ThreatSource = 'non_umana' | 'umana_esterna' | 'umana_interna';

export type ControlScore = 0 | 1 | 2 | 3 | null;

export interface ControlScores {
  [controlId: string]: number | null;
}

export interface RiskAnalysisAsset {
  id: string;
  organization_id: string | null;
  asset_name: string;
  threat_source: ThreatSource;
  control_scores: ControlScores;
  risk_score: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface RiskAnalysisInsert {
  organization_id: string;
  asset_name: string;
  threat_source: ThreatSource;
  control_scores?: ControlScores;
  risk_score?: number;
  notes?: string | null;
  created_by?: string | null;
}

export interface RiskAnalysisUpdate {
  asset_name?: string;
  threat_source?: ThreatSource;
  control_scores?: ControlScores;
  risk_score?: number;
  notes?: string | null;
}

export interface AssetSummary {
  assetName: string;
  sources: ThreatSource[];
  completeness: number;
  riskLevel: 'low' | 'medium' | 'high';
  avgScore: number;
}

export const THREAT_SOURCE_LABELS: Record<ThreatSource, string> = {
  non_umana: 'Fonti Non Umane',
  umana_esterna: 'Fonti Umane Esterne',
  umana_interna: 'Fonti Umane Interne',
};

export const SCORE_LABELS: Record<number, string> = {
  0: 'Non presente / Non applicabile',
  1: 'Presente ma non incide sulla mitigazione',
  2: 'Presente e parzialmente implementata',
  3: 'Presente e totalmente implementata',
};

export const CATEGORY_LABELS: Record<SecurityControlCategory, string> = {
  sicurezza_fisica: 'Sicurezza Fisica',
  controllo_accessi: 'Controllo Accessi',
  gestione_documenti: 'Gestione Documenti',
  sicurezza_it: 'Sicurezza IT',
  continuita_operativa: 'Continuità Operativa',
  organizzativo: 'Organizzativo',
  compliance: 'Compliance',
};
