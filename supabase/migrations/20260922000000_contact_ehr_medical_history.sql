-- Patient EHR deep-linking + Medical History summary for the contacts module.
--
--   contacts.patient_medical_history -> 1:1 clinical summary per contact keyed
--     on contact_id (allergies, chronic conditions, current medications).
--
-- RLS and realtime follow the existing contacts convention (permissive for
-- anon + authenticated; authorization enforced at the route/service layer via
-- Clerk user_id + contacts.user_id scoping).

-- Blood type lives on the contact (shown in Información). ---------------------
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS blood_type TEXT;

-- Medical history summary (1:1 with a contact) --------------------------------
CREATE TABLE IF NOT EXISTS public.patient_medical_history (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id           UUID NOT NULL REFERENCES public.contacts (id) ON DELETE CASCADE,
  allergies            TEXT[] NOT NULL DEFAULT '{}',
  chronic_conditions   TEXT[] NOT NULL DEFAULT '{}',
  current_medications  TEXT[] NOT NULL DEFAULT '{}',
  odontogram_notes     TEXT,
  last_dental_visit    TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_medical_history_contact_id ON public.patient_medical_history (contact_id);
CREATE INDEX IF NOT EXISTS idx_patient_medical_history_updated_at ON public.patient_medical_history (updated_at);

-- ROW LEVEL SECURITY ----------------------------------------------------------
-- Same convention as the base contacts schema: RLS is permissive and the
-- route/service layer enforces user scoping (contacts.user_id).
ALTER TABLE public.patient_medical_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_medical_history_all_clinic_roles" ON public.patient_medical_history;
CREATE POLICY "patient_medical_history_all_clinic_roles" ON public.patient_medical_history
  FOR ALL USING (auth.role() IN ('authenticated', 'anon'))
  WITH CHECK (auth.role() IN ('authenticated', 'anon'));

-- REALTIME --------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'patient_medical_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_medical_history;
  END IF;
END
$$;

ALTER TABLE public.patient_medical_history REPLICA IDENTITY FULL;