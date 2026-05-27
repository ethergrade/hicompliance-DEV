-- DarkRisk360 MD08 security governance hardening
-- Additive migration: tighten access to sensitive evidence, introduce audited reveal metadata,
-- and provide retention execution primitive.

ALTER TABLE public.darkrisk_entitlements
  ADD COLUMN IF NOT EXISTS raw_evidence_retention_days integer NOT NULL DEFAULT 90;

ALTER TABLE public.darkrisk_entitlements
  DROP CONSTRAINT IF EXISTS darkrisk_entitlements_raw_evidence_retention_days_check;

ALTER TABLE public.darkrisk_entitlements
  ADD CONSTRAINT darkrisk_entitlements_raw_evidence_retention_days_check
  CHECK (raw_evidence_retention_days >= 7 AND raw_evidence_retention_days <= 3650);

ALTER TABLE public.darkrisk_report_snapshots
  ADD COLUMN IF NOT EXISTS json_storage_path text;

UPDATE public.darkrisk_report_snapshots
SET json_storage_path = organization_id::text || '/' || id::text || '.json'
WHERE json_storage_path IS NULL;

ALTER TABLE public.darkrisk_raw_evidence_refs
  ADD COLUMN IF NOT EXISTS reveal_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_revealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_revealed_by uuid,
  ADD COLUMN IF NOT EXISTS last_reveal_reason text;

CREATE OR REPLACE FUNCTION public.darkrisk_is_analyst(_user_id uuid, _organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    public.can_manage_all_organizations(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.auth_user_id = _user_id
        AND u.organization_id = _organization_id
        AND u.user_type = 'admin'
    )
  );
END;
$$;

DROP POLICY IF EXISTS "DarkRisk evidence read" ON public.darkrisk_evidence;
CREATE POLICY "DarkRisk evidence read" ON public.darkrisk_evidence
FOR SELECT TO authenticated
USING (
  public.can_manage_all_organizations(auth.uid())
  OR public.darkrisk_is_analyst(auth.uid(), organization_id)
  OR (
    organization_id IN (
      SELECT u.organization_id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
    )
    AND visibility = 'customer'::public.darkrisk_visibility
    AND COALESCE(contains_sensitive_data, false) = false
  )
);

DROP POLICY IF EXISTS "DarkRisk raw refs read" ON public.darkrisk_raw_evidence_refs;
CREATE POLICY "DarkRisk raw refs read" ON public.darkrisk_raw_evidence_refs
FOR SELECT TO authenticated
USING (
  public.can_manage_all_organizations(auth.uid())
  OR public.darkrisk_is_analyst(auth.uid(), organization_id)
);

CREATE OR REPLACE FUNCTION public.darkrisk_apply_retention(_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org record;
  v_deleted_count integer := 0;
  v_orgs_processed integer := 0;
  v_org_deleted integer := 0;
  v_limit_ts timestamptz;
BEGIN
  FOR v_org IN
    SELECT e.organization_id,
           COALESCE(e.raw_evidence_retention_days, 90) AS raw_evidence_retention_days
    FROM public.darkrisk_entitlements e
    WHERE e.enabled = true
      AND (_org_id IS NULL OR e.organization_id = _org_id)
  LOOP
    v_orgs_processed := v_orgs_processed + 1;
    v_limit_ts := now() - make_interval(days => v_org.raw_evidence_retention_days);

    WITH purge_rows AS (
      SELECT r.id, r.evidence_id
      FROM public.darkrisk_raw_evidence_refs r
      WHERE r.organization_id = v_org.organization_id
        AND (
          (r.retention_until IS NOT NULL AND r.retention_until <= now())
          OR (r.retention_until IS NULL AND r.created_at <= v_limit_ts)
        )
    ), evidence_reset AS (
      UPDATE public.darkrisk_evidence e
      SET raw_evidence_ref = NULL
      WHERE e.id IN (SELECT p.evidence_id FROM purge_rows p)
      RETURNING e.id
    )
    DELETE FROM public.darkrisk_raw_evidence_refs r
    USING purge_rows p
    WHERE r.id = p.id;

    GET DIAGNOSTICS v_org_deleted = ROW_COUNT;
    v_deleted_count := v_deleted_count + COALESCE(v_org_deleted, 0);

    IF v_org_deleted > 0 THEN
      INSERT INTO public.darkrisk_audit_log (
        organization_id,
        tenant_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        reason,
        metadata
      ) VALUES (
        v_org.organization_id,
        v_org.organization_id,
        NULL,
        'darkrisk_retention_cleanup',
        'darkrisk_raw_evidence_refs',
        NULL,
        'automatic_retention_cleanup',
        jsonb_build_object(
          'deleted_raw_refs', v_org_deleted,
          'raw_evidence_retention_days', v_org.raw_evidence_retention_days,
          'executed_at', now()
        )
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'organizations_processed', v_orgs_processed,
    'deleted_raw_evidence_refs', v_deleted_count,
    'executed_at', now()
  );
END;
$$;
