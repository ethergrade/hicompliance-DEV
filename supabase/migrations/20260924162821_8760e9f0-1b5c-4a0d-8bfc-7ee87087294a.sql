DO $$ DECLARE f text; BEGIN
FOREACH f IN ARRAY ARRAY['sc_can_access_org(uuid)','sc_my_supplier_id()','sc_supplier_org(uuid)','sc_assessment_supplier(uuid)','sc_assessment_editable_by_me(uuid)','sc_supplier_gaps(uuid)','sc_org_gaps(uuid)','sc_portal_context()','sc_activate_supplier_account()','sc_start_assessment()','sc_update_progress(uuid)','sc_submit_assessment(uuid)','sc_reopen_assessment(uuid)','sc_compute_assessment(uuid)'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
END LOOP;
REVOKE ALL ON FUNCTION public.sc_compute_assessment(uuid) FROM authenticated;
END $$;