CREATE OR REPLACE FUNCTION public.sync_commercial_to_task_budget() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.proposed_value IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.proposed_value IS DISTINCT FROM OLD.proposed_value) THEN
    UPDATE public.remediation_tasks SET budget = NEW.proposed_value
    WHERE id = NEW.task_id AND budget IS DISTINCT FROM NEW.proposed_value;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_task_budget_to_commercial() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.budget IS DISTINCT FROM OLD.budget THEN
    UPDATE public.remediation_commercial SET proposed_value = NEW.budget
    WHERE task_id = NEW.id AND proposed_value IS DISTINCT FROM NEW.budget;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_commercial_to_task_budget ON public.remediation_commercial;
CREATE TRIGGER trg_commercial_to_task_budget AFTER INSERT OR UPDATE OF proposed_value ON public.remediation_commercial
FOR EACH ROW EXECUTE FUNCTION public.sync_commercial_to_task_budget();

DROP TRIGGER IF EXISTS trg_task_budget_to_commercial ON public.remediation_tasks;
CREATE TRIGGER trg_task_budget_to_commercial AFTER UPDATE OF budget ON public.remediation_tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_task_budget_to_commercial();