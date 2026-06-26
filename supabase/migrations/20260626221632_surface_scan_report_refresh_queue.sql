CREATE TABLE IF NOT EXISTS public.surface_scan_report_refresh_queue (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger_source text NOT NULL DEFAULT 'connectsecure_result_ingested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  not_before timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surface_scan_report_refresh_ready
  ON public.surface_scan_report_refresh_queue(not_before, requested_at)
  WHERE locked_at IS NULL;

ALTER TABLE public.surface_scan_report_refresh_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_surface_scan_report_refresh()
RETURNS SETOF public.surface_scan_report_refresh_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT queue.organization_id
    FROM public.surface_scan_report_refresh_queue AS queue
    WHERE queue.not_before <= now()
      AND (
        queue.locked_at IS NULL
        OR queue.locked_at < now() - interval '10 minutes'
      )
    ORDER BY queue.requested_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.surface_scan_report_refresh_queue AS queue
  SET
    locked_at = now(),
    attempt_count = queue.attempt_count + 1,
    updated_at = now()
  FROM candidate
  WHERE queue.organization_id = candidate.organization_id
  RETURNING queue.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_surface_scan_report_refresh() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_surface_scan_report_refresh() TO service_role;
