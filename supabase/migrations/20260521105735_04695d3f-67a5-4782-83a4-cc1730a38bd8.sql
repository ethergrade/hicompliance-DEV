
-- Flag organizzazione
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS pentest_tools_auto_validation BOOLEAN NOT NULL DEFAULT false;

-- 1) Jobs
CREATE TABLE IF NOT EXISTS public.external_scan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'pentest_tools',
  target TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('domain','url','ip','hostname')),
  resolved_ips TEXT[] NOT NULL DEFAULT '{}',
  hosting_context TEXT NOT NULL DEFAULT 'unknown' CHECK (hosting_context IN ('dedicated','shared_hosting','cdn_proxy','unknown')),
  shodan_status TEXT NOT NULL DEFAULT 'unknown' CHECK (shodan_status IN ('found_exact','found_ip_only','not_found','stale_or_low_confidence','unknown')),
  scan_profile TEXT NOT NULL CHECK (scan_profile IN ('recon_safe','cve_web','cve_network','deep_authorized')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','partial','completed','failed','cancelled')),
  triggered_by TEXT NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('cron','manual','auto_from_shodan')),
  requested_by UUID,
  authorization_proof TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_esj_org_date ON public.external_scan_jobs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esj_status ON public.external_scan_jobs(status) WHERE status IN ('queued','running');

ALTER TABLE public.external_scan_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own org jobs" ON public.external_scan_jobs;
CREATE POLICY "Users view own org jobs" ON public.external_scan_jobs FOR SELECT
USING (organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Sales view all jobs" ON public.external_scan_jobs;
CREATE POLICY "Sales view all jobs" ON public.external_scan_jobs FOR SELECT
USING (can_manage_all_organizations(auth.uid()));
DROP POLICY IF EXISTS "Sales manage all jobs" ON public.external_scan_jobs;
CREATE POLICY "Sales manage all jobs" ON public.external_scan_jobs FOR ALL
USING (can_manage_all_organizations(auth.uid()));
DROP POLICY IF EXISTS "Admins insert own org jobs" ON public.external_scan_jobs;
CREATE POLICY "Admins insert own org jobs" ON public.external_scan_jobs FOR INSERT
WITH CHECK (
  organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid() AND users.user_type = 'admin')
);
DROP POLICY IF EXISTS "Admins update own org jobs" ON public.external_scan_jobs;
CREATE POLICY "Admins update own org jobs" ON public.external_scan_jobs FOR UPDATE
USING (
  organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid() AND users.user_type = 'admin')
);

-- 2) Tasks
CREATE TABLE IF NOT EXISTS public.external_scan_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id UUID NOT NULL REFERENCES public.external_scan_jobs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'pentest_tools',
  tool_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  target TEXT NOT NULL,
  external_scan_id BIGINT,
  external_task_id BIGINT,
  status TEXT NOT NULL DEFAULT 'queued',
  raw_status JSONB,
  progress INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_est_external_scan ON public.external_scan_tasks(external_scan_id) WHERE external_scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_est_job ON public.external_scan_tasks(scan_job_id);

ALTER TABLE public.external_scan_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own org tasks" ON public.external_scan_tasks;
CREATE POLICY "Users view own org tasks" ON public.external_scan_tasks FOR SELECT
USING (organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Sales manage all tasks" ON public.external_scan_tasks;
CREATE POLICY "Sales manage all tasks" ON public.external_scan_tasks FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- 3) Findings normalizzati
CREATE TABLE IF NOT EXISTS public.external_cve_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id UUID NOT NULL REFERENCES public.external_scan_jobs(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.external_scan_tasks(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'pentest_tools',
  external_finding_id BIGINT,
  target TEXT NOT NULL,
  affected_url TEXT,
  ip INET,
  port INTEGER,
  protocol TEXT,
  service TEXT,
  name TEXT NOT NULL,
  cve TEXT[] NOT NULL DEFAULT '{}',
  cwe TEXT,
  cvss NUMERIC(4,2),
  cvssv3 NUMERIC(4,2),
  epss_score NUMERIC(6,5),
  epss_percentile NUMERIC(6,5),
  in_cisa_catalog BOOLEAN NOT NULL DEFAULT false,
  risk_level INTEGER NOT NULL DEFAULT 0,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  attribution_confidence TEXT NOT NULL DEFAULT 'medium' CHECK (attribution_confidence IN ('high','medium','low')),
  confidence TEXT NOT NULL DEFAULT 'unvalidated' CHECK (confidence IN ('validated','active_scan_validated','external_signal_not_attributed','unvalidated')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','resolved','false_positive','accepted_risk')),
  recommendation TEXT,
  evidence JSONB,
  raw_finding JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecf_dedupe ON public.external_cve_findings(scan_job_id, external_finding_id) WHERE external_finding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ecf_org_severity ON public.external_cve_findings(organization_id, severity, created_at DESC);

ALTER TABLE public.external_cve_findings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own org findings" ON public.external_cve_findings;
CREATE POLICY "Users view own org findings" ON public.external_cve_findings FOR SELECT
USING (organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Sales manage all findings" ON public.external_cve_findings;
CREATE POLICY "Sales manage all findings" ON public.external_cve_findings FOR ALL
USING (can_manage_all_organizations(auth.uid()));
DROP POLICY IF EXISTS "Admins update own org findings" ON public.external_cve_findings;
CREATE POLICY "Admins update own org findings" ON public.external_cve_findings FOR UPDATE
USING (
  organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid() AND users.user_type = 'admin')
);

-- 4) Shodan enrichments per job
CREATE TABLE IF NOT EXISTS public.shodan_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id UUID NOT NULL REFERENCES public.external_scan_jobs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  target TEXT NOT NULL,
  ip INET,
  source TEXT NOT NULL DEFAULT 'host',
  found BOOLEAN NOT NULL DEFAULT false,
  ports INTEGER[] DEFAULT '{}',
  hostnames TEXT[] DEFAULT '{}',
  cpes TEXT[] DEFAULT '{}',
  vulns JSONB,
  raw_response JSONB,
  confidence TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_se_job ON public.shodan_enrichments(scan_job_id);

ALTER TABLE public.shodan_enrichments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own org enrichments" ON public.shodan_enrichments;
CREATE POLICY "Users view own org enrichments" ON public.shodan_enrichments FOR SELECT
USING (organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Sales manage all enrichments" ON public.shodan_enrichments;
CREATE POLICY "Sales manage all enrichments" ON public.shodan_enrichments FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- 5) Reports
CREATE TABLE IF NOT EXISTS public.external_scan_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id UUID NOT NULL REFERENCES public.external_scan_jobs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  external_report_id BIGINT,
  format TEXT NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf','docx','html','json','csv','xlsx')),
  group_by TEXT NOT NULL DEFAULT 'vulnerability',
  status TEXT NOT NULL DEFAULT 'pending',
  download_url TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.external_scan_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own org reports" ON public.external_scan_reports;
CREATE POLICY "Users view own org reports" ON public.external_scan_reports FOR SELECT
USING (organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Sales manage all reports" ON public.external_scan_reports;
CREATE POLICY "Sales manage all reports" ON public.external_scan_reports FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- 6) Audit log
CREATE TABLE IF NOT EXISTS public.external_scan_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  scan_job_id UUID,
  actor_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_esal_org_date ON public.external_scan_audit_log(organization_id, created_at DESC);

ALTER TABLE public.external_scan_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own org audit" ON public.external_scan_audit_log;
CREATE POLICY "Users view own org audit" ON public.external_scan_audit_log FOR SELECT
USING (organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Sales view all audit" ON public.external_scan_audit_log;
CREATE POLICY "Sales view all audit" ON public.external_scan_audit_log FOR SELECT
USING (can_manage_all_organizations(auth.uid()));
DROP POLICY IF EXISTS "Service inserts audit" ON public.external_scan_audit_log;
CREATE POLICY "Service inserts audit" ON public.external_scan_audit_log FOR INSERT
WITH CHECK (true);

-- Trigger updated_at on findings
DROP TRIGGER IF EXISTS trg_ecf_updated_at ON public.external_cve_findings;
CREATE TRIGGER trg_ecf_updated_at
BEFORE UPDATE ON public.external_cve_findings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
