
-- Allow users to self-assign their initial role during first login
-- This is safe because it only allows assigning to their own auth.uid()
CREATE POLICY "Users can insert their own roles during signup"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND
  role IN ('sales', 'client')
);

-- Fix the existing sales user's auth_user_id
-- This will be executed once to fix the data
DO $$
DECLARE
  sales_auth_id uuid;
BEGIN
  -- Get the auth user id for sales@sales.com
  SELECT id INTO sales_auth_id
  FROM auth.users
  WHERE email = 'sales@sales.com';
  
  -- Update the users table
  IF sales_auth_id IS NOT NULL THEN
    UPDATE public.users
    SET auth_user_id = sales_auth_id
    WHERE email = 'sales@sales.com' AND auth_user_id IS NULL;
    
    -- Insert the sales role if it doesn't exist
    INSERT INTO public.user_roles (user_id, role)
    VALUES (sales_auth_id, 'sales')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
