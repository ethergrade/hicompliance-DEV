-- Create critical_infrastructure table for IRP Extended wizard
CREATE TABLE public.critical_infrastructure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  
  -- Asset Critici fields
  component_name TEXT NOT NULL DEFAULT '',
  criticality TEXT CHECK (criticality IN ('H', 'M', 'L')),
  owner_team TEXT DEFAULT '',
  management_type TEXT CHECK (management_type IN ('internal', 'external')),
  location TEXT DEFAULT '',
  sensitive_data TEXT CHECK (sensitive_data IN ('S', 'N', 'N/A')),
  dependencies TEXT DEFAULT '',
  main_controls TEXT DEFAULT '',
  
  -- Backup & Recovery fields  
  has_backup TEXT CHECK (has_backup IN ('S', 'N')),
  backup_frequency TEXT DEFAULT '',
  last_test_date DATE,
  rpo_hours INTEGER,
  rto_hours INTEGER,
  runbook_link TEXT DEFAULT '',
  ir_notes TEXT DEFAULT '',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  
  UNIQUE(organization_id, asset_id)
);

-- Enable RLS
ALTER TABLE public.critical_infrastructure ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own org infrastructure"
  ON public.critical_infrastructure FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.users 
    WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own org infrastructure"
  ON public.critical_infrastructure FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.users 
    WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can update own org infrastructure"
  ON public.critical_infrastructure FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM public.users 
    WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own org infrastructure"
  ON public.critical_infrastructure FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM public.users 
    WHERE auth_user_id = auth.uid()
  ));

-- Trigger for updated_at
CREATE TRIGGER update_critical_infrastructure_updated_at
  BEFORE UPDATE ON public.critical_infrastructure
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();