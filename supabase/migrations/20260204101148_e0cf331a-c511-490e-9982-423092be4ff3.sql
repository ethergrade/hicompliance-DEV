-- Create playbook_completions table for tracking playbook progress and completion dates
CREATE TABLE public.playbook_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  user_id UUID NOT NULL,
  playbook_id TEXT NOT NULL,
  playbook_title TEXT NOT NULL,
  playbook_category TEXT NOT NULL,
  playbook_severity TEXT NOT NULL,
  progress_percentage INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate playbook entries per user/org
CREATE UNIQUE INDEX idx_playbook_completions_unique 
ON public.playbook_completions (organization_id, user_id, playbook_id);

-- Create index for faster queries by organization
CREATE INDEX idx_playbook_completions_org 
ON public.playbook_completions (organization_id);

-- Create index for filtering by completion status
CREATE INDEX idx_playbook_completions_completed 
ON public.playbook_completions (completed_at) WHERE completed_at IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.playbook_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their organization's playbook completions
CREATE POLICY "Users can view their organization's playbook completions"
ON public.playbook_completions
FOR SELECT
USING (organization_id IN (
  SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()
));

-- RLS Policy: Users can insert playbook completions for their organization
CREATE POLICY "Users can insert playbook completions for their organization"
ON public.playbook_completions
FOR INSERT
WITH CHECK (organization_id IN (
  SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()
));

-- RLS Policy: Users can update their organization's playbook completions
CREATE POLICY "Users can update their organization's playbook completions"
ON public.playbook_completions
FOR UPDATE
USING (organization_id IN (
  SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()
));

-- RLS Policy: Users can delete their organization's playbook completions
CREATE POLICY "Users can delete their organization's playbook completions"
ON public.playbook_completions
FOR DELETE
USING (organization_id IN (
  SELECT users.organization_id FROM users WHERE users.auth_user_id = auth.uid()
));

-- Create trigger for automatic updated_at timestamp
CREATE TRIGGER update_playbook_completions_updated_at
BEFORE UPDATE ON public.playbook_completions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();