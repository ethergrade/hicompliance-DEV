-- Keep each ConnectSecure poll invocation short enough for pg_net while
-- continuously draining the persistent SurfaceScan queue.

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'connectsecure-result-poller';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'connectsecure-result-poller',
  '* * * * *',
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
      'max_jobs', 5,
      'trigger', 'cron',
      'at', now()::text
    )
  ) AS request_id;
  $$
);
