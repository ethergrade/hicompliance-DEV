-- Aggiorna tutti i task di remediation esistenti per assegnarli all'organizzazione dell'utente @sales
-- Questo risolve il problema delle modifiche non salvate dovuto a organization_id non corrispondente

UPDATE public.remediation_tasks
SET organization_id = '77c665c0-a9f1-4e9f-81ad-ba0bbe3c1223'
WHERE organization_id = '8112bd1d-5907-4292-af35-41db7bfbaf3a';

-- Aggiungi un commento per documentare questa correzione
COMMENT ON TABLE public.remediation_tasks IS 'Tasks di remediation per le organizzazioni. organization_id deve corrispondere all''organizzazione dell''utente per permettere le modifiche tramite RLS.';