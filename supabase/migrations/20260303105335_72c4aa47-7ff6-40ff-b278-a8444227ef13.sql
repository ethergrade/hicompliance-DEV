
-- Create ai_ciso_conversations table
CREATE TABLE public.ai_ciso_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text DEFAULT 'Nuova conversazione',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_ciso_conversations ENABLE ROW LEVEL SECURITY;

-- Only super_admin can access their own conversations
CREATE POLICY "Super admins can view own conversations"
ON public.ai_ciso_conversations
FOR SELECT
USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert own conversations"
ON public.ai_ciso_conversations
FOR INSERT
WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update own conversations"
ON public.ai_ciso_conversations
FOR UPDATE
USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete own conversations"
ON public.ai_ciso_conversations
FOR DELETE
USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'super_admin'));

-- Trigger for updated_at
CREATE TRIGGER update_ai_ciso_conversations_updated_at
BEFORE UPDATE ON public.ai_ciso_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
