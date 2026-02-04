-- Add ciso_substitute column to organization_profiles table
ALTER TABLE public.organization_profiles 
ADD COLUMN ciso_substitute TEXT;