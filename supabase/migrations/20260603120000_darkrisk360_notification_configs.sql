-- darkrisk360_notification_configs: config email alert e weekly summary per org

CREATE TABLE IF NOT EXISTS public.darkrisk360_notification_configs (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Lista destinatari alert (es. ['soc@azienda.it', 'ciso@azienda.it'])
  recipient_emails            text[]      NOT NULL DEFAULT '{}',

  -- Alert immediati quando vengono trovati nuovi finding
  alert_on_new_findings       boolean     NOT NULL DEFAULT true,
  alert_severity_threshold    text        NOT NULL DEFAULT 'high'
    CHECK (alert_severity_threshold IN ('critical', 'high', 'medium', 'low', 'info')),
  min_new_findings_to_alert   integer     NOT NULL DEFAULT 1,

  -- Email settimanale con sintesi
  weekly_summary_enabled      boolean     NOT NULL DEFAULT true,

  -- Rate-limiting: non inviare più di 1 alert/ora per org
  last_alert_sent_at          timestamptz,
  last_summary_sent_at        timestamptz,

  created_by                  uuid,
  updated_by                  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id)
);

-- RLS
ALTER TABLE public.darkrisk360_notification_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read notification configs"
  ON public.darkrisk360_notification_configs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "admin can upsert notification configs"
  ON public.darkrisk360_notification_configs
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "service role bypass for notification configs"
  ON public.darkrisk360_notification_configs
  FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger per updated_at automatico
CREATE OR REPLACE FUNCTION public.set_darkrisk360_notification_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_darkrisk360_notification_configs_updated_at
  BEFORE UPDATE ON public.darkrisk360_notification_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_darkrisk360_notification_configs_updated_at();
