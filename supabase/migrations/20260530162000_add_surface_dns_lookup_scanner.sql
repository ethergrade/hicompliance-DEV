-- SurfaceScan360 DNS lookup scanner persistence (additive)

CREATE TABLE IF NOT EXISTS public.surface_dns_lookup_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  tenant_id uuid NOT NULL,
  customer_id uuid,
  scan_id uuid,
  asset_id uuid,
  domain text NOT NULL,
  normalized_domain text NOT NULL,
  resolver text NOT NULL,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  grade text NOT NULL CHECK (grade IN ('A','B','C','D','F')),
  records jsonb NOT NULL DEFAULT '{}'::jsonb,
  additional_records jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.surface_dns_lookup_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  tenant_id uuid NOT NULL,
  customer_id uuid,
  dns_lookup_result_id uuid NOT NULL REFERENCES public.surface_dns_lookup_results(id) ON DELETE CASCADE,
  scan_id uuid,
  asset_id uuid,
  domain text NOT NULL,
  finding_key text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  status text NOT NULL CHECK (status IN ('pass','info','warn','fail')),
  title text NOT NULL,
  description text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation text NOT NULL,
  report_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surface_dns_lookup_results_tenant_scan
  ON public.surface_dns_lookup_results (tenant_id, scan_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_surface_dns_lookup_results_asset
  ON public.surface_dns_lookup_results (tenant_id, asset_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_surface_dns_lookup_results_customer
  ON public.surface_dns_lookup_results (customer_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_surface_dns_lookup_findings_result
  ON public.surface_dns_lookup_findings (dns_lookup_result_id);

CREATE INDEX IF NOT EXISTS idx_surface_dns_lookup_findings_severity
  ON public.surface_dns_lookup_findings (tenant_id, scan_id, severity, status);

CREATE INDEX IF NOT EXISTS idx_surface_dns_lookup_findings_domain
  ON public.surface_dns_lookup_findings (domain);

ALTER TABLE public.surface_dns_lookup_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_dns_lookup_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Surface DNS lookup results readable by customer scope" ON public.surface_dns_lookup_results;
CREATE POLICY "Surface DNS lookup results readable by customer scope"
  ON public.surface_dns_lookup_results FOR SELECT
  USING (
    customer_id IN (
      SELECT u.organization_id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
    )
    OR can_manage_all_organizations(auth.uid())
  );

DROP POLICY IF EXISTS "Surface DNS lookup results writable by admin scope" ON public.surface_dns_lookup_results;
CREATE POLICY "Surface DNS lookup results writable by admin scope"
  ON public.surface_dns_lookup_results FOR ALL
  USING (can_manage_all_organizations(auth.uid()))
  WITH CHECK (can_manage_all_organizations(auth.uid()));

DROP POLICY IF EXISTS "Surface DNS lookup findings readable by customer scope" ON public.surface_dns_lookup_findings;
CREATE POLICY "Surface DNS lookup findings readable by customer scope"
  ON public.surface_dns_lookup_findings FOR SELECT
  USING (
    customer_id IN (
      SELECT u.organization_id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
    )
    OR can_manage_all_organizations(auth.uid())
  );

DROP POLICY IF EXISTS "Surface DNS lookup findings writable by admin scope" ON public.surface_dns_lookup_findings;
CREATE POLICY "Surface DNS lookup findings writable by admin scope"
  ON public.surface_dns_lookup_findings FOR ALL
  USING (can_manage_all_organizations(auth.uid()))
  WITH CHECK (can_manage_all_organizations(auth.uid()));

CREATE OR REPLACE VIEW public.surface_dns_lookup_scan_summary AS
SELECT
  scan_id,
  customer_id,
  count(*) AS total_assets,
  round(avg(score))::int AS average_score,
  count(*) FILTER (WHERE grade IN ('A','B')) AS secure_assets,
  count(*) FILTER (WHERE grade IN ('D','F')) AS weak_assets,
  max(scanned_at) AS last_scanned_at
FROM public.surface_dns_lookup_results
GROUP BY scan_id, customer_id;
