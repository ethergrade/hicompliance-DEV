-- Aggiungi campi per gestire l'ordine, visibilità e eliminazione dei task
ALTER TABLE public.remediation_tasks 
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Crea indici per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_remediation_tasks_display_order ON public.remediation_tasks(display_order);
CREATE INDEX IF NOT EXISTS idx_remediation_tasks_is_hidden ON public.remediation_tasks(is_hidden);
CREATE INDEX IF NOT EXISTS idx_remediation_tasks_is_deleted ON public.remediation_tasks(is_deleted);