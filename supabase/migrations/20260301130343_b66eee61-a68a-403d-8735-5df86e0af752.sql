
-- ============================================
-- CONSISTENZE CORE TABLES
-- ============================================

-- Table: consistenze_clienti (1 record per organization)
CREATE TABLE public.consistenze_clienti (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  nr_sedi integer NOT NULL DEFAULT 0,
  nr_interni_telefonici integer NOT NULL DEFAULT 0,
  descrizione_telefoni text DEFAULT '',
  nr_canali_fonia integer NOT NULL DEFAULT 0,
  note_generali text DEFAULT '',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Table: consistenze_items (N records per organization, one per asset row)
CREATE TABLE public.consistenze_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  area text NOT NULL CHECK (area IN ('UCC', 'SECURITY', 'CONN_FONIA', 'NETWORKING', 'IT')),
  categoria text NOT NULL DEFAULT '',
  tecnologia text NOT NULL DEFAULT '',
  fornitore text NOT NULL DEFAULT '',
  quantita integer NOT NULL DEFAULT 0,
  scadenza date,
  metriche_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table: asset_irp (risk scoring per item)
CREATE TABLE public.asset_irp (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  consistenza_item_id uuid REFERENCES public.consistenze_items(id) ON DELETE SET NULL,
  area text NOT NULL,
  categoria text NOT NULL DEFAULT '',
  tecnologia text NOT NULL DEFAULT '',
  fornitore text NOT NULL DEFAULT '',
  quantita integer NOT NULL DEFAULT 0,
  esposizione_score numeric NOT NULL DEFAULT 0,
  criticita_score numeric NOT NULL DEFAULT 0,
  superficie_score numeric NOT NULL DEFAULT 1,
  rischio_intrinseco numeric NOT NULL DEFAULT 0,
  rischio_residuo numeric NOT NULL DEFAULT 0,
  last_sync_from_consistenze timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table: irp_history (snapshots)
CREATE TABLE public.irp_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  irp_score numeric NOT NULL DEFAULT 0,
  area_scores_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_date timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- TRIGGERS for updated_at
-- ============================================
CREATE TRIGGER update_consistenze_clienti_updated_at
  BEFORE UPDATE ON public.consistenze_clienti
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_consistenze_items_updated_at
  BEFORE UPDATE ON public.consistenze_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_asset_irp_updated_at
  BEFORE UPDATE ON public.asset_irp
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.consistenze_clienti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consistenze_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_irp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irp_history ENABLE ROW LEVEL SECURITY;

-- consistenze_clienti
CREATE POLICY "Users can view their org consistenze_clienti" ON public.consistenze_clienti
  FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert their org consistenze_clienti" ON public.consistenze_clienti
  FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update their org consistenze_clienti" ON public.consistenze_clienti
  FOR UPDATE USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Sales can manage all consistenze_clienti" ON public.consistenze_clienti
  FOR ALL USING (can_manage_all_organizations(auth.uid()));
CREATE POLICY "Sales can view all consistenze_clienti" ON public.consistenze_clienti
  FOR SELECT USING (can_manage_all_organizations(auth.uid()));

-- consistenze_items
CREATE POLICY "Users can view their org consistenze_items" ON public.consistenze_items
  FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert their org consistenze_items" ON public.consistenze_items
  FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update their org consistenze_items" ON public.consistenze_items
  FOR UPDATE USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can delete their org consistenze_items" ON public.consistenze_items
  FOR DELETE USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Sales can manage all consistenze_items" ON public.consistenze_items
  FOR ALL USING (can_manage_all_organizations(auth.uid()));
CREATE POLICY "Sales can view all consistenze_items" ON public.consistenze_items
  FOR SELECT USING (can_manage_all_organizations(auth.uid()));

-- asset_irp
CREATE POLICY "Users can view their org asset_irp" ON public.asset_irp
  FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert their org asset_irp" ON public.asset_irp
  FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can update their org asset_irp" ON public.asset_irp
  FOR UPDATE USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can delete their org asset_irp" ON public.asset_irp
  FOR DELETE USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Sales can manage all asset_irp" ON public.asset_irp
  FOR ALL USING (can_manage_all_organizations(auth.uid()));
CREATE POLICY "Sales can view all asset_irp" ON public.asset_irp
  FOR SELECT USING (can_manage_all_organizations(auth.uid()));

-- irp_history
CREATE POLICY "Users can view their org irp_history" ON public.irp_history
  FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Users can insert their org irp_history" ON public.irp_history
  FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "Sales can manage all irp_history" ON public.irp_history
  FOR ALL USING (can_manage_all_organizations(auth.uid()));
CREATE POLICY "Sales can view all irp_history" ON public.irp_history
  FOR SELECT USING (can_manage_all_organizations(auth.uid()));

-- ============================================
-- RISK CALCULATION FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.calc_risk_intrinseco(esposizione numeric, criticita numeric, superficie numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST((esposizione * criticita * superficie) * 4, 100);
$$;
