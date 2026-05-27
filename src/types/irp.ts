export interface EmergencyContact {
  id: string;
  name: string;
  role: string; // Legacy field - kept for backward compatibility
  job_title?: string; // Business title (e.g., "IT MANAGER", "CISO")
  irp_role?: string; // Role in IRP (e.g., "Incident Response Team")
  phone: string;
  email: string;
  category: string;
  responsibilities?: string; // Responsibilities description
  escalationLevel?: number;
  directory_contact_id?: string; // Reference to contact_directory
}

export interface DirectoryContact {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  job_title?: string;
  phone?: string;
  email?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SeverityLevel {
  level: string;
  description: string;
  responseTime: string;
}

export interface RoleItem {
  role: string;
  responsibilities: string;
  contact: string;
}

export interface Procedure {
  title: string;
  steps: string[];
  assignedTo: string;
}

export interface RiskAnalysisSummary {
  assetName: string;
  threatSource: string;
  riskScore: number;
  categoryAverages: {
    category: string;
    average: number;
  }[];
}

export interface IRPDocumentData {
  companyName: string;
  companyAddress: string;
  date: string;
  version: string;
  cisoSubstitute?: string; // Name of person covering CISO role if not present
  sections: {
    introduction: string;
    severity: SeverityLevel[];
    roles: RoleItem[];
    contacts: EmergencyContact[];
    communications: string;
    procedures: Procedure[];
  };
  riskAnalysis?: RiskAnalysisSummary[];
}

export interface IRPDocument {
  id?: string;
  organization_id: string;
  user_id: string;
  document_data: IRPDocumentData;
  version: number;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

// Predefined IRP roles
export const IRP_ROLES = [
  'Incident Response Team',
  'Steering Committee',
  'Incident Response Manager',
  'Incident Response Program Owner',
  'Communications Lead',
  'Legal Counsel',
  'Cyber Insurance',
  'Referente CSIRT',
  'Technical Support',
  'Executive Team',
] as const;

export type IRPRole = typeof IRP_ROLES[number];
