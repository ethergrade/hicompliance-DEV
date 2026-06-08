-- SurfaceScan360: harden Pentest-Tools queue expansion from discovered subdomains.
-- Keeps one local task per scan/phase/tool/target and preserves tasks that have
-- already been started remotely.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY scan_job_id, phase, tool_id, lower(target_name)
      ORDER BY
        CASE
          WHEN remote_scan_id IS NOT NULL THEN 0
          WHEN status IN ('running', 'waiting') THEN 1
          WHEN status IN ('queued', 'retry') THEN 2
          WHEN status = 'finished' THEN 3
          ELSE 4
        END,
        created_at ASC,
        id ASC
    ) AS keep_rank
  FROM public.pentest_tools_scans
)
DELETE FROM public.pentest_tools_scans p
USING ranked r
WHERE p.id = r.id
  AND r.keep_rank > 1
  AND p.remote_scan_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pentest_tools_scans_job_phase_tool_target_local_unique
  ON public.pentest_tools_scans (scan_job_id, phase, tool_id, lower(target_name))
  WHERE remote_scan_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pentest_tools_scans_subdomain_queue
  ON public.pentest_tools_scans (scan_job_id, phase, status, created_at)
  WHERE phase IN ('subdomain_discovery', 'port_scan')
    AND status IN ('queued', 'retry', 'running', 'waiting');

COMMENT ON INDEX public.idx_pentest_tools_scans_job_phase_tool_target_local_unique
  IS 'Prevents duplicate local SurfaceScan360 Pentest-Tools queue tasks for the same scan, phase, tool and target.';
