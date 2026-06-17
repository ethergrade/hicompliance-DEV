-- NUCLEI-SCAN360 LAB: allow long-running Nmap/Nikto/Nuclei queue stages
-- to complete when triggered by pg_cron. The previous 30s pg_net timeout was
-- too short for service_light scans and CIDR targets.
DO $do$
DECLARE
  v_secret text;
BEGIN
  SELECT (regexp_match(command, $rx$'x-nuclei-scan360-internal-secret', '([^']+)'$rx$))[1]
  INTO v_secret
  FROM cron.job
  WHERE jobname = 'nuclei-scan360-process-ready-every-minute';

  IF COALESCE(v_secret, '') = '' THEN
    v_secret := current_setting('app.settings.nuclei_scan360_internal_secret', true);
  END IF;

  IF COALESCE(v_secret, '') = '' THEN
    RAISE EXCEPTION 'nuclei_scan360_internal_secret unavailable';
  END IF;

  PERFORM cron.unschedule('nuclei-scan360-process-ready-every-minute');

  PERFORM cron.schedule(
    'nuclei-scan360-process-ready-every-minute',
    '* * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/nuclei-scan360',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-surface-cron', '1',
          'x-nuclei-scan360-internal-secret', %L
        ),
        body := jsonb_build_object(
          'action', 'process_queue',
          'limit', 1,
          'trigger', 'cron',
          'at', now()::text
        ),
        timeout_milliseconds := 240000
      ) AS request_id;
    $cmd$, v_secret)
  );
END $do$;
