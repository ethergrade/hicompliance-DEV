-- SurfaceScan360 weekly automation hardening
-- Recreate weekly cron job in idempotent way and invoke edge function with service-role auth.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN ('surface-scan-weekly', 'surface-scan-weekly-monday');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'surface-scan-weekly-monday',
  '0 4 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/surface-scan-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ) || CASE
      WHEN COALESCE(current_setting('app.settings.surface_scan_cron_internal_secret', true), '') <> ''
      THEN jsonb_build_object('x-surface-internal-secret', current_setting('app.settings.surface_scan_cron_internal_secret', true))
      ELSE '{}'::jsonb
    END,
    body := jsonb_build_object(
      'triggered_by', 'cron_weekly',
      'at', now()::text
    )
  ) AS request_id;
  $$
);
