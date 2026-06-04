-- darkrisk360_scan_triggers: meccanismo one-shot per triggerare scan da SQL/pg_net
-- Inserire un record con requested_at = NOW() per avviare scan manuale senza API key esterna

CREATE TABLE IF NOT EXISTS public.darkrisk360_scan_triggers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger_type    text        NOT NULL DEFAULT 'manual',  -- 'manual' | 'coverage_retry' | 'admin_force'
  include_surface_sync boolean NOT NULL DEFAULT true,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  picked_up_at    timestamptz,
  scan_run_id     uuid,
  status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','picked_up','failed')),
  UNIQUE (organization_id, status) -- max 1 pending per org
);

-- RLS: solo service_role può leggere/scrivere
ALTER TABLE public.darkrisk360_scan_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only for scan triggers"
  ON public.darkrisk360_scan_triggers FOR ALL
  USING (auth.role() = 'service_role');

-- Index per il polling
CREATE INDEX IF NOT EXISTS idx_darkrisk360_scan_triggers_pending
  ON public.darkrisk360_scan_triggers (status, requested_at)
  WHERE status = 'pending';

-- pg_cron ogni 5 minuti: raccoglie trigger pendenti e avvia admin-cron
-- Usa gli stessi settings del cron settimanale
SELECT cron.schedule(
  'darkrisk360-manual-trigger-poll',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/darkrisk-esteso-admin-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ) || CASE
        WHEN COALESCE(current_setting('app.settings.darkrisk360_internal_secret', true), '') <> ''
        THEN jsonb_build_object('x-darkrisk-esteso-cron-secret', current_setting('app.settings.darkrisk360_internal_secret', true))
        WHEN COALESCE(current_setting('app.settings.darkrisk_esteso_internal_secret', true), '') <> ''
        THEN jsonb_build_object('x-darkrisk-esteso-cron-secret', current_setting('app.settings.darkrisk_esteso_internal_secret', true))
        ELSE '{}'::jsonb
      END,
      body := jsonb_build_object('trigger', 'manual_poll', 'at', now()::text)
    ) AS request_id
    WHERE EXISTS (
      SELECT 1 FROM public.darkrisk360_scan_triggers WHERE status = 'pending' LIMIT 1
    );
  $$
);

-- FIX CRITICO app.settings (da eseguire UNA VOLTA in Supabase Dashboard SQL Editor come superuser):
-- ALTER DATABASE postgres SET "app.settings.service_role_key" = '<JWT_SERVICE_ROLE>';
-- ALTER DATABASE postgres SET "app.settings.darkrisk360_internal_secret" = '<DARKRISK360_INTERNAL_SECRET>';
-- SELECT pg_reload_conf();
