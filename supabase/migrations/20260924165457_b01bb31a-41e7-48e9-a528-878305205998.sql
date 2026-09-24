
-- ============ BIA: Business Impact Analysis ============
CREATE OR REPLACE FUNCTION public.bia_can_edit(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'super_admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = _org)
$$;
CREATE OR REPLACE FUNCTION public.bia_can_approve(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'super_admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = _org AND u.user_type = 'admin')
$$;
-- sales vede solo dati approvati
CREATE OR REPLACE FUNCTION public.bia_sales_only(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.bia_can_edit(_org) AND public.can_manage_all_organizations(auth.uid())
$$;

CREATE TABLE public.bia_model_configurations (
  model_version text PRIMARY KEY,
  weights jsonb NOT NULL,
  class_thresholds jsonb NOT NULL,
  economic_buckets jsonb NOT NULL,
  default_horizons integer[] NOT NULL,
  resilience_weights jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bia_model_configurations TO authenticated;
GRANT ALL ON public.bia_model_configurations TO service_role;
ALTER TABLE public.bia_model_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bia config readable" ON public.bia_model_configurations FOR SELECT TO authenticated USING (true);
INSERT INTO public.bia_model_configurations VALUES (
  'BIA_SCORE_V1',
  '{"economic":0.40,"operational":0.25,"regulatory":0.15,"reputational":0.10,"dependency":0.10}',
  '{"medium":31,"high":61,"critical":81}',
  '[{"min":0,"score":0},{"min":0.01,"score":25},{"min":10000,"score":50},{"min":50000,"score":75},{"min":100000,"score":100}]',
  ARRAY[240,480,1440,4320],
  '{"rto_covered":30,"rpo_covered":25,"backup_test_recent":15,"runbook_present":15,"owner_present":15}',
  now());

CREATE TABLE public.business_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  description text,
  service_type text NOT NULL DEFAULT 'business' CHECK (service_type IN ('business','internal_support')),
  business_owner_contact_id uuid REFERENCES public.contact_directory(id) ON DELETE SET NULL,
  it_owner_contact_id uuid REFERENCES public.contact_directory(id) ON DELETE SET NULL,
  business_unit text,
  operating_schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  peak_periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  served_population jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','suggested','imported')),
  source_ref text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  last_reviewed_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);
CREATE INDEX ON public.business_services (organization_id, status);

CREATE TABLE public.bia_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_service_id uuid NOT NULL REFERENCES public.business_services(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','superseded')),
  model_version text NOT NULL DEFAULT 'BIA_SCORE_V1' REFERENCES public.bia_model_configurations(model_version),
  currency char(3) NOT NULL DEFAULT 'EUR',
  economic_level smallint CHECK (economic_level BETWEEN 0 AND 4),
  operational_score numeric CHECK (operational_score BETWEEN 0 AND 100),
  regulatory_score numeric CHECK (regulatory_score BETWEEN 0 AND 100),
  regulatory_source text,
  reputational_score numeric CHECK (reputational_score BETWEEN 0 AND 100),
  dependency_spof boolean NOT NULL DEFAULT false,
  dependency_workaround boolean NOT NULL DEFAULT true,
  no_dependency_reason text,
  dependency_score numeric,
  economic_score numeric,
  business_impact_score numeric,
  criticality_class text CHECK (criticality_class IN ('low','medium','high','critical')),
  mtpd_minutes integer CHECK (mtpd_minutes > 0),
  rto_target_minutes integer CHECK (rto_target_minutes > 0),
  rpo_target_minutes integer CHECK (rpo_target_minutes >= 0),
  degraded_mode text,
  minimum_capacity_percent numeric CHECK (minimum_capacity_percent BETWEEN 0 AND 100),
  recovery_rank integer CHECK (recovery_rank > 0),
  annual_frequency numeric CHECK (annual_frequency >= 0),
  annual_frequency_source text,
  assumptions text,
  data_coverage_percent numeric,
  confidence text CHECK (confidence IN ('low','medium','high')),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz,
  review_comment text,
  review_due_at date,
  approved_snapshot jsonb,
  submitted_by uuid, submitted_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_service_id, version)
);
CREATE UNIQUE INDEX bia_one_open_version ON public.bia_assessments (business_service_id) WHERE status IN ('draft','in_review');
CREATE INDEX ON public.bia_assessments (organization_id, status);

CREATE TABLE public.bia_impact_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bia_assessment_id uuid NOT NULL REFERENCES public.bia_assessments(id) ON DELETE CASCADE,
  horizon_minutes integer NOT NULL CHECK (horizon_minutes > 0),
  lost_contribution_margin numeric NOT NULL DEFAULT 0 CHECK (lost_contribution_margin >= 0),
  idle_labor_cost numeric NOT NULL DEFAULT 0 CHECK (idle_labor_cost >= 0),
  extra_operating_cost numeric NOT NULL DEFAULT 0 CHECK (extra_operating_cost >= 0),
  recovery_response_cost numeric NOT NULL DEFAULT 0 CHECK (recovery_response_cost >= 0),
  contractual_penalties numeric NOT NULL DEFAULT 0 CHECK (contractual_penalties >= 0),
  regulatory_legal_cost numeric NOT NULL DEFAULT 0 CHECK (regulatory_legal_cost >= 0),
  customer_reputation_cost numeric NOT NULL DEFAULT 0 CHECK (customer_reputation_cost >= 0),
  other_cost numeric NOT NULL DEFAULT 0 CHECK (other_cost >= 0),
  calculated_total numeric NOT NULL DEFAULT 0,
  manual_total numeric CHECK (manual_total >= 0),
  effective_total numeric NOT NULL DEFAULT 0,
  source_notes text NOT NULL DEFAULT '',
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  override_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bia_assessment_id, horizon_minutes),
  CHECK (manual_total IS NULL OR length(trim(coalesce(override_reason,''))) > 0)
);

CREATE TABLE public.bia_service_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.business_services(id) ON DELETE CASCADE,
  depends_on_service_id uuid NOT NULL REFERENCES public.business_services(id) ON DELETE CASCADE,
  dependency_strength text NOT NULL DEFAULT 'medium' CHECK (dependency_strength IN ('low','medium','high','critical')),
  single_point_of_failure boolean NOT NULL DEFAULT false,
  workaround_available boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, depends_on_service_id),
  CHECK (service_id <> depends_on_service_id)
);

CREATE TABLE public.bia_technical_asset_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_service_id uuid NOT NULL REFERENCES public.business_services(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('critical_infrastructure','risk_analysis','asset_irp','asset_inventory','consistenza')),
  source_id text NOT NULL,
  source_label text,
  role text NOT NULL DEFAULT 'supporting' CHECK (role IN ('primary','supporting','recovery','data')),
  is_confirmed boolean NOT NULL DEFAULT true,
  source_updated_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_service_id, source_type, source_id)
);

CREATE TABLE public.bia_risk_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_service_id uuid NOT NULL REFERENCES public.business_services(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('risk_analysis','asset_irp','assessment_gap','surface_finding','darkrisk_finding')),
  source_id text NOT NULL,
  source_label text,
  normalized_residual_risk numeric CHECK (normalized_residual_risk BETWEEN 0 AND 100),
  normalization_method text,
  is_confirmed boolean NOT NULL DEFAULT true,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_service_id, source_type, source_id)
);

CREATE TABLE public.bia_remediation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_service_id uuid NOT NULL REFERENCES public.business_services(id) ON DELETE CASCADE,
  bia_assessment_id uuid REFERENCES public.bia_assessments(id) ON DELETE SET NULL,
  remediation_task_id uuid NOT NULL REFERENCES public.remediation_tasks(id) ON DELETE CASCADE,
  risk_link_id uuid REFERENCES public.bia_risk_links(id) ON DELETE SET NULL,
  impact_horizon_minutes integer,
  estimated_risk_reduction_percent numeric CHECK (estimated_risk_reduction_percent BETWEEN 0 AND 100),
  reduction_source text,
  useful_life_years numeric CHECK (useful_life_years > 0),
  recurring_annual_cost numeric CHECK (recurring_annual_cost >= 0),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_service_id, remediation_task_id),
  CHECK (estimated_risk_reduction_percent IS NULL OR length(trim(coalesce(reduction_source,''))) > 0)
);

CREATE TABLE public.bia_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  event_type text NOT NULL,
  before_json jsonb, after_json jsonb,
  reason text,
  model_version text,
  actor_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.bia_audit_events (organization_id, entity_id, created_at DESC);

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.business_services TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.bia_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bia_impact_values TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bia_service_dependencies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bia_technical_asset_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bia_risk_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bia_remediation_links TO authenticated;
GRANT SELECT, INSERT ON public.bia_audit_events TO authenticated;
GRANT ALL ON public.business_services, public.bia_assessments, public.bia_impact_values, public.bia_service_dependencies,
  public.bia_technical_asset_links, public.bia_risk_links, public.bia_remediation_links, public.bia_audit_events TO service_role;

ALTER TABLE public.business_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bia_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bia_impact_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bia_service_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bia_technical_asset_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bia_risk_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bia_remediation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bia_audit_events ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "bia services read" ON public.business_services FOR SELECT TO authenticated USING (public.sc_can_access_org(organization_id));
CREATE POLICY "bia services insert" ON public.business_services FOR INSERT TO authenticated WITH CHECK (public.bia_can_edit(organization_id));
CREATE POLICY "bia services update" ON public.business_services FOR UPDATE TO authenticated USING (public.bia_can_edit(organization_id)) WITH CHECK (public.bia_can_edit(organization_id));

CREATE POLICY "bia assessments read" ON public.bia_assessments FOR SELECT TO authenticated
  USING (public.sc_can_access_org(organization_id) AND (NOT public.bia_sales_only(organization_id) OR status IN ('approved','superseded')));
CREATE POLICY "bia assessments insert" ON public.bia_assessments FOR INSERT TO authenticated WITH CHECK (public.bia_can_edit(organization_id) AND status = 'draft');
CREATE POLICY "bia assessments update draft" ON public.bia_assessments FOR UPDATE TO authenticated
  USING (public.bia_can_edit(organization_id) AND status = 'draft') WITH CHECK (public.bia_can_edit(organization_id) AND status = 'draft');

CREATE POLICY "bia impacts read" ON public.bia_impact_values FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bia_assessments b WHERE b.id = bia_assessment_id));
CREATE POLICY "bia impacts write" ON public.bia_impact_values FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bia_assessments b WHERE b.id = bia_assessment_id AND b.status = 'draft' AND public.bia_can_edit(b.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bia_assessments b WHERE b.id = bia_assessment_id AND b.status = 'draft' AND public.bia_can_edit(b.organization_id)));

CREATE POLICY "bia deps read" ON public.bia_service_dependencies FOR SELECT TO authenticated USING (public.sc_can_access_org(organization_id));
CREATE POLICY "bia deps write" ON public.bia_service_dependencies FOR ALL TO authenticated USING (public.bia_can_edit(organization_id)) WITH CHECK (public.bia_can_edit(organization_id));
CREATE POLICY "bia assets read" ON public.bia_technical_asset_links FOR SELECT TO authenticated USING (public.sc_can_access_org(organization_id));
CREATE POLICY "bia assets write" ON public.bia_technical_asset_links FOR ALL TO authenticated USING (public.bia_can_edit(organization_id)) WITH CHECK (public.bia_can_edit(organization_id));
CREATE POLICY "bia risks read" ON public.bia_risk_links FOR SELECT TO authenticated USING (public.sc_can_access_org(organization_id));
CREATE POLICY "bia risks write" ON public.bia_risk_links FOR ALL TO authenticated USING (public.bia_can_edit(organization_id)) WITH CHECK (public.bia_can_edit(organization_id));
CREATE POLICY "bia rem read" ON public.bia_remediation_links FOR SELECT TO authenticated USING (public.sc_can_access_org(organization_id));
CREATE POLICY "bia rem write" ON public.bia_remediation_links FOR ALL TO authenticated USING (public.bia_can_edit(organization_id)) WITH CHECK (public.bia_can_edit(organization_id));
CREATE POLICY "bia audit read" ON public.bia_audit_events FOR SELECT TO authenticated USING (public.bia_can_edit(organization_id));
CREATE POLICY "bia audit insert" ON public.bia_audit_events FOR INSERT TO authenticated WITH CHECK (public.bia_can_edit(organization_id) AND actor_id = auth.uid());

-- Service code + timestamps
CREATE OR REPLACE FUNCTION public.bia_service_before()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.code IS NULL OR NEW.code = '' THEN
      SELECT count(*) + 1 INTO n FROM public.business_services WHERE organization_id = NEW.organization_id;
      NEW.code := 'SRV-' || lpad(n::text, 3, '0');
      WHILE EXISTS (SELECT 1 FROM public.business_services WHERE organization_id = NEW.organization_id AND code = NEW.code) LOOP
        n := n + 1; NEW.code := 'SRV-' || lpad(n::text, 3, '0');
      END LOOP;
    END IF;
  ELSE
    NEW.code := OLD.code; -- codice immutabile
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bia_service_before BEFORE INSERT OR UPDATE ON public.business_services FOR EACH ROW EXECUTE FUNCTION public.bia_service_before();
CREATE TRIGGER bia_impacts_updated BEFORE UPDATE ON public.bia_impact_values FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Totali economici calcolati dal database
CREATE OR REPLACE FUNCTION public.bia_impact_totals()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.calculated_total := NEW.lost_contribution_margin + NEW.idle_labor_cost + NEW.extra_operating_cost
    + NEW.recovery_response_cost + NEW.contractual_penalties + NEW.regulatory_legal_cost
    + NEW.customer_reputation_cost + NEW.other_cost;
  NEW.effective_total := COALESCE(NEW.manual_total, NEW.calculated_total);
  RETURN NEW;
END $$;
CREATE TRIGGER bia_impact_totals BEFORE INSERT OR UPDATE ON public.bia_impact_values FOR EACH ROW EXECUTE FUNCTION public.bia_impact_totals();

-- Immutabilità: versioni non in bozza modificabili solo dalle funzioni di workflow
CREATE OR REPLACE FUNCTION public.bia_assessment_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('bia.internal', true) IS DISTINCT FROM 'on' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'bia_not_editable: la versione % è %', OLD.version, OLD.status USING ERRCODE = 'P0001'; END IF;
    IF NEW.status <> OLD.status OR NEW.version <> OLD.version OR NEW.business_service_id <> OLD.business_service_id
       OR NEW.organization_id <> OLD.organization_id OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.business_impact_score IS DISTINCT FROM OLD.business_impact_score OR NEW.result IS DISTINCT FROM OLD.result THEN
      RAISE EXCEPTION 'bia_protected_fields: usa le funzioni di workflow' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.annual_frequency IS NOT NULL AND length(trim(coalesce(NEW.annual_frequency_source,''))) = 0 THEN
      RAISE EXCEPTION 'annual_frequency_source_required' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER bia_assessment_guard BEFORE UPDATE ON public.bia_assessments FOR EACH ROW EXECUTE FUNCTION public.bia_assessment_guard();

-- Stesso tenant per dipendenze
CREATE OR REPLACE FUNCTION public.bia_dependency_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.business_services WHERE id = NEW.service_id AND organization_id = NEW.organization_id)
     OR NOT EXISTS (SELECT 1 FROM public.business_services WHERE id = NEW.depends_on_service_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'dependency_cross_tenant' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bia_dependency_guard BEFORE INSERT OR UPDATE ON public.bia_service_dependencies FOR EACH ROW EXECUTE FUNCTION public.bia_dependency_guard();

-- Link: servizio, asset e task devono essere dello stesso tenant
CREATE OR REPLACE FUNCTION public.bia_link_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ok boolean := true;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.business_services WHERE id = NEW.business_service_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'link_cross_tenant' USING ERRCODE = 'P0001';
  END IF;
  IF TG_TABLE_NAME = 'bia_remediation_links' THEN
    ok := EXISTS (SELECT 1 FROM public.remediation_tasks WHERE id = NEW.remediation_task_id AND organization_id = NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'bia_technical_asset_links' THEN
    IF NEW.source_type = 'critical_infrastructure' THEN
      ok := EXISTS (SELECT 1 FROM public.critical_infrastructure WHERE id::text = NEW.source_id AND organization_id = NEW.organization_id);
    ELSIF NEW.source_type = 'risk_analysis' THEN
      ok := EXISTS (SELECT 1 FROM public.risk_analysis WHERE id::text = NEW.source_id AND organization_id = NEW.organization_id);
    ELSIF NEW.source_type = 'asset_irp' THEN
      ok := EXISTS (SELECT 1 FROM public.asset_irp WHERE id::text = NEW.source_id AND organization_id = NEW.organization_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'bia_risk_links' THEN
    IF NEW.source_type = 'risk_analysis' THEN
      SELECT true, 100 - r.risk_score, 'inverted_100_minus_risk_score', r.updated_at
        INTO ok, NEW.normalized_residual_risk, NEW.normalization_method, NEW.source_updated_at
        FROM public.risk_analysis r WHERE r.id::text = NEW.source_id AND r.organization_id = NEW.organization_id;
      ok := coalesce(ok, false);
    ELSIF NEW.source_type = 'asset_irp' THEN
      SELECT true, a.rischio_residuo, 'direct_rischio_residuo', a.updated_at
        INTO ok, NEW.normalized_residual_risk, NEW.normalization_method, NEW.source_updated_at
        FROM public.asset_irp a WHERE a.id::text = NEW.source_id AND a.organization_id = NEW.organization_id;
      ok := coalesce(ok, false);
    END IF;
  END IF;
  IF NOT ok THEN RAISE EXCEPTION 'source_not_found_or_cross_tenant' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bia_link_guard BEFORE INSERT OR UPDATE ON public.bia_technical_asset_links FOR EACH ROW EXECUTE FUNCTION public.bia_link_guard();
CREATE TRIGGER bia_link_guard BEFORE INSERT OR UPDATE ON public.bia_risk_links FOR EACH ROW EXECUTE FUNCTION public.bia_link_guard();
CREATE TRIGGER bia_link_guard BEFORE INSERT OR UPDATE ON public.bia_remediation_links FOR EACH ROW EXECUTE FUNCTION public.bia_link_guard();

CREATE OR REPLACE FUNCTION public.bia_audit(_org uuid, _etype text, _eid uuid, _event text, _before jsonb, _after jsonb, _reason text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.bia_audit_events (organization_id, entity_type, entity_id, event_type, before_json, after_json, reason, model_version, actor_id)
  VALUES (_org, _etype, _eid, _event, _before, _after, _reason, 'BIA_SCORE_V1', auth.uid());
$$;

-- Parser frequenza backup testuale -> minuti (null = sconosciuto)
CREATE OR REPLACE FUNCTION public.bia_backup_minutes(_txt text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _txt IS NULL OR trim(_txt) = '' THEN NULL
    WHEN lower(_txt) ~ '(continu|real|tempo reale|replica|sincron)' THEN 0
    WHEN lower(_txt) ~ '(15 ?min)' THEN 15
    WHEN lower(_txt) ~ '(30 ?min)' THEN 30
    WHEN lower(_txt) ~ '(orari|hour|ogni ora)' THEN 60
    WHEN lower(_txt) ~ '(4 ?or|4h)' THEN 240
    WHEN lower(_txt) ~ '(giorn|daily|quotid|notturn|24)' THEN 1440
    WHEN lower(_txt) ~ '(settim|weekly)' THEN 10080
    WHEN lower(_txt) ~ '(mens|month)' THEN 43200
    ELSE NULL END
$$;

-- ============ Motore di calcolo autoritativo BIA_SCORE_V1 ============
CREATE OR REPLACE FUNCTION public.bia_compute(_bia_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bia_assessments%ROWTYPE; s public.business_services%ROWTYPE; cfg public.bia_model_configurations%ROWTYPE;
  cost24 numeric; econ numeric; dep_base numeric; dep numeric; dependents integer; bis numeric; cls text;
  resid numeric; bpi numeric; eal numeric; eal_status text;
  cur_rto integer; cur_backup integer; last_test date; runbook boolean; assets integer;
  rto_state text; rpo_state text; test_state text; rb_state text; owner_state text;
  cov numeric := 0; covw numeric := 0; w jsonb; req_total integer := 10; req_done integer := 0; data_cov numeric; conf text;
  low_conf integer; n_imp integer; bucket jsonb; res jsonb; suggested integer; curve jsonb; warnings jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO b FROM public.bia_assessments WHERE id = _bia_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'bia_not_found'; END IF;
  IF NOT public.sc_can_access_org(b.organization_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO cfg FROM public.bia_model_configurations WHERE model_version = b.model_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_model_version: %', b.model_version; END IF;
  SELECT * INTO s FROM public.business_services WHERE id = b.business_service_id;

  -- Economico
  SELECT effective_total INTO cost24 FROM public.bia_impact_values WHERE bia_assessment_id = b.id AND horizon_minutes = 1440;
  IF cost24 IS NOT NULL THEN
    econ := 0;
    FOR bucket IN SELECT * FROM jsonb_array_elements(cfg.economic_buckets) LOOP
      IF cost24 >= (bucket->>'min')::numeric AND (cost24 > 0 OR (bucket->>'min')::numeric = 0) THEN econ := (bucket->>'score')::numeric; END IF;
    END LOOP;
    IF cost24 = 0 THEN econ := 0; END IF;
  ELSIF b.economic_level IS NOT NULL THEN
    econ := b.economic_level * 25;
  END IF;

  -- Dipendenza interna: servizi che dipendono da questo
  SELECT count(DISTINCT service_id) INTO dependents FROM public.bia_service_dependencies d
    JOIN public.business_services x ON x.id = d.service_id AND x.status = 'active'
    WHERE d.depends_on_service_id = s.id;
  dep_base := CASE WHEN dependents = 0 THEN 0 WHEN dependents <= 2 THEN 33.33 WHEN dependents <= 5 THEN 66.67 ELSE 100 END;
  dep := LEAST(100, dep_base + CASE WHEN b.dependency_spof THEN 15 ELSE 0 END + CASE WHEN NOT b.dependency_workaround THEN 10 ELSE 0 END);

  -- BIS: calcolato solo con tutte le dimensioni presenti
  IF econ IS NOT NULL AND b.operational_score IS NOT NULL AND b.regulatory_score IS NOT NULL AND b.reputational_score IS NOT NULL THEN
    bis := round(econ * (cfg.weights->>'economic')::numeric + b.operational_score * (cfg.weights->>'operational')::numeric
      + b.regulatory_score * (cfg.weights->>'regulatory')::numeric + b.reputational_score * (cfg.weights->>'reputational')::numeric
      + dep * (cfg.weights->>'dependency')::numeric, 2);
    cls := CASE WHEN round(bis) >= (cfg.class_thresholds->>'critical')::numeric THEN 'critical'
                WHEN round(bis) >= (cfg.class_thresholds->>'high')::numeric THEN 'high'
                WHEN round(bis) >= (cfg.class_thresholds->>'medium')::numeric THEN 'medium' ELSE 'low' END;
  END IF;

  -- Rischio tecnico residuo: massimo dei rischi confermati (worst case)
  SELECT max(normalized_residual_risk) INTO resid FROM public.bia_risk_links WHERE business_service_id = s.id AND is_confirmed;
  IF bis IS NOT NULL AND resid IS NOT NULL THEN bpi := round(bis * resid / 100, 2); END IF;

  -- EAL solo con frequenza documentata
  IF cost24 IS NULL THEN eal_status := 'missing_cost';
  ELSIF b.annual_frequency IS NULL OR length(trim(coalesce(b.annual_frequency_source,''))) = 0 THEN eal_status := 'missing_frequency';
  ELSE eal := cost24 * b.annual_frequency; eal_status := 'calculated'; END IF;

  -- Capacità corrente dagli asset di infrastruttura critica collegati
  SELECT count(*), max(ci.rto_hours) * 60, max(public.bia_backup_minutes(ci.backup_frequency)), min(ci.last_test_date),
         bool_and(coalesce(trim(ci.runbook_link),'') <> '')
    INTO assets, cur_rto, cur_backup, last_test, runbook
    FROM public.bia_technical_asset_links l JOIN public.critical_infrastructure ci ON ci.id::text = l.source_id
    WHERE l.business_service_id = s.id AND l.source_type = 'critical_infrastructure' AND l.is_confirmed;
  rto_state := CASE WHEN b.rto_target_minutes IS NULL OR cur_rto IS NULL THEN 'unknown' WHEN cur_rto <= b.rto_target_minutes THEN 'covered' ELSE 'not_covered' END;
  rpo_state := CASE WHEN b.rpo_target_minutes IS NULL OR cur_backup IS NULL THEN 'unknown' WHEN cur_backup <= b.rpo_target_minutes THEN 'covered' ELSE 'not_covered' END;
  test_state := CASE WHEN assets = 0 OR last_test IS NULL THEN 'unknown' WHEN last_test >= current_date - 365 THEN 'covered' ELSE 'not_covered' END;
  rb_state := CASE WHEN assets = 0 THEN 'unknown' WHEN runbook THEN 'covered' ELSE 'not_covered' END;
  owner_state := CASE WHEN s.business_owner_contact_id IS NOT NULL THEN 'covered' ELSE 'not_covered' END;
  w := cfg.resilience_weights;
  cov := (CASE WHEN rto_state='covered' THEN (w->>'rto_covered')::numeric ELSE 0 END)
       + (CASE WHEN rpo_state='covered' THEN (w->>'rpo_covered')::numeric ELSE 0 END)
       + (CASE WHEN test_state='covered' THEN (w->>'backup_test_recent')::numeric ELSE 0 END)
       + (CASE WHEN rb_state='covered' THEN (w->>'runbook_present')::numeric ELSE 0 END)
       + (CASE WHEN owner_state='covered' THEN (w->>'owner_present')::numeric ELSE 0 END);
  SELECT sum(value::numeric) INTO covw FROM jsonb_each_text(w);

  -- Suggerimento RTO: primo orizzonte con impatto alto (economico >= 50.000 EUR o operativo >= 66.67)
  SELECT min(horizon_minutes) INTO suggested FROM public.bia_impact_values
    WHERE bia_assessment_id = b.id AND (effective_total >= 50000 OR coalesce(b.operational_score,0) >= 66.67);

  -- Curva e monotonia
  SELECT coalesce(jsonb_agg(jsonb_build_object('horizon_minutes', horizon_minutes, 'total', effective_total::text, 'confidence', confidence,
           'manual_override', manual_total IS NOT NULL) ORDER BY horizon_minutes), '[]'::jsonb),
         count(*), count(*) FILTER (WHERE confidence = 'low' OR trim(source_notes) = '')
    INTO curve, n_imp, low_conf FROM public.bia_impact_values WHERE bia_assessment_id = b.id;
  IF EXISTS (SELECT 1 FROM (SELECT effective_total, lag(effective_total) OVER (ORDER BY horizon_minutes) p FROM public.bia_impact_values WHERE bia_assessment_id = b.id) q WHERE p IS NOT NULL AND effective_total < p) THEN
    warnings := warnings || '["non_monotonic_curve"]'::jsonb;
  END IF;
  IF b.rto_target_minutes IS NOT NULL AND b.mtpd_minutes IS NOT NULL AND b.rto_target_minutes >= b.mtpd_minutes THEN
    warnings := warnings || '["rto_not_less_than_mtpd"]'::jsonb;
  END IF;
  IF test_state = 'not_covered' THEN warnings := warnings || '["backup_test_stale"]'::jsonb; END IF;

  -- Copertura dati (10 campi obbligatori)
  req_done := (CASE WHEN s.business_owner_contact_id IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN cost24 IS NOT NULL OR n_imp > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN b.operational_score IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN b.regulatory_score IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN b.reputational_score IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN b.mtpd_minutes IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN b.rto_target_minutes IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN b.rpo_target_minutes IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN length(trim(coalesce(b.assumptions,''))) > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN assets > 0 OR EXISTS (SELECT 1 FROM public.bia_service_dependencies WHERE service_id = s.id) OR length(trim(coalesce(b.no_dependency_reason,''))) > 0 THEN 1 ELSE 0 END);
  data_cov := round(req_done::numeric / req_total * 100, 2);
  conf := CASE WHEN data_cov < 60 OR (n_imp > 0 AND low_conf * 2 >= n_imp) OR n_imp = 0 THEN 'low'
               WHEN data_cov >= 85 AND low_conf = 0 AND NOT EXISTS (SELECT 1 FROM public.bia_impact_values WHERE bia_assessment_id = b.id AND confidence <> 'high') THEN 'high'
               ELSE 'medium' END;

  res := jsonb_build_object(
    'model_version', b.model_version, 'weights', cfg.weights, 'thresholds', cfg.class_thresholds,
    'normalized', jsonb_build_object('economic', econ, 'operational', b.operational_score, 'regulatory', b.regulatory_score, 'reputational', b.reputational_score, 'dependency', dep, 'dependents', dependents),
    'business_impact_score', bis, 'criticality_class', cls,
    'potential_downtime_cost_24h', cost24::text, 'curve', curve,
    'technical_residual_risk', resid, 'residual_risk_method', 'max_confirmed',
    'business_priority_index', bpi,
    'expected_annual_loss', eal::text, 'expected_annual_loss_status', eal_status,
    'recovery', jsonb_build_object('current_recovery_minutes', cur_rto, 'current_backup_interval_minutes', cur_backup, 'last_test_date', last_test,
        'rto_gap_minutes', CASE WHEN rto_state='unknown' THEN NULL ELSE GREATEST(0, cur_rto - b.rto_target_minutes) END,
        'rpo_gap_minutes', CASE WHEN rpo_state='unknown' THEN NULL ELSE GREATEST(0, cur_backup - b.rpo_target_minutes) END,
        'rto', rto_state, 'rpo', rpo_state, 'backup_test', test_state, 'runbook', rb_state, 'owner', owner_state,
        'suggested_rto_upper_bound_minutes', suggested, 'suggestion_rule', 'primo orizzonte con costo >= 50.000 EUR o impatto operativo >= Alto'),
    'resilience_score', round(cov / NULLIF(covw,0) * 100, 2),
    'data_coverage_percent', data_cov, 'confidence', conf, 'warnings', warnings,
    'calculated_at', now());

  PERFORM set_config('bia.internal', 'on', true);
  UPDATE public.bia_assessments SET economic_score = econ, dependency_score = dep, business_impact_score = bis, criticality_class = cls,
    data_coverage_percent = data_cov, confidence = conf, result = res, calculated_at = now()
    WHERE id = b.id AND status IN ('draft','in_review');
  PERFORM set_config('bia.internal', 'off', true);
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.bia_submit(_bia_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bia_assessments%ROWTYPE; s public.business_services%ROWTYPE; errs text[] := '{}'; res jsonb;
BEGIN
  SELECT * INTO b FROM public.bia_assessments WHERE id = _bia_id FOR UPDATE;
  IF NOT FOUND OR NOT public.bia_can_edit(b.organization_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF b.status = 'in_review' THEN RETURN jsonb_build_object('ok', true, 'idempotent', true); END IF;
  IF b.status <> 'draft' THEN RAISE EXCEPTION 'bia_not_draft'; END IF;
  SELECT * INTO s FROM public.business_services WHERE id = b.business_service_id;
  IF s.business_owner_contact_id IS NULL THEN errs := errs || 'business_owner_missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bia_impact_values WHERE bia_assessment_id = b.id) THEN errs := errs || 'economic_horizon_missing'; END IF;
  IF b.mtpd_minutes IS NULL OR b.rto_target_minutes IS NULL THEN errs := errs || 'mtpd_rto_missing';
  ELSIF b.rto_target_minutes >= b.mtpd_minutes THEN errs := errs || 'rto_not_less_than_mtpd'; END IF;
  IF length(trim(coalesce(b.assumptions,''))) = 0 THEN errs := errs || 'assumptions_missing'; END IF;
  IF EXISTS (SELECT 1 FROM public.bia_impact_values WHERE bia_assessment_id = b.id AND trim(source_notes) = '') THEN errs := errs || 'cost_source_missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bia_service_dependencies WHERE service_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM public.bia_technical_asset_links WHERE business_service_id = s.id)
     AND length(trim(coalesce(b.no_dependency_reason,''))) = 0 THEN errs := errs || 'dependency_or_reason_missing'; END IF;
  IF b.operational_score IS NULL OR b.regulatory_score IS NULL OR b.reputational_score IS NULL THEN errs := errs || 'impact_dimensions_missing'; END IF;
  IF array_length(errs, 1) > 0 THEN RETURN jsonb_build_object('ok', false, 'errors', to_jsonb(errs)); END IF;
  res := public.bia_compute(b.id);
  PERFORM set_config('bia.internal', 'on', true);
  UPDATE public.bia_assessments SET status = 'in_review', submitted_by = auth.uid(), submitted_at = now(), review_comment = NULL WHERE id = b.id;
  PERFORM set_config('bia.internal', 'off', true);
  PERFORM public.bia_audit(b.organization_id, 'bia_assessment', b.id, 'submit', NULL, res, NULL);
  RETURN jsonb_build_object('ok', true, 'result', res);
END $$;

CREATE OR REPLACE FUNCTION public.bia_request_changes(_bia_id uuid, _comment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bia_assessments%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.bia_assessments WHERE id = _bia_id FOR UPDATE;
  IF NOT FOUND OR NOT public.bia_can_approve(b.organization_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF b.status <> 'in_review' THEN RAISE EXCEPTION 'bia_not_in_review'; END IF;
  IF length(trim(coalesce(_comment,''))) = 0 THEN RAISE EXCEPTION 'comment_required'; END IF;
  PERFORM set_config('bia.internal', 'on', true);
  UPDATE public.bia_assessments SET status = 'draft', review_comment = _comment WHERE id = b.id;
  PERFORM set_config('bia.internal', 'off', true);
  PERFORM public.bia_audit(b.organization_id, 'bia_assessment', b.id, 'reject', NULL, NULL, _comment);
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.bia_approve(_bia_id uuid, _review_months integer DEFAULT 12)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bia_assessments%ROWTYPE; res jsonb; snap jsonb;
BEGIN
  SELECT * INTO b FROM public.bia_assessments WHERE id = _bia_id FOR UPDATE;
  IF NOT FOUND OR NOT public.bia_can_approve(b.organization_id) THEN RAISE EXCEPTION 'forbidden: approvazione riservata ad admin'; END IF;
  IF b.status = 'approved' THEN RETURN jsonb_build_object('ok', true, 'idempotent', true); END IF;
  IF b.status <> 'in_review' THEN RAISE EXCEPTION 'bia_not_in_review'; END IF;
  -- separazione dei compiti: chi ha inviato non approva (bypass super_admin)
  IF b.submitted_by = auth.uid() AND NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'separation_of_duties: chi invia non può approvare';
  END IF;
  IF b.rto_target_minutes >= b.mtpd_minutes THEN RAISE EXCEPTION 'rto_not_less_than_mtpd'; END IF;
  res := public.bia_compute(b.id);
  SELECT jsonb_build_object('assessment', to_jsonb(x) - 'approved_snapshot', 'impacts',
      (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.horizon_minutes), '[]'::jsonb) FROM public.bia_impact_values i WHERE i.bia_assessment_id = b.id),
      'service', (SELECT to_jsonb(s) FROM public.business_services s WHERE s.id = b.business_service_id),
      'dependencies', (SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM public.bia_service_dependencies d WHERE d.service_id = b.business_service_id),
      'assets', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM public.bia_technical_asset_links a WHERE a.business_service_id = b.business_service_id),
      'risks', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.bia_risk_links r WHERE r.business_service_id = b.business_service_id),
      'remediations', (SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) FROM public.bia_remediation_links m WHERE m.business_service_id = b.business_service_id))
    INTO snap FROM public.bia_assessments x WHERE x.id = b.id;
  PERFORM set_config('bia.internal', 'on', true);
  UPDATE public.bia_assessments SET status = 'superseded' WHERE business_service_id = b.business_service_id AND status = 'approved' AND id <> b.id;
  UPDATE public.bia_assessments SET status = 'approved', approved_by = auth.uid(), approved_at = now(), approved_snapshot = snap,
    review_due_at = (current_date + make_interval(months => GREATEST(1, _review_months)))::date WHERE id = b.id;
  PERFORM set_config('bia.internal', 'off', true);
  UPDATE public.business_services SET last_reviewed_at = now() WHERE id = b.business_service_id;
  PERFORM public.bia_audit(b.organization_id, 'bia_assessment', b.id, 'approve', NULL, res, NULL);
  RETURN jsonb_build_object('ok', true, 'result', res);
END $$;

CREATE OR REPLACE FUNCTION public.bia_clone_revision(_bia_id uuid, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bia_assessments%ROWTYPE; new_id uuid; nv integer;
BEGIN
  SELECT * INTO b FROM public.bia_assessments WHERE id = _bia_id;
  IF NOT FOUND OR NOT public.bia_can_edit(b.organization_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF b.status NOT IN ('approved','superseded') THEN RAISE EXCEPTION 'bia_not_approved'; END IF;
  SELECT id INTO new_id FROM public.bia_assessments WHERE business_service_id = b.business_service_id AND status IN ('draft','in_review');
  IF new_id IS NOT NULL THEN RETURN new_id; END IF; -- idempotente
  SELECT max(version) + 1 INTO nv FROM public.bia_assessments WHERE business_service_id = b.business_service_id;
  INSERT INTO public.bia_assessments (organization_id, business_service_id, version, status, model_version, currency, economic_level,
    operational_score, regulatory_score, regulatory_source, reputational_score, dependency_spof, dependency_workaround, no_dependency_reason,
    mtpd_minutes, rto_target_minutes, rpo_target_minutes, degraded_mode, minimum_capacity_percent, recovery_rank,
    annual_frequency, annual_frequency_source, assumptions, review_comment)
  VALUES (b.organization_id, b.business_service_id, nv, 'draft', b.model_version, b.currency, b.economic_level,
    b.operational_score, b.regulatory_score, b.regulatory_source, b.reputational_score, b.dependency_spof, b.dependency_workaround, b.no_dependency_reason,
    b.mtpd_minutes, b.rto_target_minutes, b.rpo_target_minutes, b.degraded_mode, b.minimum_capacity_percent, b.recovery_rank,
    b.annual_frequency, b.annual_frequency_source, b.assumptions, _reason)
  RETURNING id INTO new_id;
  INSERT INTO public.bia_impact_values (bia_assessment_id, horizon_minutes, lost_contribution_margin, idle_labor_cost, extra_operating_cost,
    recovery_response_cost, contractual_penalties, regulatory_legal_cost, customer_reputation_cost, other_cost, manual_total, source_notes, confidence, override_reason)
  SELECT new_id, horizon_minutes, lost_contribution_margin, idle_labor_cost, extra_operating_cost, recovery_response_cost, contractual_penalties,
    regulatory_legal_cost, customer_reputation_cost, other_cost, manual_total, source_notes, confidence, override_reason
  FROM public.bia_impact_values WHERE bia_assessment_id = b.id;
  PERFORM public.bia_compute(new_id);
  PERFORM public.bia_audit(b.organization_id, 'bia_assessment', new_id, 'clone_revision', jsonb_build_object('from', b.id, 'version', b.version), NULL, _reason);
  RETURN new_id;
END $$;

-- Dashboard aggregata lato database
CREATE OR REPLACE FUNCTION public.bia_dashboard(_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; sales_only boolean;
BEGIN
  IF NOT public.sc_can_access_org(_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  sales_only := public.bia_sales_only(_org);
  WITH svc AS (SELECT * FROM public.business_services WHERE organization_id = _org AND status = 'active'),
  cur AS (
    SELECT DISTINCT ON (a.business_service_id) a.*
    FROM public.bia_assessments a JOIN svc ON svc.id = a.business_service_id
    WHERE a.status <> 'superseded' AND (NOT sales_only OR a.status = 'approved')
    ORDER BY a.business_service_id, (a.status = 'approved') DESC, a.version DESC
  ),
  appr AS (
    SELECT DISTINCT ON (a.business_service_id) a.* FROM public.bia_assessments a JOIN svc ON svc.id = a.business_service_id
    WHERE a.status = 'approved' ORDER BY a.business_service_id, a.version DESC
  )
  SELECT jsonb_build_object(
    'services_total', (SELECT count(*) FROM svc),
    'approved', (SELECT count(*) FROM appr),
    'drafts', (SELECT count(*) FROM public.bia_assessments a JOIN svc ON svc.id = a.business_service_id WHERE a.status = 'draft'),
    'in_review', (SELECT count(*) FROM public.bia_assessments a JOIN svc ON svc.id = a.business_service_id WHERE a.status = 'in_review'),
    'stale', (SELECT count(*) FROM appr WHERE review_due_at < current_date),
    'review_due_30d', (SELECT count(*) FROM appr WHERE review_due_at BETWEEN current_date AND current_date + 30),
    'critical', (SELECT count(*) FROM cur WHERE criticality_class = 'critical'),
    'high', (SELECT count(*) FROM cur WHERE criticality_class = 'high'),
    'cost_24h_total', (SELECT coalesce(sum((result->>'potential_downtime_cost_24h')::numeric),0)::text FROM cur),
    'cost_24h_coverage', (SELECT count(*) FROM cur WHERE result->>'potential_downtime_cost_24h' IS NOT NULL),
    'rto_not_covered', (SELECT count(*) FROM cur WHERE result->'recovery'->>'rto' = 'not_covered'),
    'rpo_not_covered', (SELECT count(*) FROM cur WHERE result->'recovery'->>'rpo' = 'not_covered'),
    'recovery_unknown', (SELECT count(*) FROM cur WHERE result->'recovery'->>'rto' = 'unknown'),
    'no_owner', (SELECT count(*) FROM svc WHERE business_owner_contact_id IS NULL),
    'low_confidence', (SELECT count(*) FROM cur WHERE confidence = 'low'),
    'critical_protected', (SELECT count(*) FROM cur WHERE criticality_class IN ('critical','high') AND result->'recovery'->>'rto' = 'covered' AND result->'recovery'->>'rpo' = 'covered'),
    'critical_total', (SELECT count(*) FROM cur WHERE criticality_class IN ('critical','high')),
    'resilience_avg', (SELECT round(avg((result->>'resilience_score')::numeric),1) FROM cur),
    'residual_risk_max', (SELECT max((result->>'technical_residual_risk')::numeric) FROM cur),
    'remediation_linked', (SELECT count(*) FROM public.bia_remediation_links l JOIN svc ON svc.id = l.business_service_id),
    'remediation_budget', (SELECT coalesce(sum(t.budget),0)::text FROM public.bia_remediation_links l JOIN svc ON svc.id = l.business_service_id JOIN public.remediation_tasks t ON t.id = l.remediation_task_id),
    'curve', (SELECT coalesce(jsonb_agg(jsonb_build_object('horizon_minutes', h, 'total', t::text, 'services', n) ORDER BY h), '[]'::jsonb)
              FROM (SELECT i.horizon_minutes h, sum(i.effective_total) t, count(*) n FROM public.bia_impact_values i JOIN cur ON cur.id = i.bia_assessment_id GROUP BY 1) q),
    'recovery_order', (SELECT coalesce(jsonb_agg(jsonb_build_object('service_id', svc.id, 'name', svc.name, 'rank', appr.recovery_rank, 'rto', appr.rto_target_minutes,
                          'rpo', appr.rpo_target_minutes, 'mtpd', appr.mtpd_minutes, 'class', appr.criticality_class, 'version', appr.version)
                          ORDER BY appr.recovery_rank NULLS LAST, appr.rto_target_minutes NULLS LAST), '[]'::jsonb)
                       FROM appr JOIN svc ON svc.id = appr.business_service_id),
    'generated_at', now()
  ) INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.bia_can_edit(uuid), public.bia_can_approve(uuid), public.bia_sales_only(uuid),
  public.bia_audit(uuid,text,uuid,text,jsonb,jsonb,text), public.bia_compute(uuid), public.bia_submit(uuid),
  public.bia_request_changes(uuid,text), public.bia_approve(uuid,integer), public.bia_clone_revision(uuid,text),
  public.bia_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bia_can_edit(uuid), public.bia_can_approve(uuid), public.bia_sales_only(uuid),
  public.bia_compute(uuid), public.bia_submit(uuid), public.bia_request_changes(uuid,text), public.bia_approve(uuid,integer),
  public.bia_clone_revision(uuid,text), public.bia_dashboard(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.bia_audit(uuid,text,uuid,text,jsonb,jsonb,text) FROM authenticated;
