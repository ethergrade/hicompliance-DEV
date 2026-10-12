REVOKE EXECUTE ON FUNCTION public.trg_doc_from_surface() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_doc_from_darkrisk() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_doc_from_assessment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.doc_register_generated(uuid,text,uuid,text,document_category,text,jsonb,text[],timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.doc_can_access_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doc_can_access_org(uuid) TO authenticated;