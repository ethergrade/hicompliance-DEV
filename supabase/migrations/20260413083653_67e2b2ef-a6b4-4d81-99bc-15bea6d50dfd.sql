-- Add unique constraint for upsert
ALTER TABLE public.assessment_responses
ADD CONSTRAINT assessment_responses_question_org_unique
UNIQUE (question_id, organization_id);

-- Add delete policy for assessment responses
CREATE POLICY "Clients can delete their organization's responses"
ON public.assessment_responses
FOR DELETE
TO authenticated
USING (organization_id IN (
  SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Sales can delete all assessment responses"
ON public.assessment_responses
FOR DELETE
TO public
USING (can_manage_all_organizations(auth.uid()));