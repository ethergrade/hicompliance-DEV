GRANT SELECT ON public.assessment_categories TO authenticated;
GRANT SELECT ON public.assessment_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_snapshots TO authenticated;
GRANT SELECT ON public.remediation_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remediation_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.organization_profiles TO authenticated;
GRANT SELECT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.assessment_categories, public.assessment_questions, public.assessment_responses, public.assessment_snapshots, public.remediation_templates, public.remediation_tasks, public.organization_profiles, public.organizations TO service_role;