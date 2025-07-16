-- Prima di tutto, creiamo una funzione per ottenere l'auth_user_id dell'utente corrente
-- e aggiornare il record admin esistente

-- Aggiorna il record admin esistente per collegarlo all'utente autenticato
-- NOTA: Questo script deve essere eseguito quando l'utente admin@admin.com è già autenticato
UPDATE public.users 
SET auth_user_id = auth.uid()
WHERE email = 'admin@admin.com' 
  AND auth_user_id IS NULL
  AND auth.uid() IS NOT NULL;