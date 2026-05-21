DELETE FROM public.surface_scan_history h
USING (
  SELECT organization_id, COUNT(*) AS rule_count
  FROM public.surface_scan_monitored_ips
  GROUP BY organization_id
) r
WHERE h.organization_id = r.organization_id
  AND h.total_assets > GREATEST(r.rule_count * 5, 20);