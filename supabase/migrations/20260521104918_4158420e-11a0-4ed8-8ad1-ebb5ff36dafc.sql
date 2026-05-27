
CREATE TABLE IF NOT EXISTS public.surface_scan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_assets INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  safe_count INTEGER NOT NULL DEFAULT 0,
  avg_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  high_cves INTEGER NOT NULL DEFAULT 0,
  medium_cves INTEGER NOT NULL DEFAULT 0,
  low_cves INTEGER NOT NULL DEFAULT 0,
  truncated_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  assets_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surface_scan_history_org_date ON public.surface_scan_history(organization_id, scanned_at DESC);

ALTER TABLE public.surface_scan_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'surface_scan_history'
      AND policyname = 'Users can view their org surface scan history'
  ) THEN
    CREATE POLICY "Users can view their org surface scan history"
    ON public.surface_scan_history FOR SELECT
    USING (organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'surface_scan_history'
      AND policyname = 'Sales can view all surface scan history'
  ) THEN
    CREATE POLICY "Sales can view all surface scan history"
    ON public.surface_scan_history FOR SELECT
    USING (can_manage_all_organizations(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'surface_scan_history'
      AND policyname = 'Sales can manage all surface scan history'
  ) THEN
    CREATE POLICY "Sales can manage all surface scan history"
    ON public.surface_scan_history FOR ALL
    USING (can_manage_all_organizations(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'surface_scan_history'
      AND policyname = 'Users can insert their org surface scan history'
  ) THEN
    CREATE POLICY "Users can insert their org surface scan history"
    ON public.surface_scan_history FOR INSERT
    WITH CHECK (organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()));
  END IF;
END $$;
