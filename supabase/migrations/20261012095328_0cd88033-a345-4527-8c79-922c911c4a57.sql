CREATE TABLE public.managed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  internal_code text NOT NULL,
  asset_number text, asset_type text, model text, name text, serial_number text,
  status text DEFAULT 'New', status_cliente text, pin text, puk text,
  assignee text, date_of_assign date, purchase_type text, contract_number text,
  start_contract_date date, end_contract_date date, asset_cost numeric, asset_cost_nd boolean NOT NULL DEFAULT false,
  warranty_type text, warranty_cost numeric, warranty_start_date date, warranty_expiration date,
  ddt_number text, ddt_date date, supplier text, note text, site text,
  source text NOT NULL DEFAULT 'manual', halo_asset_id text, last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, internal_code)
);
CREATE UNIQUE INDEX managed_assets_halo_uidx ON public.managed_assets(organization_id, halo_asset_id) WHERE halo_asset_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.managed_assets TO authenticated;
GRANT ALL ON public.managed_assets TO service_role;
ALTER TABLE public.managed_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY ma_all ON public.managed_assets FOR ALL TO authenticated USING (public.doc_can_access_org(organization_id)) WITH CHECK (public.doc_can_access_org(organization_id));
CREATE TRIGGER ma_upd BEFORE UPDATE ON public.managed_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.asset_lookup_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL, kind text NOT NULL, value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, kind, value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_lookup_values TO authenticated;
GRANT ALL ON public.asset_lookup_values TO service_role;
ALTER TABLE public.asset_lookup_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY alv_all ON public.asset_lookup_values FOR ALL TO authenticated USING (public.doc_can_access_org(organization_id)) WITH CHECK (public.doc_can_access_org(organization_id));

CREATE TABLE public.asset_halo_links (
  organization_id uuid PRIMARY KEY, halo_client_id text, halo_client_name text,
  field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb, last_sync_at timestamptz, last_sync_status text, last_sync_message text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_halo_links TO authenticated;
GRANT ALL ON public.asset_halo_links TO service_role;
ALTER TABLE public.asset_halo_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY ahl_all ON public.asset_halo_links FOR ALL TO authenticated USING (public.doc_can_access_org(organization_id)) WITH CHECK (public.doc_can_access_org(organization_id));

CREATE TABLE public.asset_expiry_settings (
  organization_id uuid PRIMARY KEY, lead_days integer NOT NULL DEFAULT 180,
  recipients text[] NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT false, last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_expiry_settings TO authenticated;
GRANT ALL ON public.asset_expiry_settings TO service_role;
ALTER TABLE public.asset_expiry_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY aes_all ON public.asset_expiry_settings FOR ALL TO authenticated USING (public.doc_can_access_org(organization_id)) WITH CHECK (public.doc_can_access_org(organization_id));