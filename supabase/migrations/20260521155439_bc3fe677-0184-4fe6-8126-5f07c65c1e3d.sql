-- Abilita le estensioni richieste per i cron job
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rimuovi eventuali job preesistenti con lo stesso nome (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('cve-enrichment-drain-30s');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  PERFORM cron.unschedule('cisa-kev-sync-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- Drain della coda cve_enrichment ogni 30 secondi (due esecuzioni al minuto)
SELECT cron.schedule(
  'cve-enrichment-drain-30s',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/cve-enrichment',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbGx2eXpoZWZjcWZ0ZXNhaG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MzUyMTUsImV4cCI6MjA2NzExMTIxNX0.wzDcO5RkVKQXSMBftT8oGvv4SRG7wjeJr87DQwWh4zc"}'::jsonb,
    body := concat('{"trigger": "cron", "tick": "', now(), '"}')::jsonb
  );
  SELECT pg_sleep(30);
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/cve-enrichment',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbGx2eXpoZWZjcWZ0ZXNhaG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MzUyMTUsImV4cCI6MjA2NzExMTIxNX0.wzDcO5RkVKQXSMBftT8oGvv4SRG7wjeJr87DQwWh4zc"}'::jsonb,
    body := concat('{"trigger": "cron-half", "tick": "', now(), '"}')::jsonb
  );
  $$
);

-- Sync CISA KEV una volta al giorno alle 03:00 UTC
SELECT cron.schedule(
  'cisa-kev-sync-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/cisa-kev-sync',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbGx2eXpoZWZjcWZ0ZXNhaG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MzUyMTUsImV4cCI6MjA2NzExMTIxNX0.wzDcO5RkVKQXSMBftT8oGvv4SRG7wjeJr87DQwWh4zc"}'::jsonb,
    body := concat('{"trigger": "cron-daily", "tick": "', now(), '"}')::jsonb
  );
  $$
);