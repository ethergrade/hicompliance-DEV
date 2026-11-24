CREATE TABLE public.remediation_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.remediation_tasks(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  title text NOT NULL,
  owner text,
  due_date date,
  cost numeric,
  done boolean NOT NULL DEFAULT false,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remediation_plan_items TO authenticated;
GRANT ALL ON public.remediation_plan_items TO service_role;
ALTER TABLE public.remediation_plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sales and super admin manage plan items" ON public.remediation_plan_items FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'sales'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'sales'));
CREATE INDEX remediation_plan_items_org_idx ON public.remediation_plan_items (organization_id, task_id);
CREATE TRIGGER update_remediation_plan_items_updated_at BEFORE UPDATE ON public.remediation_plan_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.remediation_plan_items; EXCEPTION WHEN duplicate_object THEN NULL; END $$;