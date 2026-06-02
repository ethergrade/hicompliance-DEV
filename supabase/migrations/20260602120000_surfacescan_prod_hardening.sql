-- SurfaceScan360 production hardening
-- Adds recovery_attempt_count column, missing indexes, and alert org isolation.

-- 1. surface_scan_jobs: recovery_attempt_count replaces fragile error_message string check
ALTER TABLE public.surface_scan_jobs
  ADD COLUMN IF NOT EXISTS recovery_attempt_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.surface_scan_jobs.recovery_attempt_count
  IS 'Number of stale-recovery attempts; prevents infinite requeue loops';

-- 2. Indexes for fast stale job detection
CREATE INDEX IF NOT EXISTS idx_surface_scan_jobs_stale_pending
  ON public.surface_scan_jobs (organization_id, status, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_surface_scan_jobs_stale_running
  ON public.surface_scan_jobs (organization_id, status, started_at)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_surface_scan_jobs_queued_org
  ON public.surface_scan_jobs (organization_id, status, created_at ASC)
  WHERE status = 'queued';

-- 3. surface_scan_alerts: index for organization-scoped queries (fixes security gap)
CREATE INDEX IF NOT EXISTS idx_surface_scan_alerts_org
  ON public.surface_scan_alerts (organization_id);

CREATE INDEX IF NOT EXISTS idx_surface_scan_alerts_user_org
  ON public.surface_scan_alerts (user_id, organization_id);

-- 4. Index on external_scan_audit_log for faster org-level queries
CREATE INDEX IF NOT EXISTS idx_external_scan_audit_org_action
  ON public.external_scan_audit_log (organization_id, action, created_at DESC);

-- 5. Index on surface_scan_history for trend queries
CREATE INDEX IF NOT EXISTS idx_surface_scan_history_org_created
  ON public.surface_scan_history (organization_id, created_at DESC);

-- 6. Ensure RLS on surface_scan_alerts is correct for org isolation
-- (add policy if it doesn't already filter by organization_id)
DO $$
BEGIN
  -- Drop overly-permissive policy if it exists
  DROP POLICY IF EXISTS "Users can view their alerts" ON public.surface_scan_alerts;
  DROP POLICY IF EXISTS "surface_scan_alerts_select" ON public.surface_scan_alerts;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Re-create scoped SELECT policy
DROP POLICY IF EXISTS "surface_scan_alerts_org_select" ON public.surface_scan_alerts;
CREATE POLICY "surface_scan_alerts_org_select"
ON public.surface_scan_alerts
FOR SELECT
TO authenticated
USING (
  -- Super admins see all
  can_manage_all_organizations(auth.uid())
  OR
  -- Users see only their org's alerts
  organization_id IN (
    SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid()
  )
);
