-- Funzione per verificare se l'utente può gestire tutte le organizzazioni (sales/super_admin)
CREATE OR REPLACE FUNCTION public.can_manage_all_organizations(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'sales')
  )
$$;

-- RLS policies per permettere a sales/admin di vedere TUTTE le organizzazioni

-- organizations
CREATE POLICY "Sales can view all organizations"
ON public.organizations FOR SELECT
USING (can_manage_all_organizations(auth.uid()));

-- organization_profiles
CREATE POLICY "Sales can view all organization profiles"
ON public.organization_profiles FOR SELECT
USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can update all organization profiles"
ON public.organization_profiles FOR UPDATE
USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can insert organization profiles"
ON public.organization_profiles FOR INSERT
WITH CHECK (can_manage_all_organizations(auth.uid()));

-- contact_directory
CREATE POLICY "Sales can view all contacts"
ON public.contact_directory FOR SELECT
USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can manage all contacts"
ON public.contact_directory FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- emergency_contacts
CREATE POLICY "Sales can view all emergency contacts"
ON public.emergency_contacts FOR SELECT
USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can manage all emergency contacts"
ON public.emergency_contacts FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- irp_documents
CREATE POLICY "Sales can view all IRP documents"
ON public.irp_documents FOR SELECT
USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can manage all IRP documents"
ON public.irp_documents FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- playbook_completions
CREATE POLICY "Sales can view all playbook completions"
ON public.playbook_completions FOR SELECT
USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can manage all playbook completions"
ON public.playbook_completions FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- risk_analysis
CREATE POLICY "Sales can view all risk analysis"
ON public.risk_analysis FOR SELECT
USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can manage all risk analysis"
ON public.risk_analysis FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- critical_infrastructure
CREATE POLICY "Sales can view all critical infrastructure"
ON public.critical_infrastructure FOR SELECT
USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can manage all critical infrastructure"
ON public.critical_infrastructure FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- remediation_tasks
CREATE POLICY "Sales can view all remediation tasks"
ON public.remediation_tasks FOR SELECT
USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can manage all remediation tasks"
ON public.remediation_tasks FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- assessment_responses
CREATE POLICY "Sales can view all assessment responses"
ON public.assessment_responses FOR SELECT
USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can manage all assessment responses"
ON public.assessment_responses FOR ALL
USING (can_manage_all_organizations(auth.uid()));

-- asset_inventory
CREATE POLICY "Sales can view all asset inventories"
ON public.asset_inventory FOR SELECT
USING (can_manage_all_organizations(auth.uid()));

CREATE POLICY "Sales can manage all asset inventories"
ON public.asset_inventory FOR ALL
USING (can_manage_all_organizations(auth.uid()));