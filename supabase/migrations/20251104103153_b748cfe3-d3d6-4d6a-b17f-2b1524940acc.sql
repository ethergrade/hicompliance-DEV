-- Aggiornare RLS policies per dark_risk_alerts: permettere agli admin di gestire tutti gli alert dell'organizzazione

-- Rimuovere le vecchie policies
DROP POLICY IF EXISTS "Users can view their own alerts" ON public.dark_risk_alerts;
DROP POLICY IF EXISTS "Users can create their own alerts" ON public.dark_risk_alerts;
DROP POLICY IF EXISTS "Users can update their own alerts" ON public.dark_risk_alerts;
DROP POLICY IF EXISTS "Users can delete their own alerts" ON public.dark_risk_alerts;

-- Nuove policies per SELECT: utenti vedono i propri, admin vedono tutti dell'organizzazione
CREATE POLICY "Users can view their own alerts"
  ON public.dark_risk_alerts FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR 
    (
      organization_id IN (
        SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() AND user_type = 'admin'
      )
    )
  );

-- Nuove policies per INSERT: utenti creano i propri, admin creano per chiunque nell'organizzazione
CREATE POLICY "Users can create alerts"
  ON public.dark_risk_alerts FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    (
      organization_id IN (
        SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() AND user_type = 'admin'
      )
    )
  );

-- Nuove policies per UPDATE: utenti aggiornano i propri, admin aggiornano tutti dell'organizzazione
CREATE POLICY "Users can update alerts"
  ON public.dark_risk_alerts FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    (
      organization_id IN (
        SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() AND user_type = 'admin'
      )
    )
  );

-- Nuove policies per DELETE: utenti eliminano i propri, admin eliminano tutti dell'organizzazione
CREATE POLICY "Users can delete alerts"
  ON public.dark_risk_alerts FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    (
      organization_id IN (
        SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() AND user_type = 'admin'
      )
    )
  );

-- Aggiornare RLS policies per surface_scan_alerts: permettere agli admin di gestire tutti gli alert dell'organizzazione

-- Rimuovere le vecchie policies
DROP POLICY IF EXISTS "Users can view their own alerts" ON public.surface_scan_alerts;
DROP POLICY IF EXISTS "Users can create their own alerts" ON public.surface_scan_alerts;
DROP POLICY IF EXISTS "Users can update their own alerts" ON public.surface_scan_alerts;
DROP POLICY IF EXISTS "Users can delete their own alerts" ON public.surface_scan_alerts;

-- Nuove policies per SELECT: utenti vedono i propri, admin vedono tutti dell'organizzazione
CREATE POLICY "Users can view their own alerts"
  ON public.surface_scan_alerts FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR 
    (
      organization_id IN (
        SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() AND user_type = 'admin'
      )
    )
  );

-- Nuove policies per INSERT: utenti creano i propri, admin creano per chiunque nell'organizzazione
CREATE POLICY "Users can create alerts"
  ON public.surface_scan_alerts FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    (
      organization_id IN (
        SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() AND user_type = 'admin'
      )
    )
  );

-- Nuove policies per UPDATE: utenti aggiornano i propri, admin aggiornano tutti dell'organizzazione
CREATE POLICY "Users can update alerts"
  ON public.surface_scan_alerts FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    (
      organization_id IN (
        SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() AND user_type = 'admin'
      )
    )
  );

-- Nuove policies per DELETE: utenti eliminano i propri, admin eliminano tutti dell'organizzazione
CREATE POLICY "Users can delete alerts"
  ON public.surface_scan_alerts FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    (
      organization_id IN (
        SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() AND user_type = 'admin'
      )
    )
  );