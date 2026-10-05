-- 20261005: Restore default labels and backfill user_id for orphaned rows
DO $$
BEGIN
  -- Backfill contacts missing user_id
  UPDATE contacts 
  SET user_id = 'user_3JKYlHsLkva168dVRnaWKxfU17d'
  WHERE user_id IS NULL OR user_id = '';

  -- Backfill labels missing user_id
  UPDATE contact_labels
  SET user_id = 'user_3JKYlHsLkva168dVRnaWKxfU17d'
  WHERE user_id IS NULL OR user_id = '';
END $$;

-- Insert default clinic labels if missing
INSERT INTO contact_labels (id, user_id, name, color, updated_at)
VALUES
  (gen_random_uuid(), 'user_3JKYlHsLkva168dVRnaWKxfU17d', 'En Tratamiento', '#10B981', NOW()),
  (gen_random_uuid(), 'user_3JKYlHsLkva168dVRnaWKxfU17d', 'Pacientes Activos', '#3B82F6', NOW()),
  (gen_random_uuid(), 'user_3JKYlHsLkva168dVRnaWKxfU17d', 'Seguros', '#F59E0B', NOW()),
  (gen_random_uuid(), 'user_3JKYlHsLkva168dVRnaWKxfU17d', 'VIP', '#8B5CF6', NOW())
ON CONFLICT DO NOTHING;

-- Ensure junction rows inherit ownership via labels/contacts (already referenced)
-- Backfill junction label owner consistency if needed
UPDATE contact_label_junction j
SET user_id = cl.user_id
FROM contact_labels cl
WHERE j.label_id = cl.id AND (j.user_id IS NULL OR j.user_id = '');

-- Backfill phones/emails ownership if missing
UPDATE contact_phones p
SET user_id = c.user_id
FROM contacts c
WHERE p.contact_id = c.id AND (p.user_id IS NULL OR p.user_id = '');

UPDATE contact_emails e
SET user_id = c.user_id
FROM contacts c
WHERE e.contact_id = c.id AND (e.user_id IS NULL OR e.user_id = '');
