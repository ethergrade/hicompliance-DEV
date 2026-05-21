
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rimuovi job preesistente con lo stesso nome se esiste
DO $$
BEGIN
  PERFORM cron.unschedule('surface-scan-weekly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'surface-scan-weekly',
  '0 4 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/surface-scan-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbGx2eXpoZWZjcWZ0ZXNhaG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MzUyMTUsImV4cCI6MjA2NzExMTIxNX0.wzDcO5RkVKQXSMBftT8oGvv4SRG7wjeJr87DQwWh4zc"}'::jsonb,
    body := jsonb_build_object('triggered_by','cron','time', now())
  ) AS request_id;
  $$
);
