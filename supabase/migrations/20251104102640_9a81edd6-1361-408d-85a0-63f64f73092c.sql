-- Creare tabella per alert SurfaceScan360
CREATE TABLE public.surface_scan_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  alert_email text NOT NULL,
  alert_types jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indici per performance
CREATE INDEX idx_surface_scan_alerts_user_id ON public.surface_scan_alerts(user_id);
CREATE INDEX idx_surface_scan_alerts_organization_id ON public.surface_scan_alerts(organization_id);

-- Trigger per updated_at
CREATE TRIGGER update_surface_scan_alerts_updated_at 
  BEFORE UPDATE ON public.surface_scan_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
ALTER TABLE public.surface_scan_alerts ENABLE ROW LEVEL SECURITY;

-- Gli utenti possono vedere solo i loro alert
CREATE POLICY "Users can view their own alerts"
  ON public.surface_scan_alerts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Gli utenti possono creare i loro alert
CREATE POLICY "Users can create their own alerts"
  ON public.surface_scan_alerts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Gli utenti possono aggiornare i loro alert
CREATE POLICY "Users can update their own alerts"
  ON public.surface_scan_alerts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Gli utenti possono eliminare i loro alert
CREATE POLICY "Users can delete their own alerts"
  ON public.surface_scan_alerts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Aggiungere permessi modulo per sales e admin
INSERT INTO public.role_module_permissions (role, module_path, module_name, is_enabled)
VALUES 
  ('sales', '/settings/surface-scan-alerts', 'Alert SurfaceScan', true),
  ('super_admin', '/settings/surface-scan-alerts', 'Alert SurfaceScan', true)
ON CONFLICT DO NOTHING;