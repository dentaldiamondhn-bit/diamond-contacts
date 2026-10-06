-- 20261005: Clerk JWT RLS setup and schema hardening
--
-- Ownership model: every contact row carries a Clerk user id in `user_id`, and
-- RLS compares it to `auth.jwt() ->> 'sub'` (Clerk's reserved claim, set by the
-- `supabase` JWT template). The browser client runs on the ANON key, so without
-- these policies the public key can read AND delete every clinic's contacts.
--
-- Re-runnable: policies are dropped dynamically, not by hardcoded name.

-- 1. Ensure user_id exists on every table we own.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE contact_labels ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE contact_label_junction ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE contact_phones ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE contact_emails ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE patient_medical_history ADD COLUMN IF NOT EXISTS user_id TEXT;

-- 2. Enable Row-Level Security.
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_label_junction ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_medical_history ENABLE ROW LEVEL SECURITY;

-- 3. Drop EVERY existing policy on these tables.
--
-- The previous version of this migration dropped a hardcoded list of policy
-- names. The real legacy policies had different names, so permissive ones
-- survived and the strict policies below were OR'd with them: the anon key
-- could still read all clinics and an anon DELETE returned 200. Enumerating
-- pg_policies makes this robust to whatever the policies are actually called.
DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contacts',
    'contact_labels',
    'contact_label_junction',
    'contact_phones',
    'contact_emails',
    'patient_medical_history'
  ]
  LOOP
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = current_schema() AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- 4. Contacts.
--
-- No `OR user_id IS NULL` escape hatch: a row with no owner must not be
-- readable by every caller. Unowned rows are a data bug to fix upstream, not
-- something to expose. Run the recovery migration first if any exist.
CREATE POLICY contacts_select_own ON contacts
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY contacts_insert_own ON contacts
  FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY contacts_update_own ON contacts
  FOR UPDATE USING (auth.jwt() ->> 'sub' = user_id)
  WITH CHECK (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY contacts_delete_own ON contacts
  FOR DELETE USING (auth.jwt() ->> 'sub' = user_id);

-- 5. Labels.
CREATE POLICY labels_select_own ON contact_labels
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY labels_insert_own ON contact_labels
  FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY labels_update_own ON contact_labels
  FOR UPDATE USING (auth.jwt() ->> 'sub' = user_id)
  WITH CHECK (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY labels_delete_own ON contact_labels
  FOR DELETE USING (auth.jwt() ->> 'sub' = user_id);

-- 6. Junction.
--
-- Checked against BOTH owners: a policy that only checked the label would let a
-- caller staple their own label onto somebody else's contact.
CREATE POLICY junction_select_own ON contact_label_junction
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contact_labels cl
      WHERE cl.id = contact_label_junction.label_id
        AND auth.jwt() ->> 'sub' = cl.user_id
    )
    AND EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_label_junction.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
CREATE POLICY junction_insert_own ON contact_label_junction
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contact_labels cl
      WHERE cl.id = contact_label_junction.label_id
        AND auth.jwt() ->> 'sub' = cl.user_id
    )
    AND EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_label_junction.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
CREATE POLICY junction_update_own ON contact_label_junction
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM contact_labels cl
      WHERE cl.id = contact_label_junction.label_id
        AND auth.jwt() ->> 'sub' = cl.user_id
    )
    AND EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_label_junction.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
CREATE POLICY junction_delete_own ON contact_label_junction
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM contact_labels cl
      WHERE cl.id = contact_label_junction.label_id
        AND auth.jwt() ->> 'sub' = cl.user_id
    )
    AND EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_label_junction.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );

-- 7. Phones / emails, scoped through the owning contact.
CREATE POLICY phones_select_own ON contact_phones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_phones.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
CREATE POLICY phones_insert_own ON contact_phones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_phones.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
CREATE POLICY phones_update_own ON contact_phones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_phones.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
CREATE POLICY phones_delete_own ON contact_phones
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_phones.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );

CREATE POLICY emails_select_own ON contact_emails
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_emails.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
CREATE POLICY emails_insert_own ON contact_emails
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_emails.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
CREATE POLICY emails_update_own ON contact_emails
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_emails.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
CREATE POLICY emails_delete_own ON contact_emails
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_emails.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );

-- 8. Medical history, which is keyed by contact_id like phones/emails.
CREATE POLICY history_select_own ON patient_medical_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = patient_medical_history.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
CREATE POLICY history_insert_own ON patient_medical_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = patient_medical_history.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
CREATE POLICY history_update_own ON patient_medical_history
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = patient_medical_history.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
CREATE POLICY history_delete_own ON patient_medical_history
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = patient_medical_history.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );