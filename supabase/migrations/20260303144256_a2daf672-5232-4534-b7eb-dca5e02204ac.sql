
-- Allow super_admin to delete organizations
CREATE POLICY "Super admins can delete organizations"
ON public.organizations
FOR DELETE
USING (has_role(auth.uid(), 'super_admin'));

-- Allow super_admin to create organizations (existing policy only checks user_type)
CREATE POLICY "Super admins can create organizations"
ON public.organizations
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Allow super_admin to update organizations
CREATE POLICY "Super admins can update all organizations"
ON public.organizations
FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'));
