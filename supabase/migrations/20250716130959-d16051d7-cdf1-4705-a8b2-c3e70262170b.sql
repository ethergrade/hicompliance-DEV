-- Aggiorna il record dell'utente admin@admin.com collegandolo all'utente autenticato
UPDATE public.users 
SET auth_user_id = auth.uid()
WHERE email = 'admin@admin.com' 
  AND auth_user_id IS NULL
  AND auth.uid() IS NOT NULL;