-- Allow admin users full access to assessment_responses
CREATE POLICY "Admins can manage all assessment responses"
ON public.assessment_responses
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
    AND users.user_type = 'admin'::user_type
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
    AND users.user_type = 'admin'::user_type
  )
);

-- Drop the old read-only admin policy since the new one covers SELECT too
DROP POLICY IF EXISTS "Admins can view all assessment responses" ON public.assessment_responses;