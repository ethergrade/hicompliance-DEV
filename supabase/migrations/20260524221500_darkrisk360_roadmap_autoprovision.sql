-- DarkRisk360 MD09 rollout automation
-- Auto-provision entitlements for new organizations and keep enabled flag in sync.

CREATE INDEX IF NOT EXISTS idx_darkrisk_audit_org_action_created
  ON public.darkrisk_audit_log(organization_id, action, created_at DESC);

CREATE OR REPLACE FUNCTION public.darkrisk_sync_entitlement_from_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.darkrisk_entitlements (
    organization_id,
    tier,
    enabled,
    scan_frequency,
    max_intelx_results_per_selector,
    enable_phonebook,
    enable_raw_evidence,
    enable_ai_recommendations,
    retention_days,
    raw_evidence_retention_days
  )
  VALUES (
    NEW.id,
    'standard'::public.darkrisk_tier,
    COALESCE(NEW.dark_risk360_enabled, false),
    'manual',
    1000,
    false,
    false,
    true,
    365,
    90
  )
  ON CONFLICT (organization_id) DO UPDATE
  SET enabled = COALESCE(NEW.dark_risk360_enabled, false),
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_darkrisk_sync_entitlement_from_org ON public.organizations;
CREATE TRIGGER trg_darkrisk_sync_entitlement_from_org
AFTER INSERT OR UPDATE OF dark_risk360_enabled ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.darkrisk_sync_entitlement_from_org();

-- Backfill/sync for existing organizations.
INSERT INTO public.darkrisk_entitlements (
  organization_id,
  tier,
  enabled,
  scan_frequency,
  max_intelx_results_per_selector,
  enable_phonebook,
  enable_raw_evidence,
  enable_ai_recommendations,
  retention_days,
  raw_evidence_retention_days
)
SELECT
  o.id,
  'standard'::public.darkrisk_tier,
  COALESCE(o.dark_risk360_enabled, false),
  'manual',
  1000,
  false,
  false,
  true,
  365,
  90
FROM public.organizations o
ON CONFLICT (organization_id) DO UPDATE
SET enabled = EXCLUDED.enabled,
    updated_at = now();
