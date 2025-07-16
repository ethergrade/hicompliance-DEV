-- Create remediation_tasks table for storing task data
CREATE TABLE public.remediation_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID,
  task TEXT NOT NULL,
  category TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  assignee TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  dependencies TEXT[] DEFAULT '{}',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.remediation_tasks ENABLE ROW LEVEL SECURITY;

-- Create policies for remediation_tasks
CREATE POLICY "Users can view their organization's remediation tasks" 
ON public.remediation_tasks 
FOR SELECT 
USING (organization_id IN (
  SELECT users.organization_id 
  FROM users 
  WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can create remediation tasks for their organization" 
ON public.remediation_tasks 
FOR INSERT 
WITH CHECK (organization_id IN (
  SELECT users.organization_id 
  FROM users 
  WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can update their organization's remediation tasks" 
ON public.remediation_tasks 
FOR UPDATE 
USING (organization_id IN (
  SELECT users.organization_id 
  FROM users 
  WHERE users.auth_user_id = auth.uid()
));

CREATE POLICY "Users can delete their organization's remediation tasks" 
ON public.remediation_tasks 
FOR DELETE 
USING (organization_id IN (
  SELECT users.organization_id 
  FROM users 
  WHERE users.auth_user_id = auth.uid()
));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_remediation_tasks_updated_at
BEFORE UPDATE ON public.remediation_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();