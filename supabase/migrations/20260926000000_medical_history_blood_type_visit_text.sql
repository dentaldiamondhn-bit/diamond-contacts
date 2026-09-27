-- Medical history summary updates:
--   - last_dental_visit becomes free TEXT (sourced from patient-form
--     "Última visita al odontólogo", e.g. "6 meses").
--   - blood_type TEXT stores the patient-form "Tipo de sangre".
--   - user_id TEXT (denormalized from the owning contact, Clerk id) so the
--     realtime subscription can filter at the socket level instead of
--     broadcasting every history event to every connected client.

ALTER TABLE public.patient_medical_history
  ADD COLUMN IF NOT EXISTS blood_type TEXT;

ALTER TABLE public.patient_medical_history
  ALTER COLUMN last_dental_visit TYPE TEXT
  USING to_char(last_dental_visit AT TIME ZONE 'UTC', 'YYYY-MM-DD');

ALTER TABLE public.patient_medical_history
  ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Backfill existing rows from their owning contact.
UPDATE public.patient_medical_history h
SET user_id = c.user_id
FROM public.contacts c
WHERE h.contact_id = c.id
  AND h.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_patient_medical_history_user_id
  ON public.patient_medical_history (user_id);