-- Create surface_scan_monitored_ips table with support for both IPs and domains
CREATE TABLE IF NOT EXISTS public.surface_scan_monitored_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  input_value text NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('single', 'range', 'cidr', 'domain')),
  ip_start text NOT NULL DEFAULT '',
  ip_end text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, input_value)
);

-- If table already existed without 'domain', extend the check constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.surface_scan_monitored_ips'::regclass
      AND conname LIKE '%entry_type%'
  ) THEN
    ALTER TABLE public.surface_scan_monitored_ips
      DROP CONSTRAINT IF EXISTS surface_scan_monitored_ips_entry_type_check;
  END IF;
  ALTER TABLE public.surface_scan_monitored_ips
    ADD CONSTRAINT surface_scan_monitored_ips_entry_type_check
    CHECK (entry_type IN ('single', 'range', 'cidr', 'domain'));
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

ALTER TABLE public.surface_scan_monitored_ips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view monitored ips" ON public.surface_scan_monitored_ips;
CREATE POLICY "Org members view monitored ips"
  ON public.surface_scan_monitored_ips FOR SELECT
  USING (
    public.can_manage_all_organizations(auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = surface_scan_monitored_ips.organization_id)
  );

DROP POLICY IF EXISTS "Admins manage monitored ips" ON public.surface_scan_monitored_ips;
CREATE POLICY "Admins manage monitored ips"
  ON public.surface_scan_monitored_ips FOR ALL
  USING (
    public.can_manage_all_organizations(auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = surface_scan_monitored_ips.organization_id AND u.user_type = 'admin')
  )
  WITH CHECK (
    public.can_manage_all_organizations(auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = surface_scan_monitored_ips.organization_id AND u.user_type = 'admin')
  );

DROP TRIGGER IF EXISTS trg_surface_scan_monitored_ips_updated_at ON public.surface_scan_monitored_ips;
CREATE TRIGGER trg_surface_scan_monitored_ips_updated_at
  BEFORE UPDATE ON public.surface_scan_monitored_ips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();