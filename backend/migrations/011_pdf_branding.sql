-- 011_pdf_branding.sql — branding fields for PDF document headers.
-- Apply in the Supabase SQL editor (migrations are applied manually in this project).
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS registration_number text;
ALTER TABLE staff   ADD COLUMN IF NOT EXISTS registration_number text;

