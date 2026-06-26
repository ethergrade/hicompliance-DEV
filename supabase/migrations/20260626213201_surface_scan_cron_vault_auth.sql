-- Authenticate SurfaceScan cron-to-edge calls without storing secrets in the
-- repository or relying on unset app.settings values.

CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.secrets
    WHERE name = 'surface_scan_cron_internal_secret'
  ) THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'surface_scan_cron_internal_secret',
      'Internal authentication for SurfaceScan cron Edge calls'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.surface_scan_validate_internal_secret(candidate text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT
    length(coalesce(candidate, '')) >= 32
    AND EXISTS (
      SELECT 1
      FROM vault.decrypted_secrets
      WHERE name = 'surface_scan_cron_internal_secret'
        AND decrypted_secret = candidate
    );
$$;

REVOKE ALL ON FUNCTION public.surface_scan_validate_internal_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.surface_scan_validate_internal_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.surface_scan_validate_internal_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.surface_scan_validate_internal_secret(text) TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN (
    'connectsecure-result-poller',
    'surfacescan-subdomain-queue-dispatch',
    'surface-scan-weekly-monday'
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
      'x-surface-internal-secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'surface_scan_cron_internal_secret'
        LIMIT 1
      )
    ),
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
      'x-surface-internal-secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'surface_scan_cron_internal_secret'
        LIMIT 1
      )
    ),
    body := jsonb_build_object(
      'dispatch_only', true,
      'triggered_by', 'connectsecure_orchestrator',
      'at', now()::text
    )
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'surface-scan-weekly-monday',
  '0 0 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/surface-scan-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-surface-internal-secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'surface_scan_cron_internal_secret'
        LIMIT 1
      )
    ),
    body := jsonb_build_object(
      'triggered_by', 'cron_weekly',
      'at', now()::text
    )
  ) AS request_id;
  $$
);
