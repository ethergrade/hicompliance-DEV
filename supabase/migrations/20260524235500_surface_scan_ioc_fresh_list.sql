-- SurfaceScan360 MD04: IOC fresh list with admin-configurable lease

CREATE TABLE IF NOT EXISTS public.surface_scan_ioc_fresh_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lease_minutes integer NOT NULL DEFAULT 60 CHECK (lease_minutes IN (30, 60, 120, 720, 1440)),
  is_enabled boolean NOT NULL DEFAULT true,
  last_refreshed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surface_scan_ioc_fresh_config_org_unique UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS public.surface_scan_ioc_fresh_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ioc_value text NOT NULL,
  ioc_type text NOT NULL CHECK (ioc_type IN ('domain', 'ip', 'url')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'curated_feed')),
  confidence integer NOT NULL DEFAULT 80 CHECK (confidence >= 0 AND confidence <= 100),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  synced_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_surface_scan_ioc_items_unique
  ON public.surface_scan_ioc_fresh_items(organization_id, ioc_type, source, lower(ioc_value));

CREATE INDEX IF NOT EXISTS idx_surface_scan_ioc_items_org_active
  ON public.surface_scan_ioc_fresh_items(organization_id, is_active, source, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_surface_scan_ioc_items_expiry
  ON public.surface_scan_ioc_fresh_items(expires_at);

ALTER TABLE public.surface_scan_ioc_fresh_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_scan_ioc_fresh_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Surface IOC config readable by customer scope" ON public.surface_scan_ioc_fresh_config;
CREATE POLICY "Surface IOC config readable by customer scope"
  ON public.surface_scan_ioc_fresh_config FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Surface IOC config writable by admin scope" ON public.surface_scan_ioc_fresh_config;
CREATE POLICY "Surface IOC config writable by admin scope"
  ON public.surface_scan_ioc_fresh_config FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), organization_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), organization_id)
    AND public.surface_scan_is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Surface IOC items readable by customer scope" ON public.surface_scan_ioc_fresh_items;
CREATE POLICY "Surface IOC items readable by customer scope"
  ON public.surface_scan_ioc_fresh_items FOR SELECT
  TO authenticated
  USING (public.surface_scan_can_access_customer(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Surface IOC items writable by admin scope" ON public.surface_scan_ioc_fresh_items;
CREATE POLICY "Surface IOC items writable by admin scope"
  ON public.surface_scan_ioc_fresh_items FOR ALL
  TO authenticated
  USING (
    public.surface_scan_can_access_customer(auth.uid(), organization_id)
    AND public.surface_scan_is_admin(auth.uid())
  )
  WITH CHECK (
    public.surface_scan_can_access_customer(auth.uid(), organization_id)
    AND public.surface_scan_is_admin(auth.uid())
  );

DROP TRIGGER IF EXISTS update_surface_scan_ioc_fresh_config_updated_at
  ON public.surface_scan_ioc_fresh_config;
CREATE TRIGGER update_surface_scan_ioc_fresh_config_updated_at
  BEFORE UPDATE ON public.surface_scan_ioc_fresh_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_surface_scan_ioc_fresh_items_updated_at
  ON public.surface_scan_ioc_fresh_items;
CREATE TRIGGER update_surface_scan_ioc_fresh_items_updated_at
  BEFORE UPDATE ON public.surface_scan_ioc_fresh_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
