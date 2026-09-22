CREATE OR REPLACE FUNCTION public.platform_managed_cron_jobs()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'cve-enrichment-drain-30s',
    'cve-drain-5min',
    'nuclei-scan360-process-ready-every-minute',
    'connectsecure-result-poller',
    'surfacescan-subdomain-queue-dispatch',
    'surface-scan-weekly-monday',
    'darkrisk360-manual-trigger-poll',
    'darkrisk-esteso-admin-weekly-cron',
    'darkrisk-scan-lock-cleanup',
    'cisa-kev-sync-daily',
    'pentest-tools-poll'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.list_platform_cron_jobs()
RETURNS TABLE(jobname text, schedule text, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
  SELECT j.jobname::text, j.schedule::text, j.active
  FROM cron.job j
  WHERE j.jobname = ANY (public.platform_managed_cron_jobs())
    AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ORDER BY j.jobname;
$$;

CREATE OR REPLACE FUNCTION public.set_cron_job_active(_jobname text, _active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
DECLARE
  v_jobid bigint;
  v_paused jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;

  IF NOT (_jobname = ANY (public.platform_managed_cron_jobs())) THEN
    RAISE EXCEPTION 'unknown job: %', _jobname;
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = _jobname;
  IF v_jobid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'job_not_found', 'jobname', _jobname);
  END IF;

  PERFORM cron.alter_job(job_id := v_jobid, active := _active);

  SELECT COALESCE(paused_jobs, '[]'::jsonb) INTO v_paused
  FROM public.platform_runtime_settings WHERE id = true;

  IF _active THEN
    v_paused := COALESCE((
      SELECT jsonb_agg(value) FROM jsonb_array_elements_text(v_paused) AS t(value)
      WHERE value <> _jobname
    ), '[]'::jsonb);
  ELSE
    IF NOT (v_paused @> to_jsonb(ARRAY[_jobname])) THEN
      v_paused := v_paused || to_jsonb(ARRAY[_jobname]);
    END IF;
  END IF;

  UPDATE public.platform_runtime_settings
  SET paused_jobs = v_paused, updated_by = auth.uid(), updated_at = now()
  WHERE id = true;

  RETURN jsonb_build_object('ok', true, 'jobname', _jobname, 'active', _active);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_platform_stage_mode(_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
DECLARE
  v_job record;
  v_changed integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;

  FOR v_job IN
    SELECT jobid, jobname FROM cron.job
    WHERE jobname = ANY (public.platform_managed_cron_jobs())
  LOOP
    PERFORM cron.alter_job(job_id := v_job.jobid, active := NOT _enabled);
    v_changed := v_changed + 1;
  END LOOP;

  UPDATE public.platform_runtime_settings
  SET stage_mode = _enabled,
      paused_jobs = CASE
        WHEN _enabled THEN COALESCE((SELECT jsonb_agg(x) FROM unnest(public.platform_managed_cron_jobs()) AS x), '[]'::jsonb)
        ELSE '[]'::jsonb
      END,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = true;

  RETURN jsonb_build_object('ok', true, 'stage_mode', _enabled, 'jobs_updated', v_changed);
END;
$$;

REVOKE ALL ON FUNCTION public.set_platform_stage_mode(boolean) FROM public;
REVOKE ALL ON FUNCTION public.set_cron_job_active(text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_platform_stage_mode(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_cron_job_active(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_managed_cron_jobs() TO authenticated;