-- darkrisk360_notification_configs: config email alert e weekly summary per org

CREATE TABLE IF NOT EXISTS public.darkrisk360_notification_configs (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_emails            text[]      NOT NULL DEFAULT '{}',
  alert_on_new_findings       boolean     NOT NULL DEFAULT true,
  alert_severity_threshold    text        NOT NULL DEFAULT 'high'
    CHECK (alert_severity_threshold IN ('critical', 'high', 'medium', 'low', 'info')),
  min_new_findings_to_alert   integer     NOT NULL DEFAULT 1,
  weekly_summary_enabled      boolean     NOT NULL DEFAULT true,
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

CREATE POLICY "notification configs read"
  ON public.darkrisk360_notification_configs
  FOR SELECT
  USING (
    can_manage_all_organizations(auth.uid())
    OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
  );

CREATE POLICY "notification configs write"
  ON public.darkrisk360_notification_configs
  FOR ALL
  USING (
    can_manage_all_organizations(auth.uid())
    OR organization_id IN (SELECT u.organization_id FROM public.users u WHERE u.auth_user_id = auth.uid())
  );

CREATE POLICY "service role bypass for notification configs"
  ON public.darkrisk360_notification_configs
  FOR ALL
  USING (auth.role() = 'service_role');

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
