CREATE TABLE public.crm_sync_events (
  id bigserial PRIMARY KEY,
  organization_id uuid,
  vat_number text,
  task_id uuid,
  status text,
  budget numeric,
  origin text NOT NULL DEFAULT 'platform',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crm_sync_events TO authenticated;
GRANT ALL ON public.crm_sync_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.crm_sync_events_id_seq TO service_role;
ALTER TABLE public.crm_sync_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sales and super admin read crm events" ON public.crm_sync_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'sales'));
CREATE INDEX crm_sync_events_vat_idx ON public.crm_sync_events (vat_number, id);

CREATE OR REPLACE FUNCTION public.crm_log_event(_task uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.crm_sync_events (organization_id, vat_number, task_id, status, budget, origin)
  SELECT t.organization_id, p.vat_number, t.id, coalesce(c.status, 'proposto'), t.budget,
         CASE WHEN auth.uid() IS NULL THEN 'crm' ELSE 'platform' END
  FROM public.remediation_tasks t
  LEFT JOIN public.remediation_commercial c ON c.task_id = t.id
  LEFT JOIN public.organization_profiles p ON p.organization_id = t.organization_id
  WHERE t.id = _task;
$$;
REVOKE EXECUTE ON FUNCTION public.crm_log_event(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_crm_from_commercial() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.proposed_value IS DISTINCT FROM OLD.proposed_value THEN
    PERFORM public.crm_log_event(NEW.task_id);
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.trg_crm_from_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.budget IS DISTINCT FROM OLD.budget THEN PERFORM public.crm_log_event(NEW.id); END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_crm_from_commercial() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_crm_from_task() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_crm_commercial AFTER INSERT OR UPDATE ON public.remediation_commercial FOR EACH ROW EXECUTE FUNCTION public.trg_crm_from_commercial();
CREATE TRIGGER trg_crm_task_budget AFTER UPDATE OF budget ON public.remediation_tasks FOR EACH ROW EXECUTE FUNCTION public.trg_crm_from_task();