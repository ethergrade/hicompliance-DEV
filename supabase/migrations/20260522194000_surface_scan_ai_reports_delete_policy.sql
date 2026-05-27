DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'surface_scan_ai_reports'
      AND policyname = 'Org members can delete AI reports'
  ) THEN
    CREATE POLICY "Org members can delete AI reports"
    ON public.surface_scan_ai_reports FOR DELETE TO authenticated
    USING (
      organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid())
      OR public.can_manage_all_organizations(auth.uid())
    );
  END IF;
END $$;
