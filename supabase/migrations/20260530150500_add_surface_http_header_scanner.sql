-- SurfaceScan360 HTTP Headers scanner persistence (additive)

CREATE TABLE IF NOT EXISTS public.surface_http_header_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  tenant_id uuid,
  customer_id uuid,
  scan_id uuid NOT NULL,
  project_id uuid NOT NULL,
  asset_id uuid,
  asset_type text NOT NULL CHECK (asset_type IN ('domain', 'url')),
  input_url text NOT NULL,
  normalized_url text NOT NULL,
  final_url text,
  status_code int,
  is_https boolean NOT NULL DEFAULT false,
  response_time_ms int NOT NULL DEFAULT 0,
  score int NOT NULL CHECK (score >= 0 AND score <= 100),
  grade text NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D', 'F')),
  ok_count int NOT NULL DEFAULT 0,
  weak_count int NOT NULL DEFAULT 0,
  missing_count int NOT NULL DEFAULT 0,
  high_impact_open_count int NOT NULL DEFAULT 0,
  raw_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.surface_http_header_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  tenant_id uuid,
  customer_id uuid,
  result_id uuid NOT NULL REFERENCES public.surface_http_header_results(id) ON DELETE CASCADE,
  scan_id uuid NOT NULL,
  project_id uuid NOT NULL,
  asset_id uuid,
  rule_id text NOT NULL,
  header_name text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL CHECK (status IN ('ok', 'weak', 'missing', 'error')),
  weight int NOT NULL DEFAULT 0,
  earned_points numeric NOT NULL DEFAULT 0,
  actual_value text,
  note text NOT NULL,
  description text NOT NULL,
  recommendation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surface_http_header_results_scan_id
  ON public.surface_http_header_results(scan_id);

CREATE INDEX IF NOT EXISTS idx_surface_http_header_results_project_id
  ON public.surface_http_header_results(project_id);

CREATE INDEX IF NOT EXISTS idx_surface_http_header_results_customer_id
  ON public.surface_http_header_results(customer_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_surface_http_header_results_grade
  ON public.surface_http_header_results(grade);

CREATE INDEX IF NOT EXISTS idx_surface_http_header_findings_result_id
  ON public.surface_http_header_findings(result_id);

CREATE INDEX IF NOT EXISTS idx_surface_http_header_findings_scan_status
  ON public.surface_http_header_findings(scan_id, status);

CREATE INDEX IF NOT EXISTS idx_surface_http_header_findings_header_name
  ON public.surface_http_header_findings(header_name);

ALTER TABLE public.surface_http_header_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_http_header_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Surface HTTP header results readable by customer scope" ON public.surface_http_header_results;
CREATE POLICY "Surface HTTP header results readable by customer scope"
  ON public.surface_http_header_results FOR SELECT
  USING (
    customer_id IN (
      SELECT u.organization_id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
    )
    OR can_manage_all_organizations(auth.uid())
  );

DROP POLICY IF EXISTS "Surface HTTP header results writable by admin scope" ON public.surface_http_header_results;
CREATE POLICY "Surface HTTP header results writable by admin scope"
  ON public.surface_http_header_results FOR ALL
  USING (can_manage_all_organizations(auth.uid()))
  WITH CHECK (can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "Surface HTTP header findings readable by customer scope" ON public.surface_http_header_findings;
CREATE POLICY "Surface HTTP header findings readable by customer scope"
  ON public.surface_http_header_findings FOR SELECT
  USING (
    customer_id IN (
      SELECT u.organization_id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
    )
    OR can_manage_all_organizations(auth.uid())
  );

DROP POLICY IF EXISTS "Surface HTTP header findings writable by admin scope" ON public.surface_http_header_findings;
CREATE POLICY "Surface HTTP header findings writable by admin scope"
  ON public.surface_http_header_findings FOR ALL
  USING (can_manage_all_organizations(auth.uid()))
  WITH CHECK (can_manage_all_organizations(auth.uid()));

CREATE OR REPLACE VIEW public.surface_http_header_scan_summary AS
SELECT
  scan_id,
  project_id,
  customer_id,
  count(*) AS total_assets,
  round(avg(score))::int AS average_score,
  count(*) FILTER (WHERE grade IN ('A','B')) AS secure_assets,
  count(*) FILTER (WHERE grade IN ('D','F')) AS weak_assets,
  sum(high_impact_open_count) AS high_impact_open_total,
  max(scanned_at) AS last_scanned_at
FROM public.surface_http_header_results
GROUP BY scan_id, project_id, customer_id;
