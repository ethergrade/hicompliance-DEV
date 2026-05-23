-- SurfaceScan360 scope guard hardening metadata
-- Stores scope filtering counters on scan jobs for UI/report consistency.

ALTER TABLE IF EXISTS public.surface_scan_jobs
  ADD COLUMN IF NOT EXISTS scope_guard jsonb NOT NULL DEFAULT '{"in_scope":0,"excluded_by_scope":0,"excluded_shared_noise":0}'::jsonb;

UPDATE public.surface_scan_jobs
SET scope_guard = COALESCE(scope_guard, '{"in_scope":0,"excluded_by_scope":0,"excluded_shared_noise":0}'::jsonb)
WHERE scope_guard IS NULL;
