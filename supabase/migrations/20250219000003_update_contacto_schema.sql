-- Migration to update contacto column to support new dropdown values
-- This ensures the database schema matches the new dropdown options

-- First, let's check the current column structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'patients' AND column_name = 'contacto';

-- The contacto column should already be a text type, which supports our dropdown values
-- No schema change needed since text can store all our dropdown options

-- However, let's add a check constraint to ensure only valid dropdown values are stored
-- (Optional - uncomment if you want database-level validation)
-- ALTER TABLE patients 
-- ADD CONSTRAINT contacto_check 
-- CHECK (contacto IN (
--   'Recomendación de amigo/familiar', 
--   'Recomendación de doctor/médico', 
--   'Facebook', 
--   'Instagram', 
--   'WhatsApp', 
--   'Llamada telefónica', 
--   'Google/Búsqueda web', 
--   'Página web', 
--   'Referido de otro paciente', 
--   'Publicidad/Folleto', 
--   'Otro'
-- ) OR contacto IS NULL OR contacto = '');

-- Verify the migration worked
SELECT 
    contacto,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM patients WHERE contacto IS NOT NULL AND contacto != ''), 2) as percentage
FROM patients 
WHERE contacto IS NOT NULL AND contacto != ''
GROUP BY contacto
ORDER BY count DESC;
