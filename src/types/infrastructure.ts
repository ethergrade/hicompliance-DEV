export interface CriticalInfrastructureAsset {
  id: string;
  organization_id: string;
  asset_id: string;
  
  // Asset Critici fields
  component_name: string;
  criticality: 'H' | 'M' | 'L' | null;
  owner_team: string;
  management_type: 'internal' | 'external' | null;
  location: string;
  sensitive_data: 'S' | 'N' | 'N/A' | null;
  dependencies: string;
  main_controls: string;
  
  // Backup & Recovery fields
  has_backup: 'S' | 'N' | null;
  backup_frequency: string;
  last_test_date: string | null;
  rpo_hours: number | null;
  rto_hours: number | null;
  runbook_link: string;
  ir_notes: string;
  
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export type CriticalInfrastructureInsert = Omit<CriticalInfrastructureAsset, 'id' | 'created_at' | 'updated_at'>;

export type CriticalInfrastructureUpdate = Partial<Omit<CriticalInfrastructureAsset, 'id' | 'organization_id' | 'created_at'>>;
