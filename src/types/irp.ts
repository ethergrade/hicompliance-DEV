export interface EmergencyContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  category: string;
  escalationLevel?: number;
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

export interface IRPDocumentData {
  companyName: string;
  companyAddress: string;
  date: string;
  version: string;
  sections: {
    introduction: string;
    severity: SeverityLevel[];
    roles: RoleItem[];
    contacts: EmergencyContact[];
    communications: string;
    procedures: Procedure[];
  };
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
