-- Supplier directory for Incident Response
CREATE TABLE IF NOT EXISTS public.supplier_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  service_type text,
  contact_name text,
  email text,
  phone text,
  linked_asset_id uuid REFERENCES public.critical_infrastructure(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_directory_org
  ON public.supplier_directory(organization_id);

CREATE INDEX IF NOT EXISTS idx_supplier_directory_name
  ON public.supplier_directory(organization_id, supplier_name);

CREATE INDEX IF NOT EXISTS idx_supplier_directory_asset
  ON public.supplier_directory(linked_asset_id);

ALTER TABLE public.supplier_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org suppliers"
  ON public.supplier_directory FOR SELECT
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM public.users
      WHERE users.auth_user_id = auth.uid()
    )
    OR public.can_manage_all_organizations(auth.uid())
  );

CREATE POLICY "Users can insert org suppliers"
  ON public.supplier_directory FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM public.users
      WHERE users.auth_user_id = auth.uid()
    )
    OR public.can_manage_all_organizations(auth.uid())
  );

CREATE POLICY "Users can update org suppliers"
  ON public.supplier_directory FOR UPDATE
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM public.users
      WHERE users.auth_user_id = auth.uid()
    )
    OR public.can_manage_all_organizations(auth.uid())
  );

CREATE POLICY "Users can delete org suppliers"
  ON public.supplier_directory FOR DELETE
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM public.users
      WHERE users.auth_user_id = auth.uid()
    )
    OR public.can_manage_all_organizations(auth.uid())
  );

DROP TRIGGER IF EXISTS update_supplier_directory_updated_at ON public.supplier_directory;
CREATE TRIGGER update_supplier_directory_updated_at
  BEFORE UPDATE ON public.supplier_directory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
