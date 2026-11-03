CREATE OR REPLACE FUNCTION public.trg_doc_from_irp() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  PERFORM doc_register_generated(NEW.organization_id, 'irp', NEW.id,
    'Incident Response Plan v'||NEW.version||' – '||to_char(NEW.created_at,'DD/MM/YYYY'),
    'Piano Generale', 'Incident Response Plan generato dal modulo IRP',
    jsonb_build_object('version', NEW.version, 'irp_document_id', NEW.id), ARRAY['IRP','report'], NEW.created_at);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_doc_from_irp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS doc_from_irp ON public.irp_documents;
CREATE TRIGGER doc_from_irp AFTER INSERT ON public.irp_documents FOR EACH ROW EXECUTE FUNCTION public.trg_doc_from_irp();
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM irp_documents WHERE organization_id IS NOT NULL ORDER BY created_at LOOP
    PERFORM doc_register_generated(r.organization_id,'irp',r.id,'Incident Response Plan v'||r.version||' – '||to_char(r.created_at,'DD/MM/YYYY'),'Piano Generale','Incident Response Plan generato dal modulo IRP',jsonb_build_object('version',r.version,'irp_document_id',r.id),ARRAY['IRP','report'],r.created_at);
  END LOOP;
END $$;