-- RPC: enqueue tutti i CVE da surface_findings non ancora arricchiti in cve_intel_cache.
-- Usato dal button "Arricchisci CVE storici" in ConnectSecureConfigPanel e dal pg_cron drain.

CREATE OR REPLACE FUNCTION public.enqueue_all_surface_cves()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inserted integer := 0;
BEGIN
  -- Re-queue failed CVEs (delete first to avoid UNIQUE(cve_id,status) conflict)
  DELETE FROM cve_enrichment_queue
  WHERE status = 'failed'
    AND NOT EXISTS (
      SELECT 1 FROM cve_intel_cache c
      WHERE c.cve_id = cve_enrichment_queue.cve_id AND c.fetch_status = 'ok'
    )
    AND NOT EXISTS (
      SELECT 1 FROM cve_enrichment_queue q2
      WHERE q2.cve_id = cve_enrichment_queue.cve_id AND q2.status = 'queued'
    );

  -- Insert new CVEs from surface_findings not yet in cache and not already queued
  INSERT INTO cve_enrichment_queue (cve_id, status, queued_at)
  SELECT DISTINCT cve_val, 'queued', now()
  FROM surface_findings f, unnest(f.cve) AS cve_val
  WHERE f.cve IS NOT NULL
    AND array_length(f.cve, 1) > 0
    AND cve_val <> ''
    AND NOT EXISTS (
      SELECT 1 FROM cve_intel_cache c WHERE c.cve_id = cve_val AND c.fetch_status = 'ok'
    )
  ON CONFLICT (cve_id, status) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_all_surface_cves() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_all_surface_cves() TO service_role;

-- pg_cron drain: ogni 5 minuti, drena 50 CVE dalla coda finché la coda non si svuota.
-- Questo cron è temporaneo per il backfill storico; a regime il cron weekly porta avanti.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'cve-drain-5min';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cve-drain-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/cve-enrichment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"action":"drain","max_per_run":50}'::jsonb
  ) AS request_id;
  $$
);
