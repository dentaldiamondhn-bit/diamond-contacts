-- Contacts: drop ONLY the clinical / EHR-only columns.
--
-- Decision (per clinic): the contacts table keeps its CardDAV fields so the
-- vCard export continues to emit ORG (company), TITLE (job_title), ADR
-- (address) and BDAY (dob). Only the pure-clinical columns that are NOT
-- touched by either the vCard generator or the CardDAV export are removed.
--
-- Dropped: gender, insurance_provider, policy_number, blood_type
-- Kept (CardDAV): company, job_title, address, dob
--
-- Execute in: Supabase SQL Editor (or push via supabase db push).

ALTER TABLE public.contacts
  DROP COLUMN IF EXISTS gender,
  DROP COLUMN IF EXISTS insurance_provider,
  DROP COLUMN IF EXISTS policy_number,
  DROP COLUMN IF EXISTS blood_type;
