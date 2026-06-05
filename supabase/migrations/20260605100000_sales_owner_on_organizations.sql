-- Migration: aggiungi sales_owner_user_id a organizations
-- Permette di associare un utente con ruolo 'sales' a ogni cliente
-- per il modulo Dashboard Sales (/admin/sales)

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS sales_owner_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_sales_owner
  ON public.organizations(sales_owner_user_id)
  WHERE sales_owner_user_id IS NOT NULL;

-- View aggregata per la dashboard sales:
-- mostra statistiche remediation per cliente e sales owner
CREATE OR REPLACE VIEW public.v_sales_remediation_dashboard AS
SELECT
  o.id                          AS organization_id,
  o.name                        AS organization_name,
  o.code                        AS organization_code,
  o.sales_owner_user_id,
  u.email                       AS sales_owner_email,
  COALESCE(rt.total_tasks,    0) AS total_tasks,
  COALESCE(rt.completed_tasks,0) AS completed_tasks,
  COALESCE(rt.critical_tasks, 0) AS critical_tasks,
  COALESCE(rt.high_tasks,     0) AS high_tasks,
  COALESCE(rt.medium_tasks,   0) AS medium_tasks,
  COALESCE(rt.low_tasks,      0) AS low_tasks,
  COALESCE(rt.avg_progress,   0) AS avg_progress,
  COALESCE(rt.overdue_tasks,  0) AS overdue_tasks
FROM public.organizations o
LEFT JOIN auth.users u ON u.id = o.sales_owner_user_id
LEFT JOIN (
  SELECT
    organization_id,
    COUNT(*) FILTER (WHERE NOT COALESCE(is_deleted,false) AND NOT COALESCE(is_hidden,false))
      AS total_tasks,
    COUNT(*) FILTER (WHERE NOT COALESCE(is_deleted,false) AND NOT COALESCE(is_hidden,false) AND progress >= 100)
      AS completed_tasks,
    COUNT(*) FILTER (WHERE NOT COALESCE(is_deleted,false) AND NOT COALESCE(is_hidden,false) AND priority = 'critical')
      AS critical_tasks,
    COUNT(*) FILTER (WHERE NOT COALESCE(is_deleted,false) AND NOT COALESCE(is_hidden,false) AND priority = 'high')
      AS high_tasks,
    COUNT(*) FILTER (WHERE NOT COALESCE(is_deleted,false) AND NOT COALESCE(is_hidden,false) AND priority = 'medium')
      AS medium_tasks,
    COUNT(*) FILTER (WHERE NOT COALESCE(is_deleted,false) AND NOT COALESCE(is_hidden,false) AND priority = 'low')
      AS low_tasks,
    ROUND(AVG(COALESCE(progress,0)) FILTER (WHERE NOT COALESCE(is_deleted,false) AND NOT COALESCE(is_hidden,false)))
      AS avg_progress,
    COUNT(*) FILTER (WHERE NOT COALESCE(is_deleted,false) AND NOT COALESCE(is_hidden,false)
      AND end_date < CURRENT_DATE AND progress < 100)
      AS overdue_tasks
  FROM public.remediation_tasks
  GROUP BY organization_id
) rt ON rt.organization_id = o.id;

COMMENT ON COLUMN public.organizations.sales_owner_user_id
  IS 'Utente HiSolution con ruolo sales responsabile del cliente';
