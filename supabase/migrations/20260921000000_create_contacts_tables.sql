-- Contactos (Google-Contacts-style directory) with local-first / offline support.
--
-- Layout:
--   contacts                  -> soft-deletable master records (one per person)
--   contact_phones / emails   -> multi-value child rows (mobile, work, home, ...)
--   contact_labels            -> user-scoped label definitions (e.g. "VIP", "Referido")
--   contact_label_junction    -> M:N link between contacts and labels
--
-- Real-time is enabled on the three tables that the sync engine watches, with
-- REPLICA IDENTITY FULL so UPDATE/DELETE payloads carry the full row.
--
-- RLS follows this project's convention (permissive for anon + authenticated,
-- authorization enforced in route handlers via Clerk + user_id scoping queries).

-- Contacts ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  patient_id  UUID REFERENCES public.patients (paciente_id) ON DELETE SET NULL,
  first_name  TEXT,
  last_name   TEXT,
  company     TEXT,
  job_title   TEXT,
  notes       TEXT,
  avatar_url  TEXT,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_patient_id ON public.contacts (patient_id);
CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON public.contacts (updated_at);
CREATE INDEX IF NOT EXISTS idx_contacts_soft_deleted ON public.contacts (deleted_at) WHERE deleted_at IS NOT NULL;

-- Phone numbers --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_phones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   UUID NOT NULL REFERENCES public.contacts (id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'mobile',
  phone_number TEXT NOT NULL,
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_contact_phones_contact_id ON public.contact_phones (contact_id);

-- Emails ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts (id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'work',
  email      TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_contact_emails_contact_id ON public.contact_emails (contact_id);

-- Labels ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_labels (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL DEFAULT '#6B7280',
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_contact_labels_user_id ON public.contact_labels (user_id);

CREATE TABLE IF NOT EXISTS public.contact_label_junction (
  contact_id UUID NOT NULL REFERENCES public.contacts (id) ON DELETE CASCADE,
  label_id   UUID NOT NULL REFERENCES public.contact_labels (id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_label_junction_label_id ON public.contact_label_junction (label_id);

-- ROW LEVEL SECURITY ----------------------------------------------------------
-- Same convention as the rest of the clinic tables: anon + authenticated roles
-- can read/write (the anon key is used by the browser client; fine-grained
-- authorization is enforced at the route/service layer via Clerk user_id).
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_label_junction ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_all_clinic_roles" ON public.contacts;
CREATE POLICY "contacts_all_clinic_roles" ON public.contacts
  FOR ALL USING (auth.role() IN ('authenticated', 'anon'))
  WITH CHECK (auth.role() IN ('authenticated', 'anon'));

DROP POLICY IF EXISTS "contact_phones_all_clinic_roles" ON public.contact_phones;
CREATE POLICY "contact_phones_all_clinic_roles" ON public.contact_phones
  FOR ALL USING (auth.role() IN ('authenticated', 'anon'))
  WITH CHECK (auth.role() IN ('authenticated', 'anon'));

DROP POLICY IF EXISTS "contact_emails_all_clinic_roles" ON public.contact_emails;
CREATE POLICY "contact_emails_all_clinic_roles" ON public.contact_emails
  FOR ALL USING (auth.role() IN ('authenticated', 'anon'))
  WITH CHECK (auth.role() IN ('authenticated', 'anon'));

DROP POLICY IF EXISTS "contact_labels_all_clinic_roles" ON public.contact_labels;
CREATE POLICY "contact_labels_all_clinic_roles" ON public.contact_labels
  FOR ALL USING (auth.role() IN ('authenticated', 'anon'))
  WITH CHECK (auth.role() IN ('authenticated', 'anon'));

DROP POLICY IF EXISTS "contact_label_junction_all_clinic_roles" ON public.contact_label_junction;
CREATE POLICY "contact_label_junction_all_clinic_roles" ON public.contact_label_junction
  FOR ALL USING (auth.role() IN ('authenticated', 'anon'))
  WITH CHECK (auth.role() IN ('authenticated', 'anon'));

-- REALTIME ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contact_phones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_phones;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contact_emails'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_emails;
  END IF;
END
$$;

-- Full replica identity: UPDATE/DELETE broadcasts must carry the whole row so
-- clients can reconcile locally.
ALTER TABLE public.contacts REPLICA IDENTITY FULL;
ALTER TABLE public.contact_phones REPLICA IDENTITY FULL;
ALTER TABLE public.contact_emails REPLICA IDENTITY FULL;