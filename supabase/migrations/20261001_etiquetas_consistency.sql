-- Etiquetas (contact_labels) consistency pass — 20261001.
--
-- Closes the cross-device consistency gaps that the original contacts
-- migration (20260921) left open:
--
--   1. contact_labels has no updated_at -> clients can't tell a rename/recolor
--      apart from stale data, and last-write-wins has no ordering signal.
--      Adds the column (backfilled NOW()) plus a bump trigger.
--
--   2. contact_labels / contact_label_junction are NOT in supabase_realtime
--      (the client's socket only watches contacts + patient_medical_history),
--      so etiqueta changes made on one device reach others only on the next
--      full pull. Wires both tables into the publication with REPLICA IDENTITY
--      FULL (full payload rows for UPDATE/DELETE, same as the other synced
--      tables) so label edits push live.
--
--   3. contact_label_junction has no user_id, so a realtime filter
--      user_id=eq.<me> can't be applied at the socket and every clinic's
--      junction changes would reach this client's connection. Denormalizes
--      user_id (same pattern as patient_medical_history in 20260926) with a
--      BEFORE INSERT/UPDATE trigger sourced from the owning contact_labels row,
--      then backfills existing rows. Sync-engine junction writes need no app
--      change: the trigger fills the column.
--
-- RLS stays permissive (anon/authenticated), identical to the original file;
-- authorization continues to be enforced in route/service layers via Clerk.

-- Table existence guards (mirror 20260921 schema, no-ops when already present).
CREATE TABLE IF NOT EXISTS public.contact_labels (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL DEFAULT '#6B7280',
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS public.contact_label_junction (
  contact_id UUID NOT NULL REFERENCES public.contacts (id) ON DELETE CASCADE,
  label_id   UUID NOT NULL REFERENCES public.contact_labels (id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, label_id)
);

-- 1) updated_at on contact_labels -------------------------------------------
ALTER TABLE public.contact_labels
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_contact_labels_user_id ON public.contact_labels (user_id);
CREATE INDEX IF NOT EXISTS idx_contact_label_junction_label_id ON public.contact_label_junction (label_id);

CREATE OR REPLACE FUNCTION public.touch_contact_labels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contact_labels_updated_at ON public.contact_labels;
CREATE TRIGGER trg_contact_labels_updated_at
  BEFORE UPDATE ON public.contact_labels
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_contact_labels_updated_at();

-- 3) user_id denormalized on the junction -------------------------------------
ALTER TABLE public.contact_label_junction
  ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.set_contact_label_junction_user_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT user_id INTO NEW.user_id
    FROM public.contact_labels
   WHERE id = NEW.label_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contact_label_junction_user_id ON public.contact_label_junction;
CREATE TRIGGER trg_contact_label_junction_user_id
  BEFORE INSERT OR UPDATE OF label_id ON public.contact_label_junction
  FOR EACH ROW
  EXECUTE FUNCTION public.set_contact_label_junction_user_id();

-- Backfill rows created before the trigger existed.
UPDATE public.contact_label_junction j
   SET user_id = l.user_id
  FROM public.contact_labels l
 WHERE l.id = j.label_id
   AND (j.user_id = '' OR j.user_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_contact_label_junction_user_id ON public.contact_label_junction (user_id);

-- 2) realtime + replica identity for the two label tables ----------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contact_labels'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_labels;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contact_label_junction'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_label_junction;
  END IF;
END
$$;

ALTER TABLE public.contact_labels REPLICA IDENTITY FULL;
ALTER TABLE public.contact_label_junction REPLICA IDENTITY FULL;

-- Re-assert RLS (idempotent), same convention as 20260921.
ALTER TABLE public.contact_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_label_junction ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_labels_all_clinic_roles" ON public.contact_labels;
CREATE POLICY "contact_labels_all_clinic_roles" ON public.contact_labels
  FOR ALL USING (auth.role() IN ('authenticated', 'anon'))
  WITH CHECK (auth.role() IN ('authenticated', 'anon'));

DROP POLICY IF EXISTS "contact_label_junction_all_clinic_roles" ON public.contact_label_junction;
CREATE POLICY "contact_label_junction_all_clinic_roles" ON public.contact_label_junction
  FOR ALL USING (auth.role() IN ('authenticated', 'anon'))
  WITH CHECK (auth.role() IN ('authenticated', 'anon'));