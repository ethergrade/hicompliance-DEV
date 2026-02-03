-- Create risk_analysis table for storing asset risk assessments
CREATE TABLE public.risk_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  asset_name TEXT NOT NULL,
  threat_source TEXT NOT NULL CHECK (threat_source IN ('non_umana', 'umana_esterna', 'umana_interna')),
  control_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_score INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- Create index for faster lookups
CREATE INDEX idx_risk_analysis_org ON public.risk_analysis(organization_id);
CREATE INDEX idx_risk_analysis_asset ON public.risk_analysis(asset_name, organization_id);

-- Enable RLS
ALTER TABLE public.risk_analysis ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own org risk analysis"
  ON public.risk_analysis FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.users 
    WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own org risk analysis"
  ON public.risk_analysis FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.users 
    WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can update own org risk analysis"
  ON public.risk_analysis FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM public.users 
    WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own org risk analysis"
  ON public.risk_analysis FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM public.users 
    WHERE auth_user_id = auth.uid()
  ));

-- Trigger for updated_at
CREATE TRIGGER update_risk_analysis_updated_at
  BEFORE UPDATE ON public.risk_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();