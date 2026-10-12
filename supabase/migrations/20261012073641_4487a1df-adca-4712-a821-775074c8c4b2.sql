ALTER TABLE public.incident_documents
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS content_json jsonb,
  ADD COLUMN IF NOT EXISTS is_generated boolean NOT NULL DEFAULT false;
ALTER TABLE public.incident_documents ALTER COLUMN file_path DROP NOT NULL, ALTER COLUMN file_size DROP NOT NULL, ALTER COLUMN file_type DROP NOT NULL, ALTER COLUMN uploaded_by DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS incident_documents_source_uniq ON public.incident_documents(source_type, source_id) WHERE source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.doc_can_access_org(_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT can_manage_all_organizations(auth.uid()) OR EXISTS (SELECT 1 FROM users u WHERE u.auth_user_id = auth.uid() AND u.organization_id = _org)
$$;

CREATE OR REPLACE FUNCTION public.doc_register_generated(_org uuid, _source text, _source_id uuid, _name text, _cat document_category, _desc text, _content jsonb, _tags text[], _at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _prefix text; _n int;
BEGIN
  IF _org IS NULL OR NOT EXISTS (SELECT 1 FROM organizations WHERE id=_org) THEN RETURN; END IF;
  _prefix := CASE _cat WHEN 'Piano Generale' THEN 'PG' WHEN 'NIS2' THEN 'NIS' WHEN 'Tecnico' THEN 'TEC' WHEN 'ISO & Audit' THEN 'ISO' WHEN 'Audit' THEN 'AUD' ELSE 'VAR' END;
  SELECT count(*)+1 INTO _n FROM incident_documents WHERE organization_id=_org AND category=_cat;
  INSERT INTO incident_documents(name, category, organization_id, document_code, revision, revision_date, status, description, tags, confidentiality, source_type, source_id, content_json, is_generated, uploaded_at, file_type)
  VALUES (_name, _cat, _org, _prefix||'-'||lpad(_n::text,3,'0'), 1, coalesce(_at, now()), 'Approvato', _desc, _tags, 'Riservato', _source, _source_id, _content, true, coalesce(_at, now()), 'application/pdf')
  ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public.doc_register_generated(uuid,text,uuid,text,document_category,text,jsonb,text[],timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_doc_from_surface() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM doc_register_generated(NEW.organization_id, 'surfacescan', NEW.id, coalesce(NEW.title,'Report SurfaceScan360')||' – '||to_char(NEW.created_at,'DD/MM/YYYY'), 'Tecnico', 'Report SurfaceScan360 generato automaticamente', NEW.payload, ARRAY['SurfaceScan360','report'], NEW.created_at);
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.trg_doc_from_darkrisk() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ext boolean := NEW.tier::text = 'extended';
BEGIN
  PERFORM doc_register_generated(NEW.organization_id, CASE WHEN _ext THEN 'darkrisk_extended' ELSE 'darkrisk' END, NEW.id,
    coalesce(NEW.title, CASE WHEN _ext THEN 'Report DarkRisk360 Esteso' ELSE 'Report DarkRisk360' END)||' – '||to_char(coalesce(NEW.generated_at,NEW.created_at),'DD/MM/YYYY'),
    'Tecnico', CASE WHEN _ext THEN 'Report DarkRisk360 Esteso generato automaticamente' ELSE 'Report DarkRisk360 generato automaticamente' END,
    jsonb_build_object('report', NEW.report_json, 'pdf_storage_path', NEW.pdf_storage_path), ARRAY['DarkRisk360', CASE WHEN _ext THEN 'esteso' ELSE 'standard' END], coalesce(NEW.generated_at,NEW.created_at));
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.trg_doc_from_assessment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cls text; _d date := coalesce(NEW.snapshot_date, NEW.created_at::date);
BEGIN
  SELECT to_jsonb(o)->>'nis2_classification' INTO _cls FROM organizations o WHERE o.id = NEW.organization_id;
  PERFORM doc_register_generated(NEW.organization_id, 'compliance', NEW.id, 'Report sintetico conformità NIS2 – '||coalesce(NEW.label, NEW.snapshot_year::text)||' – '||to_char(_d,'DD/MM/YYYY'),
    'NIS2', 'Sintesi di conformità e aderenza NIS2 dallo snapshot assessment',
    jsonb_build_object('snapshot_date', _d, 'label', NEW.label, 'year', NEW.snapshot_year, 'overall_score', NEW.overall_score, 'total_answered', NEW.total_answered, 'total_questions', NEW.total_questions, 'category_scores', NEW.category_scores, 'nis2_classification', _cls),
    ARRAY['NIS2','assessment','conformità'], _d::timestamptz);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS doc_from_surface ON public.surface_scan_ai_reports;
CREATE TRIGGER doc_from_surface AFTER INSERT ON public.surface_scan_ai_reports FOR EACH ROW EXECUTE FUNCTION public.trg_doc_from_surface();
DROP TRIGGER IF EXISTS doc_from_darkrisk ON public.darkrisk_report_snapshots;
CREATE TRIGGER doc_from_darkrisk AFTER INSERT ON public.darkrisk_report_snapshots FOR EACH ROW EXECUTE FUNCTION public.trg_doc_from_darkrisk();
DROP TRIGGER IF EXISTS doc_from_assessment ON public.assessment_snapshots;
CREATE TRIGGER doc_from_assessment AFTER INSERT ON public.assessment_snapshots FOR EACH ROW EXECUTE FUNCTION public.trg_doc_from_assessment();

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM surface_scan_ai_reports ORDER BY created_at LOOP
    PERFORM doc_register_generated(r.organization_id,'surfacescan',r.id,coalesce(r.title,'Report SurfaceScan360')||' – '||to_char(r.created_at,'DD/MM/YYYY'),'Tecnico','Report SurfaceScan360 generato automaticamente',r.payload,ARRAY['SurfaceScan360','report'],r.created_at);
  END LOOP;
  FOR r IN SELECT * FROM darkrisk_report_snapshots ORDER BY created_at LOOP
    PERFORM doc_register_generated(r.organization_id, CASE WHEN r.tier::text='extended' THEN 'darkrisk_extended' ELSE 'darkrisk' END, r.id,
      coalesce(r.title,'Report DarkRisk360')||' – '||to_char(coalesce(r.generated_at,r.created_at),'DD/MM/YYYY'),'Tecnico','Report DarkRisk360 generato automaticamente',
      jsonb_build_object('report', r.report_json, 'pdf_storage_path', r.pdf_storage_path), ARRAY['DarkRisk360', CASE WHEN r.tier::text='extended' THEN 'esteso' ELSE 'standard' END], coalesce(r.generated_at,r.created_at));
  END LOOP;
  FOR r IN SELECT s.*, to_jsonb(o)->>'nis2_classification' cls FROM assessment_snapshots s LEFT JOIN organizations o ON o.id=s.organization_id ORDER BY s.created_at LOOP
    PERFORM doc_register_generated(r.organization_id,'compliance',r.id,'Report sintetico conformità NIS2 – '||coalesce(r.label,r.snapshot_year::text)||' – '||to_char(coalesce(r.snapshot_date,r.created_at::date),'DD/MM/YYYY'),'NIS2','Sintesi di conformità e aderenza NIS2 dallo snapshot assessment',
      jsonb_build_object('snapshot_date', coalesce(r.snapshot_date,r.created_at::date),'label',r.label,'year',r.snapshot_year,'overall_score',r.overall_score,'total_answered',r.total_answered,'total_questions',r.total_questions,'category_scores',r.category_scores,'nis2_classification',r.cls),
      ARRAY['NIS2','assessment','conformità'], coalesce(r.snapshot_date,r.created_at::date)::timestamptz);
  END LOOP;
END $$;

CREATE POLICY "Org documents read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='incident-documents' AND (storage.foldername(name))[1]='org' AND public.doc_can_access_org(((storage.foldername(name))[2])::uuid));
CREATE POLICY "Org documents insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='incident-documents' AND (storage.foldername(name))[1]='org' AND public.doc_can_access_org(((storage.foldername(name))[2])::uuid));
CREATE POLICY "Org documents delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='incident-documents' AND (storage.foldername(name))[1]='org' AND public.doc_can_access_org(((storage.foldername(name))[2])::uuid));