-- SurfaceScan360 → DarkRisk360 — Fix 7: auto-sync asset scoperti
-- Trigger AFTER INSERT su surface_assets: propaga domini/sottodomini/IP in
-- darkrisk_assets se il cliente ha dark_risk360_enabled = true.
-- Include backfill 8B per asset storici già presenti in surface_assets.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Funzione trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_surface_asset_to_darkrisk()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  dr_enabled    boolean;
  dr_asset_type public.darkrisk_asset_type;
BEGIN
  SELECT dark_risk360_enabled
    INTO dr_enabled
    FROM public.organizations
   WHERE id = NEW.customer_id;

  IF dr_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  dr_asset_type := CASE NEW.asset_type
    WHEN 'domain'    THEN 'domain'
    WHEN 'subdomain' THEN 'subdomain'
    WHEN 'ip'        THEN 'ip'
    WHEN 'ipv4'      THEN 'ip'
    WHEN 'ipv6'      THEN 'ip'
    WHEN 'mx_host'   THEN 'mx'
    WHEN 'ns_host'   THEN 'ns'
    WHEN 'url'       THEN 'url'
    ELSE NULL
  END::public.darkrisk_asset_type;

  IF dr_asset_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.asset_value IS NULL OR trim(NEW.asset_value) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.darkrisk_assets (
    organization_id,
    tenant_id,
    asset_type,
    value,
    normalized_value,
    source,
    scope_status,
    first_seen_at,
    last_seen_at,
    metadata
  ) VALUES (
    NEW.customer_id,
    NEW.tenant_id,
    dr_asset_type,
    NEW.asset_value,
    lower(trim(NEW.asset_value)),
    'surfacescan360',
    'approved',
    now(),
    now(),
    jsonb_build_object(
      'surface_asset_id', NEW.id,
      'scan_job_id',      NEW.scan_job_id,
      'confidence',       NEW.confidence,
      'source_scanner',   NEW.source
    )
  )
  ON CONFLICT (organization_id, asset_type, normalized_value)
  DO UPDATE SET
    last_seen_at = now(),
    metadata = darkrisk_assets.metadata || jsonb_build_object(
      'last_scan_job_id',  NEW.scan_job_id,
      'last_surface_asset', NEW.id
    );

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger AFTER INSERT su surface_assets
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_surface_asset_to_darkrisk ON public.surface_assets;
CREATE TRIGGER trg_surface_asset_to_darkrisk
  AFTER INSERT ON public.surface_assets
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_surface_asset_to_darkrisk();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8B. Backfill retroattivo: surface_assets esistenti → darkrisk_assets
--     Solo per clienti con dark_risk360_enabled = true.
--     Idempotente via ON CONFLICT.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.darkrisk_assets (
  organization_id,
  tenant_id,
  asset_type,
  value,
  normalized_value,
  source,
  scope_status,
  first_seen_at,
  last_seen_at,
  metadata
)
SELECT DISTINCT ON (
    coalesce(sa.customer_id, sa.organization_id),
    CASE sa.asset_type
      WHEN 'ipv4'    THEN 'ip'
      WHEN 'ipv6'    THEN 'ip'
      WHEN 'mx_host' THEN 'mx'
      WHEN 'ns_host' THEN 'ns'
      ELSE sa.asset_type
    END,
    lower(trim(sa.asset_value))
  )
  coalesce(sa.customer_id, sa.organization_id)                          AS organization_id,
  sa.tenant_id,
  CASE sa.asset_type
    WHEN 'ipv4'    THEN 'ip'
    WHEN 'ipv6'    THEN 'ip'
    WHEN 'mx_host' THEN 'mx'
    WHEN 'ns_host' THEN 'ns'
    ELSE sa.asset_type
  END::public.darkrisk_asset_type                                       AS asset_type,
  sa.asset_value                                                        AS value,
  lower(trim(sa.asset_value))                                           AS normalized_value,
  'surfacescan360'::public.darkrisk_source                              AS source,
  'approved'                                                            AS scope_status,
  sa.first_seen                                                         AS first_seen_at,
  sa.last_seen                                                          AS last_seen_at,
  jsonb_build_object(
    'backfilled',     true,
    'scan_job_id',    sa.scan_job_id,
    'surface_asset_id', sa.id
  )                                                                     AS metadata
FROM public.surface_assets sa
JOIN public.organizations o
  ON o.id = coalesce(sa.customer_id, sa.organization_id)
WHERE o.dark_risk360_enabled = true
  AND sa.asset_type IN ('domain','subdomain','ip','ipv4','ipv6','mx_host','ns_host','url')
  AND sa.asset_value IS NOT NULL
  AND trim(sa.asset_value) != ''
ON CONFLICT (organization_id, asset_type, normalized_value)
DO UPDATE SET
  last_seen_at = EXCLUDED.last_seen_at,
  metadata     = darkrisk_assets.metadata || jsonb_build_object('backfilled', true);
