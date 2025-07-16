-- Aggiungi campi per gestire l'ordine, visibilità e eliminazione dei task
ALTER TABLE public.remediation_tasks 
ADD COLUMN display_order INTEGER DEFAULT 0,
ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE,
ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;

-- Crea indici per migliorare le performance
CREATE INDEX idx_remediation_tasks_display_order ON public.remediation_tasks(display_order);
CREATE INDEX idx_remediation_tasks_is_hidden ON public.remediation_tasks(is_hidden);
CREATE INDEX idx_remediation_tasks_is_deleted ON public.remediation_tasks(is_deleted);

-- Aggiungi un trigger per aggiornare automaticamente updated_at
CREATE TRIGGER update_remediation_tasks_updated_at
BEFORE UPDATE ON public.remediation_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();