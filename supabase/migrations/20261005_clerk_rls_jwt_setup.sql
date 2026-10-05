-- 20261005: Clerk JWT RLS setup and schema hardening
-- 1. Ensure user_id column exists across all target tables
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE contact_labels ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE contact_label_junction ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE contact_phones ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE contact_emails ADD COLUMN IF NOT EXISTS user_id TEXT;

-- 2. Enable Row-Level Security
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_label_junction ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_emails ENABLE ROW LEVEL SECURITY;

-- 3. Drop legacy loose policies
DROP POLICY IF EXISTS "Users can read own contacts" ON contacts;
DROP POLICY IF EXISTS "Users can insert own contacts" ON contacts;
DROP POLICY IF EXISTS "Users can update own contacts" ON contacts;
DROP POLICY IF EXISTS "Users can delete own contacts" ON contacts;

DROP POLICY IF EXISTS "Contacts Select Policy" ON contacts;
DROP POLICY IF EXISTS "Contacts Insert Policy" ON contacts;
DROP POLICY IF EXISTS "Contacts Update Policy" ON contacts;
DROP POLICY IF EXISTS "Contacts Delete Policy" ON contacts;

DROP POLICY IF EXISTS "Labels Select Policy" ON contact_labels;
DROP POLICY IF EXISTS "Labels Insert Policy" ON contact_labels;
DROP POLICY IF EXISTS "Labels Update Policy" ON contact_labels;
DROP POLICY IF EXISTS "Labels Delete Policy" ON contact_labels;

DROP POLICY IF EXISTS "Labels Select Policy" ON contact_label_junction;
DROP POLICY IF EXISTS "Labels Insert Policy" ON contact_label_junction;
DROP POLICY IF EXISTS "Labels Update Policy" ON contact_label_junction;
DROP POLICY IF EXISTS "Labels Delete Policy" ON contact_label_junction;

DROP POLICY IF EXISTS "Phones Select Policy" ON contact_phones;
DROP POLICY IF EXISTS "Phones Insert Policy" ON contact_phones;
DROP POLICY IF EXISTS "Phones Update Policy" ON contact_phones;
DROP POLICY IF EXISTS "Phones Delete Policy" ON contact_phones;

DROP POLICY IF EXISTS "Emails Select Policy" ON contact_emails;
DROP POLICY IF EXISTS "Emails Insert Policy" ON contact_emails;
DROP POLICY IF EXISTS "Emails Update Policy" ON contact_emails;
DROP POLICY IF EXISTS "Emails Delete Policy" ON contact_emails;

-- 4. Contacts policies
CREATE POLICY "Contacts Select Policy" ON contacts
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id OR user_id IS NULL);

CREATE POLICY "Contacts Insert Policy" ON contacts
  FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Contacts Update Policy" ON contacts
  FOR UPDATE USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Contacts Delete Policy" ON contacts
  FOR DELETE USING (auth.jwt() ->> 'sub' = user_id);

-- 5. Labels policies
CREATE POLICY "Labels Select Policy" ON contact_labels
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id OR user_id IS NULL);

CREATE POLICY "Labels Insert Policy" ON contact_labels
  FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Labels Update Policy" ON contact_labels
  FOR UPDATE USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Labels Delete Policy" ON contact_labels
  FOR DELETE USING (auth.jwt() ->> 'sub' = user_id);

-- 6. Junction policies
CREATE POLICY "Junction Select Policy" ON contact_label_junction
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contact_labels cl
      WHERE cl.id = contact_label_junction.label_id
        AND (auth.jwt() ->> 'sub' = cl.user_id OR cl.user_id IS NULL)
    )
  );

CREATE POLICY "Junction Insert Policy" ON contact_label_junction
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contact_labels cl
      WHERE cl.id = contact_label_junction.label_id
        AND auth.jwt() ->> 'sub' = cl.user_id
    )
  );

CREATE POLICY "Junction Update Policy" ON contact_label_junction
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM contact_labels cl
      WHERE cl.id = contact_label_junction.label_id
        AND auth.jwt() ->> 'sub' = cl.user_id
    )
  );

CREATE POLICY "Junction Delete Policy" ON contact_label_junction
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM contact_labels cl
      WHERE cl.id = contact_label_junction.label_id
        AND auth.jwt() ->> 'sub' = cl.user_id
    )
  );

-- 7. Phones policies
CREATE POLICY "Phones Select Policy" ON contact_phones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_phones.contact_id
        AND (auth.jwt() ->> 'sub' = c.user_id OR c.user_id IS NULL)
    )
  );

CREATE POLICY "Phones Insert Policy" ON contact_phones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_phones.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );

CREATE POLICY "Phones Update Policy" ON contact_phones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_phones.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );

CREATE POLICY "Phones Delete Policy" ON contact_phones
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_phones.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );

-- 8. Emails policies
CREATE POLICY "Emails Select Policy" ON contact_emails
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_emails.contact_id
        AND (auth.jwt() ->> 'sub' = c.user_id OR c.user_id IS NULL)
    )
  );

CREATE POLICY "Emails Insert Policy" ON contact_emails
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_emails.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );

CREATE POLICY "Emails Update Policy" ON contact_emails
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_emails.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );

CREATE POLICY "Emails Delete Policy" ON contact_emails
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_emails.contact_id
        AND auth.jwt() ->> 'sub' = c.user_id
    )
  );
