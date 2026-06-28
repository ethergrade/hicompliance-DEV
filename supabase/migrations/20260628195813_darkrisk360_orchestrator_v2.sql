-- DarkRisk360 V2 orchestration foundation.
-- Additive migration: the legacy runtime remains available behind feature flags.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

DO $$ BEGIN
  CREATE TYPE public.darkrisk_capability AS ENUM ('standard_monitor', 'extended_identity');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.darkrisk_grant_source AS ENUM ('hicompliance', 'standalone_standard', 'extended_bundle');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.darkrisk_run_mode AS ENUM ('standard', 'extended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.darkrisk_scope_target_type AS ENUM ('domain', 'ip');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.darkrisk_task_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.darkrisk_capability_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  capability public.darkrisk_capability NOT NULL,
  source public.darkrisk_grant_source NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT darkrisk_capability_grants_period_check CHECK (ends_at IS NULL OR ends_at > starts_at),
  UNIQUE (organization_id, capability, source)
);

CREATE INDEX IF NOT EXISTS darkrisk_capability_grants_active_idx
  ON public.darkrisk_capability_grants (organization_id, capability, enabled, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.darkrisk_external_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_type public.darkrisk_scope_target_type NOT NULL,
  value text NOT NULL,
  normalized_value text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  authorization_status text NOT NULL DEFAULT 'approved',
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT darkrisk_external_scope_authorization_check
    CHECK (authorization_status IN ('approved', 'candidate', 'revoked')),
  UNIQUE (organization_id, target_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS darkrisk_external_scope_active_idx
  ON public.darkrisk_external_scope (organization_id, active, authorization_status, target_type);

DROP TRIGGER IF EXISTS trg_darkrisk_capability_grants_updated_at ON public.darkrisk_capability_grants;
CREATE TRIGGER trg_darkrisk_capability_grants_updated_at
BEFORE UPDATE ON public.darkrisk_capability_grants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_darkrisk_external_scope_updated_at ON public.darkrisk_external_scope;
CREATE TRIGGER trg_darkrisk_external_scope_updated_at
BEFORE UPDATE ON public.darkrisk_external_scope
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.darkrisk_scan_runs
  ADD COLUMN IF NOT EXISTS mode public.darkrisk_run_mode,
  ADD COLUMN IF NOT EXISTS plan_version text NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS scope_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS period_key text,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

UPDATE public.darkrisk_scan_runs
SET mode = CASE WHEN tier::text = 'extended' THEN 'extended'::public.darkrisk_run_mode
                ELSE 'standard'::public.darkrisk_run_mode END
WHERE mode IS NULL;

ALTER TABLE public.darkrisk_scan_runs
  ALTER COLUMN mode SET DEFAULT 'standard'::public.darkrisk_run_mode,
  ALTER COLUMN mode SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS darkrisk_scan_runs_idempotency_uidx
  ON public.darkrisk_scan_runs (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS darkrisk_scan_runs_period_idx
  ON public.darkrisk_scan_runs (organization_id, mode, period_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.darkrisk_scan_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scan_run_id uuid NOT NULL REFERENCES public.darkrisk_scan_runs(id) ON DELETE CASCADE,
  scope_target_id uuid REFERENCES public.darkrisk_external_scope(id) ON DELETE SET NULL,
  task_kind text NOT NULL,
  provider text NOT NULL,
  status public.darkrisk_task_status NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  last_error_code text,
  last_error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT darkrisk_scan_tasks_kind_check CHECK (
    task_kind IN ('standard_search', 'extended_lines', 'extended_accounts', 'standard_monthly_report', 'extended_run_report')
  ),
  CONSTRAINT darkrisk_scan_tasks_provider_check CHECK (provider IN ('intelx_search', 'intelx_leaks', 'report')),
  CONSTRAINT darkrisk_scan_tasks_attempts_check CHECK (attempt_count >= 0 AND max_attempts BETWEEN 1 AND 20)
);

CREATE UNIQUE INDEX IF NOT EXISTS darkrisk_scan_tasks_plan_uidx
  ON public.darkrisk_scan_tasks (scan_run_id, task_kind, COALESCE(scope_target_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS darkrisk_scan_tasks_claim_idx
  ON public.darkrisk_scan_tasks (status, available_at, created_at)
  WHERE status IN ('queued', 'running');

DROP TRIGGER IF EXISTS trg_darkrisk_scan_tasks_updated_at ON public.darkrisk_scan_tasks;
CREATE TRIGGER trg_darkrisk_scan_tasks_updated_at
BEFORE UPDATE ON public.darkrisk_scan_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.darkrisk_provider_leases (
  provider text PRIMARY KEY,
  lease_owner text NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT darkrisk_provider_leases_provider_check
    CHECK (provider IN ('intelx_search', 'intelx_leaks'))
);

CREATE TABLE IF NOT EXISTS public.darkrisk_source_record_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scan_run_id uuid NOT NULL REFERENCES public.darkrisk_scan_runs(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.darkrisk_scan_tasks(id) ON DELETE SET NULL,
  source_record_id uuid NOT NULL REFERENCES public.darkrisk_source_records(id) ON DELETE CASCADE,
  scope_target_id uuid REFERENCES public.darkrisk_external_scope(id) ON DELETE SET NULL,
  match_type text NOT NULL DEFAULT 'direct',
  observed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT darkrisk_source_record_occurrences_match_check
    CHECK (match_type IN ('direct', 'correlated_from_ip'))
);

CREATE INDEX IF NOT EXISTS darkrisk_source_record_occurrences_run_idx
  ON public.darkrisk_source_record_occurrences (organization_id, scan_run_id, observed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS darkrisk_source_record_occurrences_uidx
  ON public.darkrisk_source_record_occurrences (
    scan_run_id,
    source_record_id,
    COALESCE(scope_target_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE TABLE IF NOT EXISTS public.darkrisk_sensitive_payloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_record_id uuid NOT NULL REFERENCES public.darkrisk_source_records(id) ON DELETE CASCADE,
  algorithm text NOT NULL DEFAULT 'AES-256-GCM+AES-KW-GCM',
  key_version text NOT NULL,
  encrypted_dek text NOT NULL,
  dek_iv text NOT NULL,
  ciphertext text NOT NULL,
  payload_iv text NOT NULL,
  sha256 text NOT NULL,
  retention_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_record_id),
  CONSTRAINT darkrisk_sensitive_payloads_algorithm_check
    CHECK (algorithm = 'AES-256-GCM+AES-KW-GCM')
);

CREATE INDEX IF NOT EXISTS darkrisk_sensitive_payloads_retention_idx
  ON public.darkrisk_sensitive_payloads (organization_id, retention_until);

ALTER TABLE public.darkrisk_report_snapshots
  ADD COLUMN IF NOT EXISTS report_kind text,
  ADD COLUMN IF NOT EXISTS period_key text,
  ADD COLUMN IF NOT EXISTS report_version text NOT NULL DEFAULT 'legacy';

UPDATE public.darkrisk_report_snapshots
SET report_kind = CASE WHEN tier::text = 'extended' THEN 'extended_run' ELSE 'standard_monthly' END
WHERE report_kind IS NULL;

ALTER TABLE public.darkrisk_report_snapshots
  ALTER COLUMN report_kind SET DEFAULT 'standard_monthly',
  ALTER COLUMN report_kind SET NOT NULL;

ALTER TABLE public.darkrisk_report_snapshots
  DROP CONSTRAINT IF EXISTS darkrisk_report_snapshots_kind_check;
ALTER TABLE public.darkrisk_report_snapshots
  ADD CONSTRAINT darkrisk_report_snapshots_kind_check
  CHECK (report_kind IN ('standard_monthly', 'extended_run')) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS darkrisk_report_standard_period_uidx
  ON public.darkrisk_report_snapshots (organization_id, period_key)
  WHERE report_kind = 'standard_monthly' AND period_key IS NOT NULL AND report_version = '2.0';
CREATE UNIQUE INDEX IF NOT EXISTS darkrisk_report_extended_run_uidx
  ON public.darkrisk_report_snapshots (scan_run_id)
  WHERE report_kind = 'extended_run' AND scan_run_id IS NOT NULL AND report_version = '2.0';

CREATE OR REPLACE VIEW public.darkrisk_standard_overview_v2
WITH (security_invoker = true)
AS
SELECT
  run.id AS run_id,
  run.organization_id,
  run.period_key,
  run.status,
  run.trigger_type,
  run.created_at,
  run.completed_at,
  COALESCE(sum(
    CASE
      WHEN task.status = 'completed' AND (task.result_summary->>'count') ~ '^\d+$'
        THEN (task.result_summary->>'count')::bigint
      ELSE 0
    END
  ), 0)::bigint AS total_count,
  COALESCE(bool_or(
    task.status = 'completed'
    AND lower(COALESCE(task.result_summary->>'at_least', 'false')) = 'true'
  ), false) AS at_least,
  count(*) FILTER (WHERE task.status = 'completed')::integer AS completed_targets,
  count(*)::integer AS total_targets
FROM public.darkrisk_scan_runs run
JOIN public.darkrisk_scan_tasks task ON task.scan_run_id = run.id
WHERE run.mode = 'standard'
  AND run.plan_version = '2.0'
  AND task.task_kind = 'standard_search'
GROUP BY run.id, run.organization_id, run.period_key, run.status, run.trigger_type,
         run.created_at, run.completed_at;

GRANT SELECT ON public.darkrisk_standard_overview_v2 TO authenticated, service_role;

-- Normalize scope at the database boundary and serialize the four-target limit.
CREATE OR REPLACE FUNCTION public.darkrisk_normalize_external_scope_v2()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  normalized text := lower(trim(NEW.value));
  current_count integer;
  candidate_ip inet;
BEGIN
  IF NEW.target_type = 'domain' THEN
    normalized := regexp_replace(normalized, '\.$', '');
    IF normalized LIKE '@%' OR normalized !~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' THEN
      RAISE EXCEPTION 'invalid_darkrisk_domain' USING ERRCODE = '22023';
    END IF;
  ELSE
    BEGIN
      candidate_ip := normalized::inet;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_darkrisk_ip' USING ERRCODE = '22023';
    END;
    IF masklen(candidate_ip) <> (CASE WHEN family(candidate_ip) = 4 THEN 32 ELSE 128 END) THEN
      RAISE EXCEPTION 'darkrisk_scope_rejects_cidr' USING ERRCODE = '22023';
    END IF;
    IF candidate_ip << inet '10.0.0.0/8'
       OR candidate_ip << inet '172.16.0.0/12'
       OR candidate_ip << inet '192.168.0.0/16'
       OR candidate_ip << inet '127.0.0.0/8'
       OR candidate_ip << inet '169.254.0.0/16'
       OR candidate_ip << inet '0.0.0.0/8'
       OR candidate_ip << inet '100.64.0.0/10'
       OR candidate_ip << inet '192.0.0.0/24'
       OR candidate_ip << inet '192.0.2.0/24'
       OR candidate_ip << inet '198.18.0.0/15'
       OR candidate_ip << inet '198.51.100.0/24'
       OR candidate_ip << inet '203.0.113.0/24'
       OR candidate_ip << inet '224.0.0.0/4'
       OR candidate_ip << inet '::1/128'
       OR candidate_ip << inet 'fc00::/7'
       OR candidate_ip << inet 'fe80::/10'
       OR candidate_ip << inet '2001:db8::/32'
       OR candidate_ip << inet 'ff00::/8' THEN
      RAISE EXCEPTION 'darkrisk_scope_requires_public_ip' USING ERRCODE = '22023';
    END IF;
    normalized := host(candidate_ip);
  END IF;

  NEW.value := normalized;
  NEW.normalized_value := normalized;
  NEW.updated_at := now();

  IF NEW.active AND NEW.authorization_status = 'approved' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text || ':darkrisk_scope', 0));
    SELECT count(*) INTO current_count
    FROM public.darkrisk_external_scope s
    WHERE s.organization_id = NEW.organization_id
      AND s.active
      AND s.authorization_status = 'approved'
      AND s.id IS DISTINCT FROM NEW.id;
    IF current_count >= 4 THEN
      RAISE EXCEPTION 'darkrisk_scope_limit_exceeded' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_darkrisk_normalize_external_scope_v2 ON public.darkrisk_external_scope;
CREATE TRIGGER trg_darkrisk_normalize_external_scope_v2
BEFORE INSERT OR UPDATE ON public.darkrisk_external_scope
FOR EACH ROW EXECUTE FUNCTION public.darkrisk_normalize_external_scope_v2();
REVOKE ALL ON FUNCTION public.darkrisk_normalize_external_scope_v2() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.darkrisk_sync_capability_grants_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.darkrisk_capability_grants (organization_id, capability, source, enabled)
  VALUES (NEW.id, 'standard_monitor', 'hicompliance', COALESCE(NEW.hicompliance_enabled, false))
  ON CONFLICT (organization_id, capability, source)
  DO UPDATE SET enabled = EXCLUDED.enabled,
                ends_at = CASE
                  WHEN EXCLUDED.enabled THEN NULL
                  ELSE COALESCE(darkrisk_capability_grants.ends_at, now())
                END,
                updated_at = now();

  INSERT INTO public.darkrisk_capability_grants (organization_id, capability, source, enabled)
  VALUES (
    NEW.id,
    'standard_monitor',
    'standalone_standard',
    COALESCE(NEW.dark_risk360_enabled, false) AND NOT COALESCE(NEW.hicompliance_enabled, false)
  )
  ON CONFLICT (organization_id, capability, source)
  DO UPDATE SET enabled = EXCLUDED.enabled,
                ends_at = CASE
                  WHEN EXCLUDED.enabled THEN NULL
                  ELSE COALESCE(darkrisk_capability_grants.ends_at, now())
                END,
                updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_darkrisk_sync_capability_grants_v2 ON public.organizations;
CREATE TRIGGER trg_darkrisk_sync_capability_grants_v2
AFTER INSERT OR UPDATE OF hicompliance_enabled, dark_risk360_enabled ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.darkrisk_sync_capability_grants_v2();
REVOKE ALL ON FUNCTION public.darkrisk_sync_capability_grants_v2() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.darkrisk_sync_extended_grant_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  extended_enabled boolean := NEW.enabled AND NEW.tier::text = 'extended';
BEGIN
  INSERT INTO public.darkrisk_capability_grants (organization_id, capability, source, enabled)
  VALUES (NEW.organization_id, 'extended_identity', 'extended_bundle', extended_enabled)
  ON CONFLICT (organization_id, capability, source)
  DO UPDATE SET enabled = EXCLUDED.enabled,
                ends_at = CASE
                  WHEN EXCLUDED.enabled THEN NULL
                  ELSE COALESCE(darkrisk_capability_grants.ends_at, now())
                END,
                updated_at = now();

  INSERT INTO public.darkrisk_capability_grants (organization_id, capability, source, enabled)
  VALUES (NEW.organization_id, 'standard_monitor', 'extended_bundle', extended_enabled)
  ON CONFLICT (organization_id, capability, source)
  DO UPDATE SET enabled = EXCLUDED.enabled,
                ends_at = CASE
                  WHEN EXCLUDED.enabled THEN NULL
                  ELSE COALESCE(darkrisk_capability_grants.ends_at, now())
                END,
                updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_darkrisk_sync_extended_grant_v2 ON public.darkrisk_entitlements;
CREATE TRIGGER trg_darkrisk_sync_extended_grant_v2
AFTER INSERT OR UPDATE OF tier, enabled ON public.darkrisk_entitlements
FOR EACH ROW EXECUTE FUNCTION public.darkrisk_sync_extended_grant_v2();
REVOKE ALL ON FUNCTION public.darkrisk_sync_extended_grant_v2() FROM PUBLIC, anon, authenticated;

INSERT INTO public.darkrisk_capability_grants (organization_id, capability, source, enabled)
SELECT id, 'standard_monitor', 'hicompliance', COALESCE(hicompliance_enabled, false)
FROM public.organizations
ON CONFLICT (organization_id, capability, source)
DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

INSERT INTO public.darkrisk_capability_grants (organization_id, capability, source, enabled)
SELECT id, 'standard_monitor', 'standalone_standard',
       COALESCE(dark_risk360_enabled, false) AND NOT COALESCE(hicompliance_enabled, false)
FROM public.organizations
ON CONFLICT (organization_id, capability, source)
DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

INSERT INTO public.darkrisk_capability_grants (organization_id, capability, source, enabled)
SELECT organization_id, capability, 'extended_bundle', true
FROM public.darkrisk_entitlements e
CROSS JOIN (VALUES
  ('standard_monitor'::public.darkrisk_capability),
  ('extended_identity'::public.darkrisk_capability)
) AS capabilities(capability)
WHERE e.enabled AND e.tier::text = 'extended'
ON CONFLICT (organization_id, capability, source)
DO UPDATE SET enabled = true, updated_at = now();

-- Atomic worker lease. Provider credentials never enter task payloads.
CREATE OR REPLACE FUNCTION public.darkrisk_claim_scan_tasks_v2(
  worker_id text,
  task_limit integer DEFAULT 10,
  lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.darkrisk_scan_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF trim(COALESCE(worker_id, '')) = '' THEN
    RAISE EXCEPTION 'worker_id_required' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT t.id
    FROM public.darkrisk_scan_tasks t
    WHERE t.attempt_count < t.max_attempts
      AND t.provider IN ('intelx_search', 'intelx_leaks')
      AND t.available_at <= now()
      AND (t.status = 'queued' OR (t.status = 'running' AND t.lease_expires_at < now()))
    ORDER BY t.available_at, t.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(task_limit, 1), 50)
  )
  UPDATE public.darkrisk_scan_tasks t
  SET status = 'running',
      lease_owner = worker_id,
      lease_expires_at = now() + make_interval(secs => LEAST(GREATEST(lease_seconds, 30), 900)),
      heartbeat_at = now(),
      started_at = COALESCE(t.started_at, now()),
      attempt_count = t.attempt_count + 1,
      updated_at = now()
  FROM candidates c
  WHERE t.id = c.id
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION public.darkrisk_claim_scan_tasks_v2(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.darkrisk_claim_scan_tasks_v2(text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.darkrisk_acquire_provider_lease_v2(
  requested_provider text,
  worker_id text,
  lease_seconds integer DEFAULT 900
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE acquired boolean := false;
BEGIN
  IF requested_provider NOT IN ('intelx_search', 'intelx_leaks')
     OR trim(COALESCE(worker_id, '')) = '' THEN
    RAISE EXCEPTION 'invalid_provider_lease_request' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.darkrisk_provider_leases (provider, lease_owner, lease_expires_at)
  VALUES (
    requested_provider,
    worker_id,
    now() + make_interval(secs => LEAST(GREATEST(lease_seconds, 30), 900))
  )
  ON CONFLICT (provider) DO UPDATE
  SET lease_owner = EXCLUDED.lease_owner,
      lease_expires_at = EXCLUDED.lease_expires_at,
      updated_at = now()
  WHERE darkrisk_provider_leases.lease_expires_at < now()
     OR darkrisk_provider_leases.lease_owner = EXCLUDED.lease_owner
  RETURNING true INTO acquired;
  RETURN COALESCE(acquired, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.darkrisk_release_provider_lease_v2(
  requested_provider text,
  worker_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.darkrisk_provider_leases
  WHERE provider = requested_provider AND lease_owner = worker_id;
$$;

REVOKE ALL ON FUNCTION public.darkrisk_acquire_provider_lease_v2(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.darkrisk_release_provider_lease_v2(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.darkrisk_acquire_provider_lease_v2(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.darkrisk_release_provider_lease_v2(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.darkrisk_purge_expired_extended_v2(
  effective_at timestamptz DEFAULT now()
)
RETURNS TABLE (
  organization_id uuid,
  sensitive_payloads_deleted bigint,
  reports_deleted bigint,
  storage_objects_deleted bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  candidate record;
  deleted_sensitive bigint;
  deleted_reports bigint;
  deleted_objects bigint;
  deleted_evidence_objects bigint;
BEGIN
  FOR candidate IN
    SELECT g.organization_id, max(COALESCE(g.ends_at, g.updated_at)) AS contract_ended_at
    FROM public.darkrisk_capability_grants g
    WHERE g.capability = 'extended_identity'
      AND NOT EXISTS (
        SELECT 1
        FROM public.darkrisk_capability_grants active_grant
        WHERE active_grant.organization_id = g.organization_id
          AND active_grant.capability = 'extended_identity'
          AND active_grant.enabled
          AND active_grant.starts_at <= effective_at
          AND (active_grant.ends_at IS NULL OR active_grant.ends_at > effective_at)
      )
    GROUP BY g.organization_id
    HAVING max(COALESCE(g.ends_at, g.updated_at)) <= effective_at - interval '23 hours'
  LOOP
    DELETE FROM storage.objects object
    WHERE object.bucket_id = 'darkrisk-reports'
      AND object.name IN (
        SELECT path
        FROM public.darkrisk_report_snapshots report
        CROSS JOIN LATERAL unnest(ARRAY[
          report.html_storage_path,
          report.json_storage_path,
          report.pdf_storage_path
        ]) AS paths(path)
        WHERE report.organization_id = candidate.organization_id
          AND (report.report_kind = 'extended_run' OR report.tier::text = 'extended')
          AND path IS NOT NULL
      );
    GET DIAGNOSTICS deleted_objects = ROW_COUNT;

    DELETE FROM storage.objects object
    WHERE object.bucket_id = 'darkrisk-evidence-private'
      AND object.name IN (
        SELECT raw_ref.storage_path
        FROM public.darkrisk_raw_evidence_refs raw_ref
        JOIN public.darkrisk_evidence evidence ON evidence.id = raw_ref.evidence_id
        JOIN public.darkrisk_scan_runs run ON run.id = evidence.scan_run_id
        WHERE raw_ref.organization_id = candidate.organization_id
          AND run.mode = 'extended'
      );
    GET DIAGNOSTICS deleted_evidence_objects = ROW_COUNT;
    deleted_objects := deleted_objects + deleted_evidence_objects;

    DELETE FROM public.darkrisk_raw_evidence_refs raw_ref
    USING public.darkrisk_evidence evidence, public.darkrisk_scan_runs run
    WHERE raw_ref.evidence_id = evidence.id
      AND evidence.scan_run_id = run.id
      AND raw_ref.organization_id = candidate.organization_id
      AND run.mode = 'extended';

    DELETE FROM public.darkrisk_sensitive_payloads payload
    WHERE payload.organization_id = candidate.organization_id;
    GET DIAGNOSTICS deleted_sensitive = ROW_COUNT;

    DELETE FROM public.darkrisk_report_snapshots report
    WHERE report.organization_id = candidate.organization_id
      AND (report.report_kind = 'extended_run' OR report.tier::text = 'extended');
    GET DIAGNOSTICS deleted_reports = ROW_COUNT;

    INSERT INTO public.darkrisk_audit_log (
      organization_id, actor_id, action, entity_type, reason, metadata
    ) VALUES (
      candidate.organization_id,
      NULL,
      'darkrisk_extended_contract_purged_v2',
      'organization',
      'extended_contract_ended',
      jsonb_build_object(
        'contract_ended_at', candidate.contract_ended_at,
        'purged_at', effective_at,
        'sensitive_payloads_deleted', deleted_sensitive,
        'reports_deleted', deleted_reports,
        'storage_objects_deleted', deleted_objects
      )
    );

    organization_id := candidate.organization_id;
    sensitive_payloads_deleted := deleted_sensitive;
    reports_deleted := deleted_reports;
    storage_objects_deleted := deleted_objects;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.darkrisk_purge_expired_extended_v2(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.darkrisk_purge_expired_extended_v2(timestamptz) TO service_role;

ALTER TABLE public.darkrisk_capability_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_external_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_scan_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_source_record_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_sensitive_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.darkrisk_provider_leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DarkRisk V2 grants tenant read" ON public.darkrisk_capability_grants
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.organization_id = darkrisk_capability_grants.organization_id
  )
);
CREATE POLICY "DarkRisk V2 grants admin write" ON public.darkrisk_capability_grants
FOR ALL TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
);

CREATE POLICY "DarkRisk V2 scope tenant read" ON public.darkrisk_external_scope
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.organization_id = darkrisk_external_scope.organization_id
  )
);
CREATE POLICY "DarkRisk V2 scope admin write" ON public.darkrisk_external_scope
FOR ALL TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.organization_id = darkrisk_external_scope.organization_id
      AND u.user_type::text = 'admin'
  )
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.organization_id = darkrisk_external_scope.organization_id
      AND u.user_type::text = 'admin'
  )
);

CREATE POLICY "DarkRisk V2 tasks tenant read" ON public.darkrisk_scan_tasks
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.organization_id = darkrisk_scan_tasks.organization_id
  )
);
CREATE POLICY "DarkRisk V2 occurrences tenant read" ON public.darkrisk_source_record_occurrences
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.organization_id = darkrisk_source_record_occurrences.organization_id
  )
);

GRANT SELECT ON public.darkrisk_capability_grants, public.darkrisk_external_scope,
  public.darkrisk_scan_tasks, public.darkrisk_source_record_occurrences TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.darkrisk_capability_grants, public.darkrisk_external_scope TO authenticated;
REVOKE ALL ON public.darkrisk_sensitive_payloads, public.darkrisk_provider_leases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.darkrisk_capability_grants, public.darkrisk_external_scope,
  public.darkrisk_scan_tasks, public.darkrisk_source_record_occurrences,
  public.darkrisk_sensitive_payloads, public.darkrisk_provider_leases TO service_role;

-- Unschedule all legacy Extended/Identity jobs. Extended V2 is spot-only.
DO $$
DECLARE job record;
BEGIN
  FOR job IN
    SELECT jobid FROM cron.job
    WHERE lower(jobname) LIKE '%darkrisk%'
      AND (lower(jobname) LIKE '%esteso%' OR lower(jobname) LIKE '%extended%'
           OR lower(jobname) LIKE '%identity%' OR lower(jobname) LIKE '%dti%')
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN (
    'darkrisk-v2-dst-scheduler-hourly',
    'darkrisk-v2-provider-worker',
    'darkrisk-v2-retention-hourly'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Hourly tick: the Edge scheduler evaluates Europe/Rome and idempotency keys.
SELECT cron.schedule(
  'darkrisk-v2-dst-scheduler-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/surface-scan-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-surface-internal-secret', (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'surface_scan_cron_internal_secret' LIMIT 1
      )
    ),
    body := jsonb_build_object(
      'darkrisk_schedule_only', true,
      'triggered_by', 'darkrisk_v2_scheduler',
      'at', now()::text
    )
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'darkrisk-v2-provider-worker',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hcllvyzhefcqftesahnv.supabase.co/functions/v1/darkrisk360-worker-v2',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-surface-internal-secret', (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'surface_scan_cron_internal_secret' LIMIT 1
      )
    ),
    body := jsonb_build_object('max_tasks', 5, 'triggered_by', 'cron', 'at', now()::text)
  ) AS request_id;
  $$
);

-- Hourly plus a 23-hour cutoff guarantees purge no later than 24 hours after
-- the Extended grant ends, including cron jitter.
SELECT cron.schedule(
  'darkrisk-v2-retention-hourly',
  '15 * * * *',
  $$SELECT public.darkrisk_purge_expired_extended_v2(now());$$
);
