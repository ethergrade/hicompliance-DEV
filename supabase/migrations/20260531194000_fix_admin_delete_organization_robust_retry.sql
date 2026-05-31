-- Make organization deletion resilient to FK cross-dependencies between child tables.
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
  deleted_this_pass bigint;
  pass_no integer := 0;
  max_passes integer := 12;
  touched jsonb := '[]'::jsonb;
  pending_tables jsonb := '[]'::jsonb;
  next_pending jsonb := '[]'::jsonb;
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

  -- Gather direct FK tables referencing organizations(id).
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'schema_name', ns.nspname,
        'table_name', cls.relname,
        'column_name', att.attname
      )
      ORDER BY ns.nspname, cls.relname, att.attname
    ),
    '[]'::jsonb
  )
  INTO pending_tables
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
    AND cls.relname <> 'organizations';

  -- Multi-pass cleanup: retry failed tables so FK ordering issues resolve automatically.
  WHILE pass_no < max_passes LOOP
    pass_no := pass_no + 1;
    deleted_this_pass := 0;
    next_pending := '[]'::jsonb;

    FOR fk_row IN
      SELECT
        value->>'schema_name' AS schema_name,
        value->>'table_name' AS table_name,
        value->>'column_name' AS column_name
      FROM jsonb_array_elements(pending_tables)
    LOOP
      BEGIN
        EXECUTE format(
          'DELETE FROM %I.%I WHERE %I = $1',
          fk_row.schema_name,
          fk_row.table_name,
          fk_row.column_name
        ) USING _organization_id;

        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        IF deleted_count > 0 THEN
          deleted_this_pass := deleted_this_pass + deleted_count;
          touched := touched || jsonb_build_object(
            'table', format('%s.%s', fk_row.schema_name, fk_row.table_name),
            'column', fk_row.column_name,
            'deleted', deleted_count,
            'pass', pass_no
          );
        END IF;
      EXCEPTION
        WHEN foreign_key_violation THEN
          next_pending := next_pending || jsonb_build_object(
            'schema_name', fk_row.schema_name,
            'table_name', fk_row.table_name,
            'column_name', fk_row.column_name,
            'error', SQLERRM
          );
        WHEN others THEN
          next_pending := next_pending || jsonb_build_object(
            'schema_name', fk_row.schema_name,
            'table_name', fk_row.table_name,
            'column_name', fk_row.column_name,
            'error', SQLERRM
          );
      END;
    END LOOP;

    pending_tables := next_pending;

    EXIT WHEN jsonb_array_length(pending_tables) = 0;
    EXIT WHEN deleted_this_pass = 0;
  END LOOP;

  IF jsonb_array_length(pending_tables) > 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = 'organization_cleanup_blocked',
      DETAIL = pending_tables::text,
      HINT = 'Resolve blocking FK dependencies and retry deletion';
  END IF;

  -- Finally delete org row.
  DELETE FROM public.organizations
  WHERE id = _organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', _organization_id,
    'deleted_tables', touched,
    'deleted_by', _actor_id,
    'deleted_at', now(),
    'passes', pass_no
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_organization_robust(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_organization_robust(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_delete_organization_robust(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_organization_robust(uuid, uuid) TO service_role;
