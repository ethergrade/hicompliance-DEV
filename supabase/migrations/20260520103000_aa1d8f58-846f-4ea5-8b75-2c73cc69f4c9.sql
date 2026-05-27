-- SurfaceScan360 monitored IP rules (admin-managed)
CREATE TABLE IF NOT EXISTS public.surface_scan_monitored_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  input_value text NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('single', 'range', 'cidr')),
  ip_start inet NOT NULL,
  ip_end inet NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surface_scan_monitored_ips_ip_order CHECK (ip_start <= ip_end)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_surface_scan_monitored_ips_unique_rule
  ON public.surface_scan_monitored_ips(organization_id, input_value);

CREATE INDEX IF NOT EXISTS idx_surface_scan_monitored_ips_org
  ON public.surface_scan_monitored_ips(organization_id);

CREATE INDEX IF NOT EXISTS idx_surface_scan_monitored_ips_start_end
  ON public.surface_scan_monitored_ips(ip_start, ip_end);

ALTER TABLE public.surface_scan_monitored_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view monitored IP rules in their organization"
  ON public.surface_scan_monitored_ips
  FOR SELECT
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM public.users
      WHERE users.auth_user_id = auth.uid()
    )
    OR public.can_manage_all_organizations(auth.uid())
  );

CREATE POLICY "Admins can insert monitored IP rules"
  ON public.surface_scan_monitored_ips
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM public.users
      WHERE users.auth_user_id = auth.uid()
      AND users.user_type = 'admin'::user_type
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Admins can update monitored IP rules"
  ON public.surface_scan_monitored_ips
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM public.users
      WHERE users.auth_user_id = auth.uid()
      AND users.user_type = 'admin'::user_type
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Admins can delete monitored IP rules"
  ON public.surface_scan_monitored_ips
  FOR DELETE
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM public.users
      WHERE users.auth_user_id = auth.uid()
      AND users.user_type = 'admin'::user_type
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP TRIGGER IF EXISTS update_surface_scan_monitored_ips_updated_at ON public.surface_scan_monitored_ips;
CREATE TRIGGER update_surface_scan_monitored_ips_updated_at
  BEFORE UPDATE ON public.surface_scan_monitored_ips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
