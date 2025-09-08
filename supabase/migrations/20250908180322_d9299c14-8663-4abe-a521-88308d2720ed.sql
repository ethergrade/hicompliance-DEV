-- Create table for lead generation
CREATE TABLE public.lead_generation_index (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cognome TEXT NOT NULL,
  azienda TEXT NOT NULL,
  partita_iva TEXT NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.lead_generation_index ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to insert leads (public form)
CREATE POLICY "Anyone can create leads" 
ON public.lead_generation_index 
FOR INSERT 
WITH CHECK (true);

-- Create policy for admins to view all leads
CREATE POLICY "Admins can view all leads" 
ON public.lead_generation_index 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM users 
  WHERE auth_user_id = auth.uid() 
  AND user_type = 'admin'::user_type
));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_lead_generation_index_updated_at
BEFORE UPDATE ON public.lead_generation_index
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();