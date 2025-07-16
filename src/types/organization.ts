export interface OrganizationLocation {
  id: string;
  organization_id: string;
  name: string;
  address: string;
  city: string;
  postal_code?: string;
  country: string;
  tags?: string[];
  is_main_location: boolean;
  phone?: string;
  email?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  code: string;
  created_at: string;
  updated_at: string;
}