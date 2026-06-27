-- Remove broad grants inherited from manually-created DEV tables.
-- Client writes flow through authenticated Edge Functions using service_role.

REVOKE ALL ON TABLE public.connectsecure_domain_registry FROM anon, authenticated;
REVOKE ALL ON TABLE public.surface_scan_monthly_reports FROM anon, authenticated;

GRANT SELECT ON TABLE public.connectsecure_domain_registry TO authenticated;
GRANT SELECT ON TABLE public.surface_scan_monthly_reports TO authenticated;

GRANT ALL ON TABLE public.connectsecure_domain_registry TO service_role;
GRANT ALL ON TABLE public.surface_scan_monthly_reports TO service_role;
