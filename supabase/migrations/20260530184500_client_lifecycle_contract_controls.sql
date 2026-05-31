-- Client lifecycle controls:
-- 1) global pause for all services
-- 2) contract window per module
-- 3) robust organization deletion helper

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS services_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS services_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS services_pause_reason text,
  ADD COLUMN IF NOT EXISTS hicompliance_contract_start date,
  ADD COLUMN IF NOT EXISTS hicompliance_contract_years integer,
  ADD COLUMN IF NOT EXISTS surface_scan_contract_start date,
  ADD COLUMN IF NOT EXISTS surface_scan_contract_years integer,
  ADD COLUMN IF NOT EXISTS dark_risk_contract_start date,
  ADD COLUMN IF NOT EXISTS dark_risk_contract_years integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_contract_years_positive'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_contract_years_positive
      CHECK (
        (hicompliance_contract_years IS NULL OR hicompliance_contract_years > 0)
        AND (surface_scan_contract_years IS NULL OR surface_scan_contract_years > 0)
        AND (dark_risk_contract_years IS NULL OR dark_risk_contract_years > 0)
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_organization_robust(
  _organization_id uuid,
  _actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fk_row record;
  deleted_count bigint;
  touched jsonb := '[]'::jsonb;
BEGIN
  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  -- Freeze org services immediately to stop schedulers while delete runs.
  UPDATE public.organizations
  SET
    services_paused = true,
    services_paused_at = now(),
    services_pause_reason = 'deleted_by_admin',
    hicompliance_enabled = false,
    surface_scan360_enabled = false,
    dark_risk360_enabled = false,
    updated_at = now()
  WHERE id = _organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;

  -- Stop running/queued jobs before cleanup.
  UPDATE public.surface_scan_jobs
  SET
    status = 'failed',
    completed_at = now(),
    error_message = 'organization_deleted'
  WHERE organization_id = _organization_id
    AND status IN ('queued', 'pending', 'running');

  UPDATE public.external_scan_jobs
  SET
    status = 'cancelled',
    completed_at = now(),
    error_message = 'organization_deleted'
  WHERE organization_id = _organization_id
    AND status IN ('queued', 'running', 'partial');

  UPDATE public.darkrisk_scan_runs
  SET
    status = 'cancelled',
    completed_at = now(),
    error_message = 'organization_deleted',
    updated_at = now()
  WHERE organization_id = _organization_id
    AND status IN ('queued', 'running');

  DELETE FROM public.darkrisk_scan_locks
  WHERE organization_id = _organization_id;

  -- Delete child rows from all FK tables referencing organizations(id)
  -- for non-cascade relations and future schema additions.
  FOR fk_row IN
    SELECT DISTINCT
      ns.nspname AS schema_name,
      cls.relname AS table_name,
      att.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    JOIN pg_class refcls ON refcls.oid = con.confrelid
    JOIN pg_namespace refns ON refns.oid = refcls.relnamespace
    JOIN LATERAL unnest(con.conkey) AS fk(attnum) ON true
    JOIN pg_attribute att ON att.attrelid = cls.oid AND att.attnum = fk.attnum
    WHERE con.contype = 'f'
      AND refns.nspname = 'public'
      AND refcls.relname = 'organizations'
      AND ns.nspname = 'public'
      AND cls.relname <> 'organizations'
  LOOP
    EXECUTE format(
      'DELETE FROM %I.%I WHERE %I = $1',
      fk_row.schema_name,
      fk_row.table_name,
      fk_row.column_name
    ) USING _organization_id;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN
      touched := touched || jsonb_build_object(
        'table', format('%s.%s', fk_row.schema_name, fk_row.table_name),
        'deleted', deleted_count
      );
    END IF;
  END LOOP;

  -- Finally delete org row.
  DELETE FROM public.organizations
  WHERE id = _organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', _organization_id,
    'deleted_tables', touched,
    'deleted_by', _actor_id,
    'deleted_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_organization_robust(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_organization_robust(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_delete_organization_robust(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_organization_robust(uuid, uuid) TO service_role;
