CREATE TABLE public.remediation_commercial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL UNIQUE REFERENCES public.remediation_tasks(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'proposto',
  proposed_value numeric,
  currency text NOT NULL DEFAULT 'EUR',
  notes text,
  proposed_at date,
  closed_at date,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remediation_commercial TO authenticated;
GRANT ALL ON public.remediation_commercial TO service_role;
ALTER TABLE public.remediation_commercial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sales and super admin manage commercial data" ON public.remediation_commercial
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales'))
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales'));
CREATE TRIGGER trg_remediation_commercial_updated BEFORE UPDATE ON public.remediation_commercial
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_remediation_commercial_org ON public.remediation_commercial(organization_id);