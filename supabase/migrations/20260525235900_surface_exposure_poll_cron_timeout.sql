-- SurfaceScan360 exposure poller: increase pg_net timeout for long-running polls.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'surface-ptools-poll-scans-every-2min';
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
    body := jsonb_build_object('trigger', 'cron', 'at', now()::text),
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);
