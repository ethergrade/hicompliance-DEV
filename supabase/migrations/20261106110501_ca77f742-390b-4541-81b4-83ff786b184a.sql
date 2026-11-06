ALTER TABLE public.incident_documents
  ADD COLUMN IF NOT EXISTS review_due_date date,
  ADD COLUMN IF NOT EXISTS review_notify_email text,
  ADD COLUMN IF NOT EXISTS review_notified_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_incident_documents_review_due ON public.incident_documents(review_due_date) WHERE review_due_date IS NOT NULL;