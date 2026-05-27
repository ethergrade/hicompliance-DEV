-- SurfaceScan360 exposure poller cron hardening
-- Recreate 2-min poll schedule with internal secret header support.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN (
    'pentest-tools-poll-every-2min',
    'ptools-poll-scans-every-2min',
    'surface-ptools-poll-scans-every-2min'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'surface-ptools-poll-scans-every-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/ptools-poll-scans',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-surface-cron', '1'
    ) || CASE
      WHEN COALESCE(current_setting('app.settings.service_role_key', true), '') <> ''
      THEN jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'apikey', current_setting('app.settings.service_role_key', true)
      )
      ELSE '{}'::jsonb
    END || CASE
      WHEN COALESCE(current_setting('app.settings.surface_scan_cron_internal_secret', true), '') <> ''
      THEN jsonb_build_object(
        'x-surface-internal-secret', current_setting('app.settings.surface_scan_cron_internal_secret', true)
      )
      ELSE '{}'::jsonb
    END,
    body := jsonb_build_object('trigger', 'cron', 'at', now()::text)
  ) AS request_id;
  $$
);
