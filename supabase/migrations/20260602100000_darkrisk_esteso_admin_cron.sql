-- DARKRISK_ESTESO: admin cron columns + weekly cron schedule
-- Adds cron management to esteso profiles and schedules a weekly run.

ALTER TABLE public.darkrisk_esteso_profiles
  ADD COLUMN IF NOT EXISTS cron_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_cron_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_cron_run_at timestamptz;

COMMENT ON COLUMN public.darkrisk_esteso_profiles.cron_enabled IS 'Whether to auto-run DARKRISK_ESTESO weekly via cron';
COMMENT ON COLUMN public.darkrisk_esteso_profiles.last_cron_run_at IS 'Timestamp of last cron-triggered run';
COMMENT ON COLUMN public.darkrisk_esteso_profiles.next_cron_run_at IS 'Estimated next cron run (informational)';

-- Ensure pg_cron and pg_net are available
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any previous esteso cron jobs idempotently
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN ('darkrisk-esteso-admin-weekly-cron', 'darkrisk-esteso-weekly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule weekly Monday 2am UTC (= 3-4am Europe/Rome depending on DST)
SELECT cron.schedule(
  'darkrisk-esteso-admin-weekly-cron',
  '0 2 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/darkrisk-esteso-admin-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ) || CASE
      WHEN COALESCE(current_setting('app.settings.darkrisk_esteso_internal_secret', true), '') <> ''
      THEN jsonb_build_object('x-darkrisk-esteso-cron-secret', current_setting('app.settings.darkrisk_esteso_internal_secret', true))
      WHEN COALESCE(current_setting('app.settings.darkrisk360_internal_secret', true), '') <> ''
      THEN jsonb_build_object('x-darkrisk-esteso-cron-secret', current_setting('app.settings.darkrisk360_internal_secret', true))
      ELSE '{}'::jsonb
    END,
    body := jsonb_build_object(
      'trigger', 'weekly_cron',
      'at', now()::text
    )
  ) AS request_id;
  $$
);
