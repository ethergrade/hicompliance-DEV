ALTER TABLE public.remediation_tasks
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS remediation_tasks_org_source_ref_uniq
  ON public.remediation_tasks (organization_id, source, source_ref)
  WHERE source_ref IS NOT NULL;