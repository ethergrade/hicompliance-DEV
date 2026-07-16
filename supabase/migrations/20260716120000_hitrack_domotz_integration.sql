-- HiTrack Domotz integration
-- Forward-only migration.
-- Rollback (manual): drop views public.hitrack_*_v, functions public.hitrack_*,
-- cron jobs named hitrack-%, and tables public.hitrack_* in reverse dependency order.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'hitrack_job_status'
  ) THEN
    CREATE TYPE public.hitrack_job_status AS ENUM (
      'queued',
      'running',
      'completed',
      'failed'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'hitrack_metric_scope'
  ) THEN
    CREATE TYPE public.hitrack_metric_scope AS ENUM ('collector', 'device');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.hitrack_collectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  canonical_service_code text NOT NULL DEFAULT 'hitrack',
  is_enabled boolean NOT NULL DEFAULT true,
  domotz_organization_id bigint,
  domotz_agent_id bigint NOT NULL,
  collector_name text NOT NULL,
  collector_status text NOT NULL DEFAULT 'UNKNOWN',
  matching_rule text,
  source_username_hint text,
  collector_aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_discovered_at timestamptz,
  last_synced_at timestamptz,
  last_successful_sync_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, domotz_agent_id)
);

CREATE TABLE IF NOT EXISTS public.hitrack_metric_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL UNIQUE,
  metric_scope public.hitrack_metric_scope NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  unit text,
  path_pattern text,
  label_pattern text,
  domotz_metric text,
  has_history boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hitrack_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  collector_id uuid NOT NULL REFERENCES public.hitrack_collectors(id) ON DELETE CASCADE,
  domotz_device_id bigint NOT NULL,
  device_name text NOT NULL,
  ip_address text,
  device_type text,
  vendor text,
  model text,
  monitoring_state text NOT NULL DEFAULT 'unknown',
  managed boolean NOT NULL DEFAULT false,
  location text,
  os_name text,
  os_version text,
  last_status_change_at timestamptz,
  last_seen_at timestamptz,
  raw_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collector_id, domotz_device_id)
);

CREATE TABLE IF NOT EXISTS public.hitrack_collector_metrics_latest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  collector_id uuid NOT NULL REFERENCES public.hitrack_collectors(id) ON DELETE CASCADE,
  metric_key text NOT NULL REFERENCES public.hitrack_metric_definitions(metric_key),
  source_variable_id bigint,
  source_key text NOT NULL DEFAULT 'default',
  metric_label text,
  metric_path text,
  metric_unit text,
  numeric_value numeric,
  text_value text,
  has_history boolean NOT NULL DEFAULT false,
  trend_24h jsonb NOT NULL DEFAULT '[]'::jsonb,
  trend_7d jsonb NOT NULL DEFAULT '[]'::jsonb,
  trend_30d jsonb NOT NULL DEFAULT '[]'::jsonb,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collector_id, metric_key, source_key)
);

CREATE TABLE IF NOT EXISTS public.hitrack_device_metrics_latest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  collector_id uuid NOT NULL REFERENCES public.hitrack_collectors(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.hitrack_devices(id) ON DELETE CASCADE,
  metric_key text NOT NULL REFERENCES public.hitrack_metric_definitions(metric_key),
  source_variable_id bigint,
  source_key text NOT NULL DEFAULT 'default',
  metric_label text,
  metric_path text,
  metric_unit text,
  dimension_key text NOT NULL DEFAULT '',
  numeric_value numeric,
  text_value text,
  has_history boolean NOT NULL DEFAULT false,
  trend_24h jsonb NOT NULL DEFAULT '[]'::jsonb,
  trend_7d jsonb NOT NULL DEFAULT '[]'::jsonb,
  trend_30d jsonb NOT NULL DEFAULT '[]'::jsonb,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, metric_key, dimension_key, source_key)
);

CREATE TABLE IF NOT EXISTS public.hitrack_metric_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  collector_id uuid NOT NULL REFERENCES public.hitrack_collectors(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.hitrack_devices(id) ON DELETE CASCADE,
  metric_key text NOT NULL REFERENCES public.hitrack_metric_definitions(metric_key),
  source_variable_id bigint,
  dimension_key text,
  numeric_value numeric,
  text_value text,
  sampled_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hitrack_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  collector_id uuid NOT NULL REFERENCES public.hitrack_collectors(id) ON DELETE CASCADE,
  monitored_devices integer NOT NULL DEFAULT 0,
  managed_devices integer NOT NULL DEFAULT 0,
  unmanaged_devices integer NOT NULL DEFAULT 0,
  online_devices integer NOT NULL DEFAULT 0,
  offline_devices integer NOT NULL DEFAULT 0,
  open_alerts integer NOT NULL DEFAULT 0,
  avg_uptime_percent numeric(6,2),
  avg_packet_loss_percent numeric(6,2),
  health_score numeric(6,2) NOT NULL DEFAULT 0,
  data_coverage_percent numeric(6,2) NOT NULL DEFAULT 0,
  freshness_seconds integer,
  sampled_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hitrack_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  collector_id uuid NOT NULL REFERENCES public.hitrack_collectors(id) ON DELETE CASCADE,
  status public.hitrack_job_status NOT NULL DEFAULT 'queued',
  trigger_type text NOT NULL DEFAULT 'scheduled',
  priority integer NOT NULL DEFAULT 100,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hitrack_collectors_org_idx
  ON public.hitrack_collectors (organization_id, is_enabled);
CREATE INDEX IF NOT EXISTS hitrack_devices_org_idx
  ON public.hitrack_devices (organization_id, collector_id, managed);
CREATE INDEX IF NOT EXISTS hitrack_metric_samples_window_idx
  ON public.hitrack_metric_samples (
    organization_id,
    collector_id,
    device_id,
    metric_key,
    sampled_at DESC
  );
CREATE INDEX IF NOT EXISTS hitrack_sync_jobs_queue_idx
  ON public.hitrack_sync_jobs (status, available_at, priority, collector_id);
CREATE INDEX IF NOT EXISTS hitrack_health_snapshots_latest_idx
  ON public.hitrack_health_snapshots (organization_id, collector_id, sampled_at DESC);

ALTER TABLE public.hitrack_collectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hitrack_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hitrack_metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hitrack_collector_metrics_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hitrack_device_metrics_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hitrack_metric_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hitrack_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hitrack_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS hitrack_collectors_updated_at ON public.hitrack_collectors;
CREATE TRIGGER hitrack_collectors_updated_at
  BEFORE UPDATE ON public.hitrack_collectors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS hitrack_metric_definitions_updated_at ON public.hitrack_metric_definitions;
CREATE TRIGGER hitrack_metric_definitions_updated_at
  BEFORE UPDATE ON public.hitrack_metric_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS hitrack_devices_updated_at ON public.hitrack_devices;
CREATE TRIGGER hitrack_devices_updated_at
  BEFORE UPDATE ON public.hitrack_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS hitrack_collector_metrics_latest_updated_at ON public.hitrack_collector_metrics_latest;
CREATE TRIGGER hitrack_collector_metrics_latest_updated_at
  BEFORE UPDATE ON public.hitrack_collector_metrics_latest
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS hitrack_device_metrics_latest_updated_at ON public.hitrack_device_metrics_latest;
CREATE TRIGGER hitrack_device_metrics_latest_updated_at
  BEFORE UPDATE ON public.hitrack_device_metrics_latest
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS hitrack_sync_jobs_updated_at ON public.hitrack_sync_jobs;
CREATE TRIGGER hitrack_sync_jobs_updated_at
  BEFORE UPDATE ON public.hitrack_sync_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.hitrack_can_access_organization(
  _user_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_manage_all_organizations(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.auth_user_id = _user_id
        AND u.organization_id = _organization_id
    );
$$;

CREATE OR REPLACE FUNCTION public.hitrack_is_org_admin(
  _user_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_manage_all_organizations(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.auth_user_id = _user_id
        AND u.organization_id = _organization_id
        AND u.user_type = 'admin'::public.user_type
    );
$$;

CREATE OR REPLACE FUNCTION public.hitrack_health_score(
  _online_devices integer,
  _managed_devices integer,
  _open_alerts integer,
  _avg_packet_loss_percent numeric,
  _data_coverage_percent numeric,
  _freshness_seconds integer
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND(
    LEAST(
      100,
      GREATEST(
        0,
        (
          CASE
            WHEN COALESCE(_managed_devices, 0) <= 0 THEN 0
            ELSE (COALESCE(_online_devices, 0)::numeric / GREATEST(_managed_devices, 1)::numeric) * 45
          END
        )
        + GREATEST(0, 20 - LEAST(COALESCE(_open_alerts, 0), 20))
        + GREATEST(0, 15 - LEAST(COALESCE(_avg_packet_loss_percent, 100), 15))
        + LEAST(COALESCE(_data_coverage_percent, 0), 15)
        + CASE
            WHEN _freshness_seconds IS NULL THEN 0
            WHEN _freshness_seconds <= 900 THEN 5
            WHEN _freshness_seconds <= 3600 THEN 3
            ELSE 0
          END
      )
    ),
    2
  );
$$;

CREATE OR REPLACE FUNCTION public.hitrack_schedule_sync_jobs(
  _max_jobs integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  WITH eligible AS (
    SELECT c.organization_id, c.id AS collector_id
    FROM public.hitrack_collectors c
    WHERE c.is_enabled = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.hitrack_sync_jobs j
        WHERE j.collector_id = c.id
          AND j.status IN ('queued', 'running')
      )
    ORDER BY COALESCE(c.last_synced_at, '1970-01-01'::timestamptz) ASC
    LIMIT GREATEST(1, COALESCE(_max_jobs, 100))
  ),
  ins AS (
    INSERT INTO public.hitrack_sync_jobs (
      organization_id,
      collector_id,
      status,
      trigger_type,
      priority,
      available_at
    )
    SELECT
      eligible.organization_id,
      eligible.collector_id,
      'queued',
      'scheduled',
      100,
      now()
    FROM eligible
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted_count FROM ins;

  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.hitrack_claim_sync_jobs(
  _worker_id text,
  _job_limit integer DEFAULT 5,
  _lease_seconds integer DEFAULT 900
)
RETURNS SETOF public.hitrack_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.hitrack_sync_jobs j
    WHERE j.status = 'queued'
      AND j.available_at <= now()
      AND (
        j.lease_expires_at IS NULL
        OR j.lease_expires_at < now()
      )
    ORDER BY j.priority ASC, j.available_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, COALESCE(_job_limit, 5))
  ),
  claimed AS (
    UPDATE public.hitrack_sync_jobs j
    SET status = 'running',
        lease_owner = _worker_id,
        lease_expires_at = now() + make_interval(secs => GREATEST(60, COALESCE(_lease_seconds, 900))),
        claimed_at = now(),
        attempt_count = j.attempt_count + 1,
        updated_at = now()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.*
  )
  SELECT * FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.hitrack_sync_now(
  _organization_id uuid,
  _collector_ids uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_job uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.hitrack_is_org_admin(auth.uid(), _organization_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.hitrack_sync_jobs (
    organization_id,
    collector_id,
    status,
    trigger_type,
    priority,
    available_at
  )
  SELECT
    c.organization_id,
    c.id,
    'queued',
    'manual',
    10,
    now()
  FROM public.hitrack_collectors c
  WHERE c.organization_id = _organization_id
    AND c.is_enabled = true
    AND (_collector_ids IS NULL OR c.id = ANY(_collector_ids))
  RETURNING id INTO first_job;

  RETURN first_job;
END;
$$;

INSERT INTO public.hitrack_metric_definitions (
  metric_key,
  metric_scope,
  category,
  label,
  unit,
  path_pattern,
  label_pattern,
  domotz_metric,
  has_history,
  active,
  verified,
  notes
)
VALUES
  (
    'rtd_worst_ms',
    'device',
    'network',
    'RTD Worst',
    'ms',
    NULL,
    NULL,
    NULL,
    false,
    true,
    true,
    'Derived from GET /agent/{agent_id}/device/rtd; no variable_id is emitted by the API.'
  ),
  (
    'rtd_median_ms',
    'device',
    'network',
    'RTD Median',
    'ms',
    NULL,
    NULL,
    NULL,
    false,
    true,
    true,
    'Derived from GET /agent/{agent_id}/device/rtd; no variable_id is emitted by the API.'
  ),
  (
    'packet_loss_percent',
    'device',
    'network',
    'Packet Loss Percent',
    '%',
    NULL,
    NULL,
    NULL,
    false,
    true,
    true,
    'Derived from GET /agent/{agent_id}/device/rtd using latest_lost_packet_count / latest_sent_packet_count.'
  ),
  (
    'collector_unloaded_packet_loss_percent',
    'collector',
    'collector',
    'Packet Loss',
    '%',
    'agent_performance/unloaded-packet-loss',
    'Packet Loss',
    'unloaded_packet_loss',
    true,
    true,
    true,
    'Verified on July 16, 2026 via GET /agent/{agent_id}/variable for ETRURIA_SOCIETA_COOPERATIVA.'
  ),
  (
    'collector_speed_test_upload_bps',
    'collector',
    'collector',
    'Upload',
    'b/s',
    'agent_performance/speed-test/upload',
    'Upload',
    'speed_test_upload',
    true,
    true,
    true,
    'Verified on July 16, 2026 via GET /agent/{agent_id}/variable.'
  ),
  (
    'collector_speed_test_download_bps',
    'collector',
    'collector',
    'Download',
    'b/s',
    'agent_performance/speed-test/download',
    'Download',
    'speed_test_download',
    true,
    true,
    true,
    'Verified on July 16, 2026 via GET /agent/{agent_id}/variable.'
  ),
  (
    'collector_loaded_jitter_upload_ms',
    'collector',
    'collector',
    'Loaded Jitter Upload',
    'ms',
    'agent_performance/loaded-jitter-upload',
    'Loaded Jitter Upload',
    'loaded_jitter_upload',
    true,
    true,
    true,
    'Verified on July 16, 2026 via GET /agent/{agent_id}/variable.'
  ),
  (
    'collector_loaded_jitter_download_ms',
    'collector',
    'collector',
    'Loaded Jitter Download',
    'ms',
    'agent_performance/loaded-jitter-download',
    'Loaded Jitter Download',
    'loaded_jitter_download',
    true,
    true,
    true,
    'Verified on July 16, 2026 via GET /agent/{agent_id}/variable.'
  ),
  (
    'ram_total_gib',
    'device',
    'ram',
    'Memory',
    'GiB',
    'custom-driver/7851/table/host-%/column/7',
    '% - Memory',
    NULL,
    true,
    true,
    true,
    'Verified on July 16, 2026 on managed device 22511155 (Vcenter).'
  ),
  (
    'ram_usage_percent',
    'device',
    'ram',
    'Memory Usage',
    '%',
    'custom-driver/7851/table/host-%/column/8',
    '% - Memory Usage',
    NULL,
    true,
    true,
    true,
    'Verified on July 16, 2026 on managed device 22511155 (Vcenter).'
  ),
  (
    'disk_capacity_gib',
    'device',
    'disk',
    'Capacity',
    'GiB',
    'custom-driver/7846/table/datastore-%/column/3',
    '% - Capacity',
    NULL,
    true,
    true,
    true,
    'Verified on July 16, 2026 on managed device 22511155 (Vcenter).'
  ),
  (
    'disk_free_gib',
    'device',
    'disk',
    'Free Space',
    'GiB',
    'custom-driver/7846/table/datastore-%/column/4',
    '% - Free Space',
    NULL,
    true,
    true,
    true,
    'Verified on July 16, 2026 on managed device 22511155 (Vcenter).'
  ),
  (
    'disk_usage_percent',
    'device',
    'disk',
    'Usage',
    '%',
    'custom-driver/7846/table/datastore-%/column/5',
    '% - Usage',
    NULL,
    true,
    true,
    true,
    'Verified on July 16, 2026 on managed device 22511155 (Vcenter).'
  ),
  (
    'device_storage_status',
    'device',
    'device_status',
    'Storage Status',
    NULL,
    'snmp/preset/idrac-general/globalStorageStatus',
    'Storage Status',
    NULL,
    true,
    false,
    true,
    'Verified status-only variable on iDRAC devices; intentionally inactive for numeric dashboard panels.'
  ),
  (
    'device_memory_status',
    'device',
    'device_status',
    'Memory Status',
    NULL,
    'snmp/preset/idrac-components/idrac_hw_components/%/systemStateMemoryDeviceStatusCombined',
    '% - Memory Status',
    NULL,
    true,
    false,
    true,
    'Verified status-only variable on iDRAC devices; intentionally inactive for numeric dashboard panels.'
  )
ON CONFLICT (metric_key) DO UPDATE
SET metric_scope = EXCLUDED.metric_scope,
    category = EXCLUDED.category,
    label = EXCLUDED.label,
    unit = EXCLUDED.unit,
    path_pattern = EXCLUDED.path_pattern,
    label_pattern = EXCLUDED.label_pattern,
    domotz_metric = EXCLUDED.domotz_metric,
    has_history = EXCLUDED.has_history,
    active = EXCLUDED.active,
    verified = EXCLUDED.verified,
    notes = EXCLUDED.notes,
    updated_at = now();

CREATE POLICY "HiTrack collectors readable by organization"
  ON public.hitrack_collectors
  FOR SELECT
  USING (public.hitrack_can_access_organization(auth.uid(), organization_id));

CREATE POLICY "HiTrack collectors writable by org admins"
  ON public.hitrack_collectors
  FOR ALL
  USING (public.hitrack_is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.hitrack_is_org_admin(auth.uid(), organization_id));

CREATE POLICY "HiTrack metric definitions readable"
  ON public.hitrack_metric_definitions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "HiTrack metric definitions writable only by privileged"
  ON public.hitrack_metric_definitions
  FOR ALL
  USING (public.can_manage_all_organizations(auth.uid()))
  WITH CHECK (public.can_manage_all_organizations(auth.uid()));

CREATE POLICY "HiTrack devices readable by organization"
  ON public.hitrack_devices
  FOR SELECT
  USING (public.hitrack_can_access_organization(auth.uid(), organization_id));

CREATE POLICY "HiTrack collector metrics readable by organization"
  ON public.hitrack_collector_metrics_latest
  FOR SELECT
  USING (public.hitrack_can_access_organization(auth.uid(), organization_id));

CREATE POLICY "HiTrack device metrics readable by organization"
  ON public.hitrack_device_metrics_latest
  FOR SELECT
  USING (public.hitrack_can_access_organization(auth.uid(), organization_id));

CREATE POLICY "HiTrack metric samples readable by organization"
  ON public.hitrack_metric_samples
  FOR SELECT
  USING (public.hitrack_can_access_organization(auth.uid(), organization_id));

CREATE POLICY "HiTrack health snapshots readable by organization"
  ON public.hitrack_health_snapshots
  FOR SELECT
  USING (public.hitrack_can_access_organization(auth.uid(), organization_id));

CREATE POLICY "HiTrack sync jobs readable by organization"
  ON public.hitrack_sync_jobs
  FOR SELECT
  USING (public.hitrack_can_access_organization(auth.uid(), organization_id));

CREATE OR REPLACE VIEW public.hitrack_collectors_v
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.organization_id AS "organizationId",
  c.domotz_agent_id AS "domotzAgentId",
  c.collector_name AS "collectorName",
  c.collector_status AS "collectorStatus",
  c.matching_rule AS "matchingRule",
  c.last_synced_at AS "lastSyncedAt",
  COALESCE(h.data_coverage_percent, 0)::numeric AS "dataCoveragePercent",
  h.freshness_seconds AS "freshnessSeconds"
FROM public.hitrack_collectors c
LEFT JOIN LATERAL (
  SELECT hs.data_coverage_percent, hs.freshness_seconds
  FROM public.hitrack_health_snapshots hs
  WHERE hs.collector_id = c.id
  ORDER BY hs.sampled_at DESC
  LIMIT 1
) h ON true;

GRANT SELECT ON public.hitrack_collectors_v TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hitrack_get_collectors(
  _organization_id uuid
)
RETURNS SETOF public.hitrack_collectors_v
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT *
  FROM public.hitrack_collectors_v
  WHERE "organizationId" = _organization_id
    AND public.hitrack_can_access_organization(auth.uid(), _organization_id);
$$;

GRANT EXECUTE ON FUNCTION public.hitrack_get_collectors(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hitrack_get_dashboard(
  _organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  overview jsonb;
  collectors jsonb;
  monitored_devices jsonb;
  ram_monitoring jsonb;
  logical_disks jsonb;
  coverage jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.hitrack_can_access_organization(auth.uid(), _organization_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'monitoredDevices', COALESCE(sum(hs.monitored_devices), 0),
    'onlineDevices', COALESCE(sum(hs.online_devices), 0),
    'offlineDevices', COALESCE(sum(hs.offline_devices), 0),
    'openAlerts', COALESCE(sum(hs.open_alerts), 0),
    'managedDevices', COALESCE(sum(hs.managed_devices), 0),
    'unmanagedDevices', COALESCE(sum(hs.unmanaged_devices), 0),
    'healthScore', COALESCE(avg(hs.health_score), 0),
    'dataCoveragePercent', COALESCE(avg(hs.data_coverage_percent), 0),
    'freshnessSeconds', MIN(hs.freshness_seconds),
    'lastSyncedAt', MAX(c.last_synced_at)
  )
  INTO overview
  FROM public.hitrack_collectors c
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.hitrack_health_snapshots hs
    WHERE hs.collector_id = c.id
    ORDER BY hs.sampled_at DESC
    LIMIT 1
  ) hs ON true
  WHERE c.organization_id = _organization_id
    AND c.is_enabled = true;

  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v."collectorName"), '[]'::jsonb)
  INTO collectors
  FROM public.hitrack_collectors_v v
  WHERE v."organizationId" = _organization_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'domotzDeviceId', d.domotz_device_id,
    'collectorId', d.collector_id,
    'deviceName', d.device_name,
    'type', COALESCE(d.device_type, 'unknown'),
    'ipAddress', d.ip_address,
    'status', CASE WHEN d.managed THEN 'managed' ELSE 'unmanaged' END,
    'statusType', CASE WHEN d.managed THEN 'success' ELSE 'warning' END,
    'rtdWorstMs', (
      SELECT dm.numeric_value
      FROM public.hitrack_device_metrics_latest dm
      WHERE dm.device_id = d.id
        AND dm.metric_key = 'rtd_worst_ms'
      ORDER BY dm.sampled_at DESC
      LIMIT 1
    ),
    'rtdMedianMs', (
      SELECT dm.numeric_value
      FROM public.hitrack_device_metrics_latest dm
      WHERE dm.device_id = d.id
        AND dm.metric_key = 'rtd_median_ms'
      ORDER BY dm.sampled_at DESC
      LIMIT 1
    ),
    'packetLossPercent', (
      SELECT dm.numeric_value
      FROM public.hitrack_device_metrics_latest dm
      WHERE dm.device_id = d.id
        AND dm.metric_key = 'packet_loss_percent'
      ORDER BY dm.sampled_at DESC
      LIMIT 1
    ),
    'location', d.location,
    'vendor', d.vendor,
    'model', d.model,
    'osName', d.os_name,
    'osVersion', d.os_version,
    'lastStatusChangeAt', d.last_status_change_at
  ) ORDER BY d.device_name), '[]'::jsonb)
  INTO monitored_devices
  FROM public.hitrack_devices d
  WHERE d.organization_id = _organization_id
    AND d.managed = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', total.id,
    'collectorName', c.collector_name,
    'deviceName', d.device_name,
    'ipAddress', d.ip_address,
    'totalRamGiB', total.numeric_value,
    'usagePercent', usage.numeric_value,
    'usedRamGiB', CASE
      WHEN total.numeric_value IS NOT NULL AND usage.numeric_value IS NOT NULL
        THEN ROUND(total.numeric_value * usage.numeric_value / 100.0, 2)
      ELSE NULL
    END,
    'freeRamGiB', CASE
      WHEN total.numeric_value IS NOT NULL AND usage.numeric_value IS NOT NULL
        THEN ROUND(total.numeric_value - (total.numeric_value * usage.numeric_value / 100.0), 2)
      ELSE NULL
    END,
    'status', COALESCE(usage.text_value, 'runtime'),
    'statusType', CASE
      WHEN usage.numeric_value >= 90 THEN 'error'
      WHEN usage.numeric_value >= 75 THEN 'warning'
      WHEN usage.numeric_value IS NULL THEN 'muted'
      ELSE 'success'
    END,
    'trend24h', COALESCE(usage.trend_24h, '[]'::jsonb),
    'trend7d', COALESCE(usage.trend_7d, '[]'::jsonb),
    'trend30d', COALESCE(usage.trend_30d, '[]'::jsonb)
  ) ORDER BY d.device_name), '[]'::jsonb)
  INTO ram_monitoring
  FROM public.hitrack_device_metrics_latest total
  JOIN public.hitrack_device_metrics_latest usage
    ON usage.device_id = total.device_id
   AND usage.metric_key = 'ram_usage_percent'
   AND COALESCE(usage.dimension_key, '') = COALESCE(total.dimension_key, '')
  JOIN public.hitrack_devices d ON d.id = total.device_id
  JOIN public.hitrack_collectors c ON c.id = total.collector_id
  WHERE total.organization_id = _organization_id
    AND total.metric_key = 'ram_total_gib';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', usage.id,
    'collectorName', c.collector_name,
    'deviceName', d.device_name,
    'diskLabel', COALESCE(usage.dimension_key, usage.metric_label, 'disk'),
    'ipAddress', d.ip_address,
    'status', COALESCE(usage.text_value, 'runtime'),
    'statusType', CASE
      WHEN usage.numeric_value >= 90 THEN 'error'
      WHEN usage.numeric_value >= 75 THEN 'warning'
      WHEN usage.numeric_value IS NULL THEN 'muted'
      ELSE 'success'
    END,
    'usagePercent', usage.numeric_value,
    'sizeGiB', capacity.numeric_value,
    'freeSpaceGiB', free_space.numeric_value,
    'trend24h', COALESCE(usage.trend_24h, '[]'::jsonb),
    'trend7d', COALESCE(usage.trend_7d, '[]'::jsonb),
    'trend30d', COALESCE(usage.trend_30d, '[]'::jsonb)
  ) ORDER BY d.device_name, COALESCE(usage.dimension_key, usage.metric_label)), '[]'::jsonb)
  INTO logical_disks
  FROM public.hitrack_device_metrics_latest usage
  LEFT JOIN public.hitrack_device_metrics_latest capacity
    ON capacity.device_id = usage.device_id
   AND capacity.metric_key = 'disk_capacity_gib'
   AND COALESCE(capacity.dimension_key, '') = COALESCE(usage.dimension_key, '')
  LEFT JOIN public.hitrack_device_metrics_latest free_space
    ON free_space.device_id = usage.device_id
   AND free_space.metric_key = 'disk_free_gib'
   AND COALESCE(free_space.dimension_key, '') = COALESCE(usage.dimension_key, '')
  JOIN public.hitrack_devices d ON d.id = usage.device_id
  JOIN public.hitrack_collectors c ON c.id = usage.collector_id
  WHERE usage.organization_id = _organization_id
    AND usage.metric_key = 'disk_usage_percent';

  SELECT jsonb_build_object(
    'monitoredDevicesWithRtd', (
      SELECT COUNT(*)
      FROM public.hitrack_devices d
      WHERE d.organization_id = _organization_id
        AND d.managed = true
        AND EXISTS (
          SELECT 1
          FROM public.hitrack_device_metrics_latest dm
          WHERE dm.device_id = d.id
            AND dm.metric_key = 'rtd_worst_ms'
        )
    ),
    'managedDevices', (
      SELECT COUNT(*)
      FROM public.hitrack_devices d
      WHERE d.organization_id = _organization_id
        AND d.managed = true
    ),
    'devicesWithRamMetrics', (
      SELECT COUNT(DISTINCT dm.device_id)
      FROM public.hitrack_device_metrics_latest dm
      WHERE dm.organization_id = _organization_id
        AND dm.metric_key = 'ram_usage_percent'
    ),
    'devicesWithDiskMetrics', (
      SELECT COUNT(DISTINCT dm.device_id)
      FROM public.hitrack_device_metrics_latest dm
      WHERE dm.organization_id = _organization_id
        AND dm.metric_key = 'disk_usage_percent'
    ),
    'ramCoveragePercent', (
      SELECT ROUND(
        CASE
          WHEN COUNT(*) FILTER (WHERE d.managed) = 0 THEN 0
          ELSE (
            COUNT(DISTINCT dm.device_id)::numeric
            / COUNT(*) FILTER (WHERE d.managed)::numeric
          ) * 100
        END,
        2
      )
      FROM public.hitrack_devices d
      LEFT JOIN public.hitrack_device_metrics_latest dm
        ON dm.device_id = d.id
       AND dm.metric_key = 'ram_usage_percent'
      WHERE d.organization_id = _organization_id
    ),
    'diskCoveragePercent', (
      SELECT ROUND(
        CASE
          WHEN COUNT(*) FILTER (WHERE d.managed) = 0 THEN 0
          ELSE (
            COUNT(DISTINCT dm.device_id)::numeric
            / COUNT(*) FILTER (WHERE d.managed)::numeric
          ) * 100
        END,
        2
      )
      FROM public.hitrack_devices d
      LEFT JOIN public.hitrack_device_metrics_latest dm
        ON dm.device_id = d.id
       AND dm.metric_key = 'disk_usage_percent'
      WHERE d.organization_id = _organization_id
    ),
    'note', CASE
      WHEN (
        SELECT COUNT(*)
        FROM public.hitrack_device_metrics_latest dm
        WHERE dm.organization_id = _organization_id
          AND dm.metric_key IN ('ram_usage_percent', 'disk_usage_percent')
      ) = 0
      THEN 'Dato non disponibile: la Public API non espone ancora metriche quantitative su tutti i managed device del collector.'
      ELSE 'Coverage parziale calcolata sui device che espongono metriche quantitative verificate.'
    END
  )
  INTO coverage;

  RETURN jsonb_build_object(
    'overview', COALESCE(overview, '{}'::jsonb),
    'collectors', COALESCE(collectors, '[]'::jsonb),
    'monitoredDevices', COALESCE(monitored_devices, '[]'::jsonb),
    'ramMonitoring', COALESCE(ram_monitoring, '[]'::jsonb),
    'logicalDisks', COALESCE(logical_disks, '[]'::jsonb),
    'dataCoverage', COALESCE(coverage, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hitrack_get_dashboard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hitrack_schedule_sync_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.hitrack_claim_sync_jobs(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.hitrack_sync_now(uuid, uuid[]) TO authenticated, service_role;

DO $$
DECLARE
  has_pg_cron boolean := EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  );
BEGIN
  IF has_pg_cron THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'hitrack-scheduler-15min';

    PERFORM cron.schedule(
      'hitrack-scheduler-15min',
      '*/15 * * * *',
      $$SELECT public.hitrack_schedule_sync_jobs(100);$$
    );
  END IF;
END $$;
