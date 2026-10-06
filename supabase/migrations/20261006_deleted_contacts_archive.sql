-- 20261006: `deleted_contacts` archive table
--
-- Permanent delete used to run `DELETE FROM contacts`, which cascaded through
-- contact_phones / contact_emails / patient_medical_history and destroyed the
-- only copy of the contact (this is how a contact was lost earlier). The UI has
-- no separate "deleted contacts" store, so there was nothing to recover from.
--
-- This table receives a full JSON snapshot immediately BEFORE a permanent
-- delete. The write is best-effort from the client: it must never block the
-- user's delete, but when it succeeds the row is preserved here forever.
--
-- Ownership mirrors the contacts tables: `user_id` is the Clerk user id and RLS
-- compares it to `auth.jwt() ->> 'sub'`.

CREATE TABLE IF NOT EXISTS public.deleted_contacts (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  full_name TEXT,
  deleted_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Complete snapshot: { contact: <local contact + phones/emails/label_ids>,
  -- medical_history: <row or null> }. JSONB so the archive survives schema
  -- changes to `contacts` without another migration.
  snapshot JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deleted_contacts_user_id ON public.deleted_contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_deleted_contacts_archived_at ON public.deleted_contacts (archived_at DESC);

-- Row-Level Security: owner-only. Re-runnable, like the other migrations.
ALTER TABLE public.deleted_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deleted_contacts_select_own ON public.deleted_contacts;
DROP POLICY IF EXISTS deleted_contacts_insert_own ON public.deleted_contacts;
DROP POLICY IF EXISTS deleted_contacts_delete_own ON public.deleted_contacts;

CREATE POLICY deleted_contacts_select_own ON public.deleted_contacts
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY deleted_contacts_insert_own ON public.deleted_contacts
  FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY deleted_contacts_delete_own ON public.deleted_contacts
  FOR DELETE USING (auth.jwt() ->> 'sub' = user_id);

-- The browser client runs as the `authenticated` Postgres role (from the JWT
-- `role` claim); service_role is used by server tooling. No anon access.
GRANT SELECT, INSERT, DELETE ON public.deleted_contacts TO authenticated;
GRANT ALL ON public.deleted_contacts TO service_role;