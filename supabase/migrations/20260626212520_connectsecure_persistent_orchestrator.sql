-- Persistent ConnectSecure orchestration and canonical SurfaceScan persistence.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Keep one canonical asset row per organization and asset identity. Existing
-- duplicates are folded into the most recently seen row before the constraint
-- is created.
CREATE TEMP TABLE _surface_asset_dedupe ON COMMIT DROP AS
SELECT
  id,
  first_value(id) OVER (
    PARTITION BY organization_id, asset_type, asset_value
    ORDER BY last_seen DESC NULLS LAST, first_seen DESC NULLS LAST, id DESC
  ) AS keeper_id
FROM public.surface_assets;

UPDATE public.surface_observations observation
SET asset_id = mapping.keeper_id
FROM _surface_asset_dedupe mapping
WHERE observation.asset_id = mapping.id
  AND mapping.id <> mapping.keeper_id;

WITH aggregate_seen AS (
  SELECT
    organization_id,
    asset_type,
    asset_value,
    min(first_seen) AS first_seen,
    max(last_seen) AS last_seen
  FROM public.surface_assets
  GROUP BY organization_id, asset_type, asset_value
)
UPDATE public.surface_assets keeper
SET
  first_seen = aggregate_seen.first_seen,
  last_seen = aggregate_seen.last_seen
FROM aggregate_seen
WHERE keeper.organization_id = aggregate_seen.organization_id
  AND keeper.asset_type = aggregate_seen.asset_type
  AND keeper.asset_value = aggregate_seen.asset_value
  AND keeper.id IN (
    SELECT keeper_id
    FROM _surface_asset_dedupe
  );

DELETE FROM public.surface_assets asset
USING _surface_asset_dedupe mapping
WHERE asset.id = mapping.id
  AND mapping.id <> mapping.keeper_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_surface_assets_org_type_value_unique
  ON public.surface_assets (organization_id, asset_type, asset_value);

-- The provider-specific legacy default must never leak into newly normalized
-- SurfaceScan rows.
ALTER TABLE public.surface_open_ports
  ALTER COLUMN source SET DEFAULT 'surface_scan_engine';

-- Collapse duplicate active ASM jobs before enforcing one active scan per
-- organization/target. The newest job remains eligible for polling.
CREATE TEMP TABLE _superseded_connectsecure_jobs ON COMMIT DROP AS
SELECT id
FROM (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id, normalized_target
      ORDER BY created_at DESC, id DESC
    ) AS position
  FROM public.surface_scan_jobs
  WHERE scan_type = 'connectsecure_asm'
    AND status IN ('queued', 'pending', 'running', 'polling')
) ranked
WHERE position > 1;

UPDATE public.surface_scan_module_results module_result
SET
  status = 'error',
  severity = 'info',
  completed_at = now(),
  error_message = 'superseded_by_newer_connectsecure_job',
  normalized = coalesce(module_result.normalized, '{}'::jsonb)
    || jsonb_build_object('status', 'superseded')
WHERE module_result.scan_job_id IN (
  SELECT id
  FROM _superseded_connectsecure_jobs
);

UPDATE public.surface_scan_jobs job
SET
  status = 'failed',
  completed_at = now(),
  error_message = 'superseded_by_newer_connectsecure_job',
  summary = coalesce(job.summary, '{}'::jsonb)
    || jsonb_build_object('status', 'superseded')
WHERE job.id IN (
  SELECT id
  FROM _superseded_connectsecure_jobs
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_surface_scan_jobs_connectsecure_active_unique
  ON public.surface_scan_jobs (organization_id, normalized_target)
  WHERE scan_type = 'connectsecure_asm'
    AND status IN ('queued', 'pending', 'running', 'polling');

CREATE INDEX IF NOT EXISTS idx_surface_scan_jobs_connectsecure_poll
  ON public.surface_scan_jobs (status, created_at)
  WHERE scan_type = 'connectsecure_asm'
    AND status IN ('queued', 'pending', 'running', 'polling');

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN (
    'connectsecure-result-poller',
    'surfacescan-subdomain-queue-dispatch'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'connectsecure-result-poller',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/connectsecure-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'apikey', current_setting('app.settings.service_role_key', true)
    ) || CASE
      WHEN COALESCE(current_setting('app.settings.surface_scan_cron_internal_secret', true), '') <> ''
      THEN jsonb_build_object(
        'x-surface-internal-secret',
        current_setting('app.settings.surface_scan_cron_internal_secret', true)
      )
      ELSE '{}'::jsonb
    END,
    body := jsonb_build_object(
      'action', 'poll_pending',
      'max_jobs', 50,
      'trigger', 'cron',
      'at', now()::text
    )
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'surfacescan-subdomain-queue-dispatch',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/surface-scan-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'apikey', current_setting('app.settings.service_role_key', true)
    ) || CASE
      WHEN COALESCE(current_setting('app.settings.surface_scan_cron_internal_secret', true), '') <> ''
      THEN jsonb_build_object(
        'x-surface-internal-secret',
        current_setting('app.settings.surface_scan_cron_internal_secret', true)
      )
      ELSE '{}'::jsonb
    END,
    body := jsonb_build_object(
      'dispatch_only', true,
      'triggered_by', 'connectsecure_orchestrator',
      'at', now()::text
    )
  ) AS request_id;
  $$
);
