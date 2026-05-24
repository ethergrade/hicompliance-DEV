-- SurfaceScan360 exposure poller unification:
-- - disable legacy poll schedules
-- - keep only ptools-poll-scans as scheduled worker

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
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('trigger', 'cron', 'at', now()::text)
  ) AS request_id;
  $$
);
