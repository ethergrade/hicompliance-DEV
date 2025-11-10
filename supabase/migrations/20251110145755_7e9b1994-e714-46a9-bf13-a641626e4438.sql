-- Add new fields to asset_inventory table
ALTER TABLE public.asset_inventory
ADD COLUMN IF NOT EXISTS miscellaneous_network_devices_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS va_ip_punctual_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS va_subnet_25_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS va_subnet_24_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS va_subnet_23_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS va_subnet_22_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS va_subnet_21_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS va_total_ips_count integer DEFAULT 0;