
-- Table to persist HiLog correlation reports
CREATE TABLE public.hilog_correlation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  report_type text NOT NULL DEFAULT 'correlation',
  time_range_label text NOT NULL,
  time_range_days integer NOT NULL,
  filter_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  events_count integer NOT NULL DEFAULT 0,
  format text NOT NULL DEFAULT 'XLSX',
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hilog_correlation_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Sales can manage all correlation reports"
  ON public.hilog_correlation_reports FOR ALL
  USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can view all correlation reports"
  ON public.hilog_correlation_reports FOR SELECT
  USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Users can view their org correlation reports"
  ON public.hilog_correlation_reports FOR SELECT
  USING (organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()));

CREATE POLICY "Users can insert their org correlation reports"
  ON public.hilog_correlation_reports FOR INSERT
  WITH CHECK (organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()));

CREATE POLICY "Users can delete their org correlation reports"
  ON public.hilog_correlation_reports FOR DELETE
  USING (organization_id IN (SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()));

-- Timestamp trigger
CREATE TRIGGER update_hilog_correlation_reports_updated_at
  BEFORE UPDATE ON public.hilog_correlation_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
