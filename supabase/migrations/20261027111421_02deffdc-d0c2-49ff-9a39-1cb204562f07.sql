CREATE OR REPLACE FUNCTION public.sc_my_recommendations()
RETURNS TABLE(rule_code text, gap_title text, neutral_action text, priority text, rationale text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.rule_code, r.gap_title, r.neutral_action, r.priority, r.rationale
  FROM public.supply_chain_recommendations r
  WHERE r.supplier_id = public.sc_my_supplier_id()
    AND r.assessment_id = (SELECT id FROM public.supplier_assessments
      WHERE supplier_id = public.sc_my_supplier_id() AND status='submitted'
      ORDER BY submitted_at DESC LIMIT 1)
  ORDER BY CASE r.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
$$;
REVOKE ALL ON FUNCTION public.sc_my_recommendations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sc_my_recommendations() TO authenticated;