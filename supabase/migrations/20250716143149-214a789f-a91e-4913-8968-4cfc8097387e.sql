-- Collega l'utente admin@admin.com all'auth_user_id quando è autenticato
UPDATE public.users 
SET auth_user_id = auth.uid()
WHERE email = 'admin@admin.com' 
  AND auth_user_id IS NULL
  AND auth.uid() IS NOT NULL;