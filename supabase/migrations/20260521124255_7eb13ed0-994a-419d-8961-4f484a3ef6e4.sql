CREATE TABLE IF NOT EXISTS public.surface_scan_ai_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  scan_job_id uuid,
  title text,
  payload jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ssai_org ON public.surface_scan_ai_reports(organization_id, created_at DESC);
ALTER TABLE public.surface_scan_ai_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view AI reports"
ON public.surface_scan_ai_reports FOR SELECT TO authenticated
USING (
  organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid())
  OR public.can_manage_all_organizations(auth.uid())
);

CREATE POLICY "Service role can insert AI reports"
ON public.surface_scan_ai_reports FOR INSERT TO authenticated
WITH CHECK (
  organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid())
  OR public.can_manage_all_organizations(auth.uid())
);