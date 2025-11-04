-- Create dark_risk_alerts table
CREATE TABLE public.dark_risk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  alert_email text NOT NULL,
  alert_types jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_dark_risk_alerts_user_id ON public.dark_risk_alerts(user_id);
CREATE INDEX idx_dark_risk_alerts_organization_id ON public.dark_risk_alerts(organization_id);

-- Add trigger for updated_at
CREATE TRIGGER update_dark_risk_alerts_updated_at 
  BEFORE UPDATE ON public.dark_risk_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.dark_risk_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can view their own alerts
CREATE POLICY "Users can view their own alerts"
  ON public.dark_risk_alerts FOR SELECT
  USING (user_id = auth.uid());

-- Users can create their own alerts
CREATE POLICY "Users can create their own alerts"
  ON public.dark_risk_alerts FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own alerts
CREATE POLICY "Users can update their own alerts"
  ON public.dark_risk_alerts FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own alerts
CREATE POLICY "Users can delete their own alerts"
  ON public.dark_risk_alerts FOR DELETE
  USING (user_id = auth.uid());

-- Add module permissions for alert settings
INSERT INTO public.role_module_permissions (role, module_path, module_name, is_enabled)
VALUES 
  ('sales', '/settings/alerts', 'Alert DarkRisk', true),
  ('super_admin', '/settings/alerts', 'Alert DarkRisk', true);