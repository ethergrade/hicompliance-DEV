-- 1) Mark currently stuck tasks/jobs as failed
UPDATE public.external_scan_tasks
SET status = 'failed',
    error_message = COALESCE(error_message, 'Sbloccato dal poller: task running > 1h senza completamento'),
    completed_at = now()
WHERE status IN ('running','starting')
  AND COALESCE(started_at, created_at) < now() - interval '1 hour';

UPDATE public.external_scan_jobs
SET status = 'failed',
    error_message = COALESCE(error_message, 'Sbloccato dal poller: job running > 1h senza completamento'),
    completed_at = now()
WHERE status = 'running'
  AND COALESCE(started_at, created_at) < now() - interval '1 hour';

-- 2) Schedule polling every 2 minutes via pg_cron + pg_net
DO $$
DECLARE
  v_url text := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/pentest-tools-poll';
  v_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  -- Rimuovi eventuale job precedente
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'pentest-tools-poll-every-2min';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'pentest-tools-poll-every-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/pentest-tools-poll',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);