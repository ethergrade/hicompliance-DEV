CREATE TABLE public.tenant_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_id uuid,
  service_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  settings jsonb,
  api_methods jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tenant_services_tenant_idx ON public.tenant_services(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_services TO authenticated;
GRANT ALL ON public.tenant_services TO service_role;
ALTER TABLE public.tenant_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_services read" ON public.tenant_services FOR SELECT TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), tenant_id));
CREATE POLICY "tenant_services manage" ON public.tenant_services FOR ALL TO authenticated
  USING (public.can_manage_all_organizations(auth.uid()))
  WITH CHECK (public.can_manage_all_organizations(auth.uid()));
CREATE TRIGGER update_tenant_services_updated_at BEFORE UPDATE ON public.tenant_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();