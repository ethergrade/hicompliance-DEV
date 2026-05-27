-- Reschedule CVE enrichment drain + KEV sync in modo idempotente.
-- Requisiti: funzioni edge cve-enrichment e cisa-kev-sync con verify_jwt=false.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cve-enrichment-drain-30s';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cisa-kev-sync-daily';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cve-enrichment-drain-30s',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/cve-enrichment',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"trigger":"cron","max_per_run":1,"drain_all":false}'::jsonb
  );
  SELECT pg_sleep(30);
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/cve-enrichment',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"trigger":"cron-half","max_per_run":1,"drain_all":false}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'cisa-kev-sync-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/cisa-kev-sync',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"trigger":"cron-daily"}'::jsonb
  );
  $$
);

