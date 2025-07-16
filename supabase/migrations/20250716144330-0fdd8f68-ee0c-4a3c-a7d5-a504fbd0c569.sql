-- Collega l'utente admin@admin.com all'auth_user_id se è autenticato
UPDATE public.users 
SET auth_user_id = (
  SELECT id FROM auth.users WHERE email = 'admin@admin.com' LIMIT 1
)
WHERE email = 'admin@admin.com' 
  AND auth_user_id IS NULL;

-- Aggiungi policy per permettere agli admin di creare organizzazioni
CREATE POLICY "Admins can create organizations" 
ON public.organizations 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users 
    WHERE auth_user_id = auth.uid() 
    AND user_type = 'admin'
  )
);