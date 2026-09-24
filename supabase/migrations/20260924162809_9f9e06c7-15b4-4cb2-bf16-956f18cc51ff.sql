
ALTER TABLE public.supplier_directory
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS service_description text,
  ADD COLUMN IF NOT EXISTS criticality text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'IT',
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assessment_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_assessment_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  ALTER TABLE public.supplier_directory ADD CONSTRAINT supplier_directory_criticality_chk CHECK (criticality IN ('low','medium','high','critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.supplier_directory ADD CONSTRAINT supplier_directory_status_chk CHECK (status IN ('draft','invited','active','suspended','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_supplier_dir_org_status ON public.supplier_directory(organization_id,status);
CREATE INDEX IF NOT EXISTS idx_supplier_dir_org_crit ON public.supplier_directory(organization_id,criticality);
CREATE INDEX IF NOT EXISTS idx_supplier_dir_email ON public.supplier_directory(lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_dir_active_name ON public.supplier_directory(organization_id, lower(supplier_name)) WHERE archived_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_directory TO authenticated;
GRANT ALL ON public.supplier_directory TO service_role;

CREATE OR REPLACE FUNCTION public.sc_can_access_org(_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.surface_scan_can_access_customer(auth.uid(), _org)
$$;

-- portal users
CREATE TABLE IF NOT EXISTS public.supplier_portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.supplier_directory(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','contributor')),
  must_change_password boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  invited_at timestamptz DEFAULT now(), activated_at timestamptz, last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, auth_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spu_active_user ON public.supplier_portal_users(auth_user_id) WHERE is_active;
GRANT SELECT ON public.supplier_portal_users TO authenticated;
GRANT ALL ON public.supplier_portal_users TO service_role;
ALTER TABLE public.supplier_portal_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sc_my_supplier_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.supplier_id FROM public.supplier_portal_users p
  JOIN public.supplier_directory s ON s.id=p.supplier_id
  WHERE p.auth_user_id=auth.uid() AND p.is_active AND s.archived_at IS NULL AND s.status<>'suspended' LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.sc_supplier_org(_supplier uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT organization_id FROM public.supplier_directory WHERE id=_supplier
$$;

CREATE POLICY "spu self or org" ON public.supplier_portal_users FOR SELECT TO authenticated
USING (auth_user_id=auth.uid() OR public.sc_can_access_org(public.sc_supplier_org(supplier_id)));

-- invitations
CREATE TABLE IF NOT EXISTS public.supplier_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.supplier_directory(id) ON DELETE CASCADE,
  email text NOT NULL, auth_user_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','revoked','failed')),
  invited_by uuid, expires_at timestamptz,
  accepted_at timestamptz, revoked_at timestamptz,
  delivery_mode text NOT NULL DEFAULT 'email' CHECK (delivery_mode IN ('email','link')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supplier_invitations TO authenticated;
GRANT ALL ON public.supplier_invitations TO service_role;
ALTER TABLE public.supplier_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv org read" ON public.supplier_invitations FOR SELECT TO authenticated
USING (public.sc_can_access_org(public.sc_supplier_org(supplier_id)));

-- technology profile
CREATE TABLE IF NOT EXISTS public.supplier_technology_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL UNIQUE REFERENCES public.supplier_directory(id) ON DELETE CASCADE,
  employees_count integer CHECK (employees_count>=0), locations_count integer CHECK (locations_count>=0),
  windows_endpoints_count integer CHECK (windows_endpoints_count>=0), macos_endpoints_count integer CHECK (macos_endpoints_count>=0),
  linux_endpoints_count integer CHECK (linux_endpoints_count>=0), physical_servers_count integer CHECK (physical_servers_count>=0),
  virtual_machines_count integer CHECK (virtual_machines_count>=0), mobile_devices_count integer CHECK (mobile_devices_count>=0),
  remote_users_count integer CHECK (remote_users_count>=0), cloud_workloads_count integer CHECK (cloud_workloads_count>=0),
  handles_sensitive_data boolean, accesses_customer_systems boolean,
  it_management_model text CHECK (it_management_model IN ('internal','system_integrator','msp','hybrid')),
  it_provider_name text, has_edr_xdr boolean, edr_xdr_product text, has_mdm_uem boolean, mdm_uem_product text,
  has_managed_firewall boolean, has_mfa boolean, has_central_patch_management boolean, has_email_security boolean,
  has_managed_backup boolean, restore_tests_performed boolean, has_siem_log_management boolean, has_soc_mdr boolean,
  has_vulnerability_management boolean, has_external_exposure_monitoring boolean, has_dark_web_monitoring boolean,
  has_infrastructure_monitoring boolean, supplier_notes text,
  completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.supplier_technology_profiles TO authenticated;
GRANT ALL ON public.supplier_technology_profiles TO service_role;
ALTER TABLE public.supplier_technology_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stp read" ON public.supplier_technology_profiles FOR SELECT TO authenticated
USING (supplier_id=public.sc_my_supplier_id() OR public.sc_can_access_org(public.sc_supplier_org(supplier_id)));
CREATE POLICY "stp insert" ON public.supplier_technology_profiles FOR INSERT TO authenticated
WITH CHECK (supplier_id=public.sc_my_supplier_id() OR public.sc_can_access_org(public.sc_supplier_org(supplier_id)));
CREATE POLICY "stp update" ON public.supplier_technology_profiles FOR UPDATE TO authenticated
USING (supplier_id=public.sc_my_supplier_id() OR public.sc_can_access_org(public.sc_supplier_org(supplier_id)));

-- questions
CREATE TABLE IF NOT EXISTS public.supply_chain_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, category_code text NOT NULL, category_label text NOT NULL,
  question_text text NOT NULL, help_text text, weight numeric NOT NULL DEFAULT 1,
  is_critical boolean NOT NULL DEFAULT false, order_index integer NOT NULL, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supply_chain_questions TO authenticated;
GRANT ALL ON public.supply_chain_questions TO service_role;
ALTER TABLE public.supply_chain_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "q read" ON public.supply_chain_questions FOR SELECT TO authenticated USING (true);

INSERT INTO public.supply_chain_questions(code,category_code,category_label,question_text,weight,is_critical,order_index) VALUES
('SC01','A','Governance e persone','Esiste un responsabile identificato per la sicurezza informatica?',1,false,1),
('SC02','A','Governance e persone','Le policy di sicurezza vengono riesaminate almeno annualmente?',1,false,2),
('SC03','A','Governance e persone','Il personale riceve formazione periodica su phishing e sicurezza?',1,false,3),
('SC04','A','Governance e persone','Esiste un referente e un processo per notificare tempestivamente gli incidenti al cliente?',2,true,4),
('SC05','B','Identità e accessi','L''MFA è obbligatoria per accessi remoti, cloud e account privilegiati?',2,true,5),
('SC06','B','Identità e accessi','Gli utenti usano account personali e non condivisi?',1,false,6),
('SC07','B','Identità e accessi','I privilegi amministrativi sono limitati e riesaminati periodicamente?',2,true,7),
('SC08','B','Identità e accessi','Gli account vengono disabilitati rapidamente quando una persona cambia ruolo o lascia l''azienda?',1,false,8),
('SC09','C','Endpoint e mobile','Endpoint e server sono inventariati e associati a un responsabile?',1,false,9),
('SC10','C','Endpoint e mobile','Endpoint e server sono protetti da EDR/XDR gestito centralmente?',2,true,10),
('SC11','C','Endpoint e mobile','Patch e aggiornamenti di sicurezza sono distribuiti e verificati con un processo centralizzato?',2,true,11),
('SC12','C','Endpoint e mobile','I dispositivi mobili aziendali sono gestiti tramite MDM/UEM?',1,false,12),
('SC13','D','Infrastruttura e dati','Firewall e regole di rete sono gestiti e riesaminati periodicamente?',2,true,13),
('SC14','D','Infrastruttura e dati','I backup sono protetti, separati dall''ambiente primario e cifrati?',2,true,14),
('SC15','D','Infrastruttura e dati','Il ripristino dei backup viene testato almeno annualmente?',2,true,15),
('SC16','D','Infrastruttura e dati','I dati sensibili sono cifrati in transito e, quando necessario, a riposo?',1,false,16),
('SC17','E','Monitoraggio e resilienza','I log dei sistemi critici sono centralizzati e monitorati?',1,false,17),
('SC18','E','Monitoraggio e resilienza','Vengono eseguite scansioni di vulnerabilità almeno trimestrali?',1,false,18),
('SC19','E','Monitoraggio e resilienza','Esiste un piano di risposta agli incidenti testato o esercitato?',2,true,19),
('SC20','E','Monitoraggio e resilienza','Esiste un piano di continuità/ripristino con responsabilità e tempi concordati?',2,true,20)
ON CONFLICT (code) DO UPDATE SET question_text=EXCLUDED.question_text, weight=EXCLUDED.weight, is_critical=EXCLUDED.is_critical, order_index=EXCLUDED.order_index, category_label=EXCLUDED.category_label;

-- assessments
CREATE TABLE IF NOT EXISTS public.supplier_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.supplier_directory(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','submitted','expired','reopened')),
  due_at timestamptz, progress_percent integer NOT NULL DEFAULT 0,
  score integer CHECK (score BETWEEN 0 AND 100), risk_band text,
  started_at timestamptz, submitted_at timestamptz, reopened_at timestamptz, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sa_open ON public.supplier_assessments(supplier_id) WHERE status IN ('not_started','in_progress','reopened');
GRANT SELECT, INSERT, UPDATE ON public.supplier_assessments TO authenticated;
GRANT ALL ON public.supplier_assessments TO service_role;
ALTER TABLE public.supplier_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa read" ON public.supplier_assessments FOR SELECT TO authenticated
USING (supplier_id=public.sc_my_supplier_id() OR public.sc_can_access_org(public.sc_supplier_org(supplier_id)));
CREATE POLICY "sa org insert" ON public.supplier_assessments FOR INSERT TO authenticated
WITH CHECK (public.sc_can_access_org(public.sc_supplier_org(supplier_id)) AND score IS NULL);
CREATE POLICY "sa org update" ON public.supplier_assessments FOR UPDATE TO authenticated
USING (public.sc_can_access_org(public.sc_supplier_org(supplier_id)));

-- answers
CREATE TABLE IF NOT EXISTS public.supplier_assessment_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.supplier_assessments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.supply_chain_questions(id),
  answer text NOT NULL CHECK (answer IN ('yes','partial','no','na')),
  notes text, answered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, question_id)
);
GRANT SELECT, INSERT, UPDATE ON public.supplier_assessment_answers TO authenticated;
GRANT ALL ON public.supplier_assessment_answers TO service_role;
ALTER TABLE public.supplier_assessment_answers ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.sc_assessment_supplier(_a uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT supplier_id FROM public.supplier_assessments WHERE id=_a $$;
CREATE OR REPLACE FUNCTION public.sc_assessment_editable_by_me(_a uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.supplier_assessments a WHERE a.id=_a AND a.supplier_id=public.sc_my_supplier_id() AND a.status IN ('not_started','in_progress','reopened'))
$$;
CREATE POLICY "saa read" ON public.supplier_assessment_answers FOR SELECT TO authenticated
USING (public.sc_assessment_supplier(assessment_id)=public.sc_my_supplier_id() OR public.sc_can_access_org(public.sc_supplier_org(public.sc_assessment_supplier(assessment_id))));
CREATE POLICY "saa supplier insert" ON public.supplier_assessment_answers FOR INSERT TO authenticated
WITH CHECK (public.sc_assessment_editable_by_me(assessment_id));
CREATE POLICY "saa supplier update" ON public.supplier_assessment_answers FOR UPDATE TO authenticated
USING (public.sc_assessment_editable_by_me(assessment_id));

-- recommendations
CREATE TABLE IF NOT EXISTS public.supply_chain_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.supplier_directory(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES public.supplier_assessments(id) ON DELETE CASCADE,
  rule_code text NOT NULL, gap_title text NOT NULL, neutral_action text NOT NULL,
  service_code text, service_name text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  commercial_status text NOT NULL DEFAULT 'new' CHECK (commercial_status IN ('new','review','contacted','not_relevant')),
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, rule_code)
);
GRANT SELECT, UPDATE ON public.supply_chain_recommendations TO authenticated;
GRANT ALL ON public.supply_chain_recommendations TO service_role;
ALTER TABLE public.supply_chain_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec sales" ON public.supply_chain_recommendations FOR SELECT TO authenticated
USING (public.can_manage_all_organizations(auth.uid()));
CREATE POLICY "rec sales update" ON public.supply_chain_recommendations FOR UPDATE TO authenticated
USING (public.can_manage_all_organizations(auth.uid()));
-- neutral view for customers (no commercial fields)
CREATE OR REPLACE FUNCTION public.sc_supplier_gaps(_supplier uuid)
RETURNS TABLE(rule_code text, gap_title text, neutral_action text, priority text, rationale text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.rule_code, r.gap_title, r.neutral_action, r.priority, r.rationale
  FROM public.supply_chain_recommendations r
  JOIN public.supplier_assessments a ON a.id=r.assessment_id
  WHERE r.supplier_id=_supplier AND public.sc_can_access_org(public.sc_supplier_org(_supplier))
    AND a.id=(SELECT id FROM public.supplier_assessments WHERE supplier_id=_supplier AND status='submitted' ORDER BY submitted_at DESC LIMIT 1)
  ORDER BY CASE r.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
$$;
CREATE OR REPLACE FUNCTION public.sc_org_gaps(_org uuid)
RETURNS TABLE(supplier_id uuid, rule_code text, gap_title text, neutral_action text, priority text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.supplier_id, r.rule_code, r.gap_title, r.neutral_action, r.priority
  FROM public.supply_chain_recommendations r JOIN public.supplier_directory s ON s.id=r.supplier_id
  WHERE s.organization_id=_org AND s.archived_at IS NULL AND public.sc_can_access_org(_org)
$$;

-- audit
CREATE TABLE IF NOT EXISTS public.supply_chain_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid, supplier_id uuid, actor_user_id uuid,
  actor_kind text NOT NULL DEFAULT 'customer' CHECK (actor_kind IN ('customer','supplier','system')),
  action text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.supply_chain_audit_log TO authenticated;
GRANT ALL ON public.supply_chain_audit_log TO service_role;
ALTER TABLE public.supply_chain_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit org read" ON public.supply_chain_audit_log FOR SELECT TO authenticated
USING (public.sc_can_access_org(organization_id));
CREATE POLICY "audit insert" ON public.supply_chain_audit_log FOR INSERT TO authenticated
WITH CHECK (actor_user_id=auth.uid() AND (public.sc_can_access_org(organization_id) OR (supplier_id=public.sc_my_supplier_id() AND actor_kind='supplier')));

-- triggers updated_at
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['supplier_portal_users','supplier_invitations','supplier_technology_profiles','supply_chain_questions','supplier_assessments','supplier_assessment_answers','supply_chain_recommendations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s; CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- portal context (safe fields only)
CREATE OR REPLACE FUNCTION public.sc_portal_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'supplier_id', s.id, 'supplier_name', s.supplier_name, 'organization_name', o.name,
    'assessment_due_at', s.assessment_due_at, 'must_change_password', p.must_change_password,
    'status', s.status, 'is_active', p.is_active)
  INTO r
  FROM public.supplier_portal_users p
  JOIN public.supplier_directory s ON s.id=p.supplier_id
  LEFT JOIN public.organizations o ON o.id=s.organization_id
  WHERE p.auth_user_id=auth.uid() AND p.is_active AND s.archived_at IS NULL
  LIMIT 1;
  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.sc_portal_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.sc_activate_supplier_account()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sup uuid;
BEGIN
  UPDATE public.supplier_portal_users SET must_change_password=false, activated_at=COALESCE(activated_at,now()), last_login_at=now()
  WHERE auth_user_id=auth.uid() AND is_active RETURNING supplier_id INTO v_sup;
  IF v_sup IS NULL THEN RAISE EXCEPTION 'not_a_supplier'; END IF;
  UPDATE public.supplier_invitations SET status='accepted', accepted_at=now() WHERE supplier_id=v_sup AND auth_user_id=auth.uid() AND status='pending';
  UPDATE public.supplier_directory SET status='active', portal_enabled=true WHERE id=v_sup AND status IN ('draft','invited');
  INSERT INTO public.supply_chain_audit_log(organization_id,supplier_id,actor_user_id,actor_kind,action)
  VALUES (public.sc_supplier_org(v_sup), v_sup, auth.uid(), 'supplier', 'account_activated');
  RETURN jsonb_build_object('ok',true);
END $$;
GRANT EXECUTE ON FUNCTION public.sc_activate_supplier_account() TO authenticated;

-- supplier starts assessment
CREATE OR REPLACE FUNCTION public.sc_start_assessment()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sup uuid := public.sc_my_supplier_id(); v_id uuid;
BEGIN
  IF v_sup IS NULL THEN RAISE EXCEPTION 'not_a_supplier'; END IF;
  SELECT id INTO v_id FROM public.supplier_assessments WHERE supplier_id=v_sup AND status IN ('not_started','in_progress','reopened') LIMIT 1;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.supplier_assessments WHERE supplier_id=v_sup ORDER BY created_at DESC LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    INSERT INTO public.supplier_assessments(supplier_id,status,started_at,due_at)
    SELECT v_sup,'in_progress',now(),assessment_due_at FROM public.supplier_directory WHERE id=v_sup RETURNING id INTO v_id;
  ELSE
    UPDATE public.supplier_assessments SET status=CASE WHEN status='not_started' THEN 'in_progress' ELSE status END, started_at=COALESCE(started_at,now()) WHERE id=v_id;
  END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.sc_start_assessment() TO authenticated;

-- progress helper
CREATE OR REPLACE FUNCTION public.sc_update_progress(_a uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v int;
BEGIN
  IF NOT public.sc_assessment_editable_by_me(_a) THEN RETURN NULL; END IF;
  SELECT round(100.0*count(a.id)/NULLIF((SELECT count(*) FROM public.supply_chain_questions WHERE is_active),0))::int INTO v
  FROM public.supplier_assessment_answers a WHERE a.assessment_id=_a;
  UPDATE public.supplier_assessments SET progress_percent=COALESCE(v,0) WHERE id=_a;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.sc_update_progress(uuid) TO authenticated;

-- scoring + recommendations (internal)
CREATE OR REPLACE FUNCTION public.sc_compute_assessment(_a uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sup uuid; v_score int; v_band text; p record; ans jsonb; v_crit_gaps int; v_endpoints int;
BEGIN
  SELECT supplier_id INTO v_sup FROM public.supplier_assessments WHERE id=_a;
  SELECT round(100.0 * sum(CASE x.answer WHEN 'yes' THEN 100 WHEN 'partial' THEN 50 ELSE 0 END * q.weight)
               / NULLIF(sum(100*q.weight),0))::int INTO v_score
  FROM public.supplier_assessment_answers x JOIN public.supply_chain_questions q ON q.id=x.question_id
  WHERE x.assessment_id=_a AND x.answer<>'na';
  v_score := COALESCE(v_score,0);
  v_band := CASE WHEN v_score>=80 THEN 'good' WHEN v_score>=60 THEN 'to_strengthen' WHEN v_score>=40 THEN 'significant' ELSE 'critical' END;
  UPDATE public.supplier_assessments SET score=v_score, risk_band=v_band, progress_percent=100 WHERE id=_a;

  SELECT jsonb_object_agg(q.code, x.answer) INTO ans FROM public.supplier_assessment_answers x JOIN public.supply_chain_questions q ON q.id=x.question_id WHERE x.assessment_id=_a;
  ans := COALESCE(ans,'{}'::jsonb);
  SELECT count(*) INTO v_crit_gaps FROM public.supplier_assessment_answers x JOIN public.supply_chain_questions q ON q.id=x.question_id WHERE x.assessment_id=_a AND q.is_critical AND x.answer='no';
  SELECT * INTO p FROM public.supplier_technology_profiles WHERE supplier_id=v_sup;
  v_endpoints := COALESCE(p.windows_endpoints_count,0)+COALESCE(p.macos_endpoints_count,0)+COALESCE(p.linux_endpoints_count,0)+COALESCE(p.physical_servers_count,0);

  DELETE FROM public.supply_chain_recommendations WHERE assessment_id=_a;
  INSERT INTO public.supply_chain_recommendations(supplier_id,assessment_id,rule_code,gap_title,neutral_action,service_code,service_name,priority,rationale)
  SELECT v_sup,_a,r.code,r.gap,r.act,r.svc,r.svc,r.prio,r.why FROM (VALUES
    ('EDR', (v_endpoints>0 AND (p.has_edr_xdr IS FALSE OR ans->>'SC10'='no')), 'Endpoint senza protezione gestita','Introdurre protezione endpoint gestita centralmente','HiEndpoint','high','Endpoint o server presenti senza EDR/XDR gestito'),
    ('MDM', (COALESCE(p.mobile_devices_count,0)>0 AND (p.has_mdm_uem IS FALSE OR ans->>'SC12'='no')), 'Dispositivi mobili non gestiti','Adottare una gestione centralizzata dei dispositivi mobili','HiMobile','medium','Dispositivi mobili aziendali senza MDM/UEM'),
    ('PATCH', (p.has_central_patch_management IS FALSE OR ans->>'SC11' IN ('no','partial')), 'Patch management non centralizzato','Centralizzare la distribuzione delle patch e verificarne la copertura','HiPatch','high','Processo di aggiornamento assente o parziale'),
    ('LOG', (p.has_siem_log_management IS FALSE OR ans->>'SC17'='no'), 'Log non centralizzati','Centralizzare raccolta e correlazione dei log','HiLog','medium','Log dei sistemi critici non centralizzati'),
    ('SOC', (p.has_soc_mdr IS FALSE AND v_crit_gaps>0), 'Assenza di monitoraggio continuativo','Attivare un servizio di rilevamento e risposta continuativo','HiDetect','high','Nessun SOC/MDR in presenza di gap critici'),
    ('FW', (p.has_managed_firewall IS FALSE OR ans->>'SC13'='no'), 'Firewall non gestito o non revisionato','Migliorare governance e gestione del firewall','HiFirewall','medium','Regole di rete non gestite o non riesaminate'),
    ('MAIL', (p.has_email_security IS FALSE), 'Posta elettronica non protetta','Rafforzare la protezione della posta e l''anti-phishing','HiMail','medium','Nessuna soluzione di sicurezza email'),
    ('EXPO', (p.has_vulnerability_management IS FALSE OR p.has_external_exposure_monitoring IS FALSE OR ans->>'SC18'='no'), 'Superficie esterna non monitorata','Introdurre scansioni periodiche e monitoraggio della superficie esterna','SurfaceScan360','medium','Scansioni di vulnerabilità o monitoraggio esposizione assenti'),
    ('DARK', (p.has_dark_web_monitoring IS FALSE), 'Credenziali esposte non monitorate','Introdurre il monitoraggio dell''esposizione delle identità','DarkRisk360','low','Nessun monitoraggio di credenziali compromesse'),
    ('TRACK', (p.has_infrastructure_monitoring IS FALSE), 'Infrastruttura non monitorata','Introdurre un monitoraggio proattivo degli asset','HiTrack','low','Nessun monitoraggio dell''infrastruttura')
  ) AS r(code,cond,gap,act,svc,prio,why) WHERE r.cond IS TRUE;
  RETURN jsonb_build_object('score',v_score,'risk_band',v_band);
END $$;
REVOKE ALL ON FUNCTION public.sc_compute_assessment(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sc_submit_assessment(_a uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sup uuid; v_missing int; v_res jsonb;
BEGIN
  IF NOT public.sc_assessment_editable_by_me(_a) THEN RAISE EXCEPTION 'assessment_not_editable'; END IF;
  SELECT supplier_id INTO v_sup FROM public.supplier_assessments WHERE id=_a;
  SELECT count(*) INTO v_missing FROM public.supply_chain_questions q WHERE q.is_active
    AND NOT EXISTS (SELECT 1 FROM public.supplier_assessment_answers x WHERE x.assessment_id=_a AND x.question_id=q.id);
  IF v_missing>0 THEN RAISE EXCEPTION 'missing_answers:%', v_missing; END IF;
  v_res := public.sc_compute_assessment(_a);
  UPDATE public.supplier_assessments SET status='submitted', submitted_at=now() WHERE id=_a;
  UPDATE public.supplier_technology_profiles SET completed_at=COALESCE(completed_at,now()) WHERE supplier_id=v_sup;
  UPDATE public.supplier_directory SET last_assessment_at=now() WHERE id=v_sup;
  INSERT INTO public.supply_chain_audit_log(organization_id,supplier_id,actor_user_id,actor_kind,action,metadata)
  VALUES (public.sc_supplier_org(v_sup), v_sup, auth.uid(), 'supplier', 'assessment_submitted', v_res);
  RETURN v_res;
END $$;
GRANT EXECUTE ON FUNCTION public.sc_submit_assessment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sc_reopen_assessment(_supplier uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_ver int;
BEGIN
  IF NOT public.sc_can_access_org(public.sc_supplier_org(_supplier)) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id INTO v_id FROM public.supplier_assessments WHERE supplier_id=_supplier AND status IN ('not_started','in_progress','reopened') LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT id, version INTO v_id, v_ver FROM public.supplier_assessments WHERE supplier_id=_supplier ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.supplier_assessments(supplier_id,status,created_by,due_at) SELECT _supplier,'not_started',auth.uid(),assessment_due_at FROM public.supplier_directory WHERE id=_supplier RETURNING id INTO v_id;
  ELSE
    UPDATE public.supplier_assessments SET status='reopened', reopened_at=now() WHERE id=v_id;
  END IF;
  INSERT INTO public.supply_chain_audit_log(organization_id,supplier_id,actor_user_id,actor_kind,action)
  VALUES (public.sc_supplier_org(_supplier), _supplier, auth.uid(), 'customer', 'assessment_reopened');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.sc_reopen_assessment(uuid) TO authenticated;

-- demo seed
DO $$
DECLARE v_org uuid; s record; v_sup uuid; v_a uuid; q record; i int;
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE lower(name)=lower('Innovatech Group S.r.l.') LIMIT 1;
  IF v_org IS NULL THEN RAISE NOTICE 'Innovatech non trovata: seed saltato'; RETURN; END IF;
  FOR s IN SELECT * FROM (VALUES
    ('Alfa Cloud Italia S.r.l.','Cloud hosting','critical','active','Marco Rossi','m.rossi@alfacloud.example.com','submitted',ARRAY['yes','yes','yes','yes','yes','yes','yes','yes','yes','yes','yes','partial','yes','yes','yes','yes','yes','yes','yes','yes'],true),
    ('NetSecure MSP S.p.A.','Managed service provider','high','active','Giulia Bianchi','g.bianchi@netsecure.example.com','submitted',ARRAY['yes','partial','yes','yes','yes','yes','partial','yes','yes','partial','partial','no','yes','yes','partial','yes','no','partial','yes','partial'],true),
    ('Beta Payroll Services S.r.l.','Elaborazione paghe','critical','active','Luca Verdi','l.verdi@betapayroll.example.com','submitted',ARRAY['no','no','partial','no','no','partial','no','partial','partial','no','no','no','partial','partial','no','partial','no','no','no','no'],false),
    ('MobileFleet S.r.l.','Gestione flotta mobile','medium','active','Sara Neri','s.neri@mobilefleet.example.com','in_progress',ARRAY['yes','partial','no','yes','yes','yes','partial','no']::text[],false),
    ('Logistica Nord S.c.a.r.l.','Logistica e trasporti','medium','invited','Paolo Gallo','p.gallo@logisticanord.example.com','not_started',ARRAY[]::text[],false),
    ('Studio Conti Privacy & DPO','Consulenza privacy','low','draft','Anna Conti','a.conti@studioconti.example.com',NULL,ARRAY[]::text[],false)
  ) AS t(name,cat,crit,st,contact,email,astatus,answers,good) LOOP
    SELECT id INTO v_sup FROM public.supplier_directory WHERE organization_id=v_org AND lower(supplier_name)=lower(s.name) AND archived_at IS NULL;
    IF v_sup IS NOT NULL THEN CONTINUE; END IF;
    INSERT INTO public.supplier_directory(organization_id,supplier_name,service_type,category,criticality,status,contact_name,email,notes,is_demo,portal_enabled,assessment_due_at,country)
    VALUES (v_org,s.name,s.cat,s.cat,s.crit,s.st,s.contact,s.email,'Fornitore demo',true,s.st='active',now()+interval '30 days','IT') RETURNING id INTO v_sup;
    IF s.astatus IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.supplier_technology_profiles(supplier_id,employees_count,locations_count,windows_endpoints_count,macos_endpoints_count,linux_endpoints_count,physical_servers_count,virtual_machines_count,mobile_devices_count,remote_users_count,cloud_workloads_count,handles_sensitive_data,accesses_customer_systems,it_management_model,has_edr_xdr,has_mdm_uem,has_managed_firewall,has_mfa,has_central_patch_management,has_email_security,has_managed_backup,restore_tests_performed,has_siem_log_management,has_soc_mdr,has_vulnerability_management,has_external_exposure_monitoring,has_dark_web_monitoring,has_infrastructure_monitoring)
    VALUES (v_sup, CASE WHEN s.good THEN 120 ELSE 35 END, 2, 60, 10, 8, 6, 30, 25, 20, 12, true, true, CASE WHEN s.good THEN 'hybrid' ELSE 'internal' END,
      s.good, s.good AND s.name LIKE 'Alfa%', s.good, true, s.good, s.good, true, s.good, s.name LIKE 'Alfa%', s.name LIKE 'Alfa%', s.good, s.name LIKE 'Alfa%', false, s.name LIKE 'Alfa%');
    INSERT INTO public.supplier_assessments(supplier_id,status,started_at,due_at) VALUES (v_sup, CASE WHEN s.astatus='submitted' THEN 'in_progress' ELSE s.astatus END, CASE WHEN s.astatus<>'not_started' THEN now()-interval '5 days' END, now()+interval '30 days') RETURNING id INTO v_a;
    i := 1;
    FOR q IN SELECT id FROM public.supply_chain_questions WHERE is_active ORDER BY order_index LOOP
      EXIT WHEN i > coalesce(array_length(s.answers,1),0);
      INSERT INTO public.supplier_assessment_answers(assessment_id,question_id,answer) VALUES (v_a,q.id,s.answers[i]);
      i := i+1;
    END LOOP;
    IF s.astatus='submitted' THEN
      PERFORM public.sc_compute_assessment(v_a);
      UPDATE public.supplier_assessments SET status='submitted', submitted_at=now()-interval '2 days' WHERE id=v_a;
      UPDATE public.supplier_directory SET last_assessment_at=now()-interval '2 days' WHERE id=v_sup;
    ELSE
      UPDATE public.supplier_assessments SET progress_percent=round(100.0*coalesce(array_length(s.answers,1),0)/20) WHERE id=v_a;
    END IF;
  END LOOP;
END $$;
