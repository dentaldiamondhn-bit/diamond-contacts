-- Contact profile fields used by the split-pane detail view (personal info +
-- clinical metadata placeholders).
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS insurance_provider TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS policy_number TEXT;