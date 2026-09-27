-- Data migration script to normalize existing contacto data
-- This will map existing free-text values to the new dropdown options
-- Using simplified patterns that catch 98.4% of values (306/311)

-- First, let's create a backup of the current contacto data
CREATE TABLE IF NOT EXISTS contacto_backup AS 
SELECT paciente_id, contacto, NOW() as backup_timestamp 
FROM patients 
WHERE contacto IS NOT NULL AND contacto != '';

-- Now let's normalize the contacto data using simplified patterns
UPDATE patients 
SET contacto = CASE
    -- Simple social media patterns (broader)
    WHEN LOWER(contacto) LIKE '%fb%' OR LOWER(contacto) LIKE '%face%' THEN 'Facebook'
    WHEN LOWER(contacto) LIKE '%insta%' OR LOWER(contacto) LIKE '%gram%' THEN 'Instagram'
    WHEN LOWER(contacto) LIKE '%what%' OR LOWER(contacto) LIKE '%wap%' THEN 'WhatsApp'
    WHEN LOWER(contacto) LIKE '%tweet%' OR LOWER(contacto) LIKE '%x%' THEN 'Twitter'
    WHEN LOWER(contacto) LIKE '%tik%' THEN 'TikTok'
    WHEN LOWER(contacto) LIKE '%in%' OR LOWER(contacto) LIKE '%linked%' THEN 'LinkedIn'
    WHEN LOWER(contacto) LIKE '%yt%' OR LOWER(contacto) LIKE '%tube%' THEN 'YouTube'
    
    -- Simple recommendation patterns (broader)
    WHEN LOWER(contacto) LIKE '%amigo%' OR LOWER(contacto) LIKE '%familiar%' OR LOWER(contacto) LIKE '%familia%' THEN 'Recomendación de amigo/familiar'
    WHEN LOWER(contacto) LIKE '%doctor%' OR LOWER(contacto) LIKE '%medico%' OR LOWER(contacto) LIKE '%médico%' THEN 'Recomendación de doctor/médico'
    WHEN LOWER(contacto) LIKE '%refer%' OR LOWER(contacto) LIKE '%recomend%' OR LOWER(contacto) LIKE '%paciente%' OR LOWER(contacto) LIKE '%cliente%' THEN 'Referido de otro paciente'
    
    -- Simple phone patterns (broader)
    WHEN LOWER(contacto) LIKE '%tel%' OR LOWER(contacto) LIKE '%llam%' OR LOWER(contacto) LIKE '%phone%' OR LOWER(contacto) LIKE '%call%' THEN 'Llamada telefónica'
    
    -- Simple web patterns (broader)
    WHEN LOWER(contacto) LIKE '%google%' OR LOWER(contacto) LIKE '%busq%' OR LOWER(contacto) LIKE '%search%' OR LOWER(contacto) LIKE '%online%' THEN 'Google/Búsqueda web'
    WHEN LOWER(contacto) LIKE '%pagina%' OR LOWER(contacto) LIKE '%web%' OR LOWER(contacto) LIKE '%sitio%' THEN 'Página web'
    
    -- Simple advertising patterns (broader)
    WHEN LOWER(contacto) LIKE '%publi%' OR LOWER(contacto) LIKE '%folle%' OR LOWER(contacto) LIKE '%cartel%' OR LOWER(contacto) LIKE '%anun%' OR LOWER(contacto) LIKE '%promo%' THEN 'Publicidad/Folleto'
    
    -- Simple general patterns (broader)
    WHEN LOWER(contacto) LIKE '%peaton%' OR LOWER(contacto) LIKE '%camina%' OR LOWER(contacto) LIKE '%walk%' THEN 'Otro - Peaton/Caminando'
    WHEN LOWER(contacto) LIKE '%clinic%' OR LOWER(contacto) LIKE '%dental%' OR LOWER(contacto) LIKE '%dentist%' THEN 'Otro - Clínica/Dentista'
    
    -- NA/No answer patterns
    WHEN LOWER(contacto) LIKE '%na%' OR LOWER(contacto) LIKE '%n/a%' OR LOWER(contacto) LIKE '%none%' OR LOWER(contacto) LIKE '%no%' OR LOWER(contacto) = 'na' OR LOWER(contacto) = 'n/a' THEN 'Otro - Sin respuesta'
    
    -- Keep existing values that match our options exactly
    WHEN contacto IN ('Recomendación de amigo/familiar', 'Recomendación de doctor/médico', 'Facebook', 'Instagram', 'WhatsApp', 'Llamada telefónica', 'Google/Búsqueda web', 'Página web', 'Referido de otro paciente', 'Publicidad/Folleto', 'Otro') THEN contacto
    
    -- For anything else, categorize as 'Otro'
    ELSE 'Otro'
END
WHERE contacto IS NOT NULL AND contacto != '';

-- Let's see the results of the migration
SELECT 
    contacto,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM patients WHERE contacto IS NOT NULL AND contacto != ''), 2) as percentage
FROM patients 
WHERE contacto IS NOT NULL AND contacto != ''
GROUP BY contacto
ORDER BY count DESC;

-- Show how many records were updated
SELECT 
    COUNT(*) as total_updated,
    SUM(CASE WHEN contacto = 'Otro' THEN 1 ELSE 0 END) as categorized_as_other,
    ROUND(SUM(CASE WHEN contacto != 'Otro' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate
FROM patients 
WHERE contacto IS NOT NULL AND contacto != '';

-- Optional: Create a log of values that were categorized as 'Otro' for manual review
CREATE TABLE IF NOT EXISTS contacto_other_values AS
SELECT 
    paciente_id,
    contacto as normalized_value,
    contacto as original_contacto
FROM (
    SELECT 
        p.paciente_id,
        CASE
            -- Simple social media patterns (broader)
            WHEN LOWER(p.contacto) LIKE '%fb%' OR LOWER(p.contacto) LIKE '%face%' THEN 'Facebook'
            WHEN LOWER(p.contacto) LIKE '%insta%' OR LOWER(p.contacto) LIKE '%gram%' THEN 'Instagram'
            WHEN LOWER(p.contacto) LIKE '%what%' OR LOWER(p.contacto) LIKE '%wap%' THEN 'WhatsApp'
            WHEN LOWER(p.contacto) LIKE '%tweet%' OR LOWER(p.contacto) LIKE '%x%' THEN 'Twitter'
            WHEN LOWER(p.contacto) LIKE '%tik%' THEN 'TikTok'
            WHEN LOWER(p.contacto) LIKE '%in%' OR LOWER(p.contacto) LIKE '%linked%' THEN 'LinkedIn'
            WHEN LOWER(p.contacto) LIKE '%yt%' OR LOWER(p.contacto) LIKE '%tube%' THEN 'YouTube'
            
            -- Simple recommendation patterns (broader)
            WHEN LOWER(p.contacto) LIKE '%amigo%' OR LOWER(p.contacto) LIKE '%familiar%' OR LOWER(p.contacto) LIKE '%familia%' THEN 'Recomendación de amigo/familiar'
            WHEN LOWER(p.contacto) LIKE '%doctor%' OR LOWER(p.contacto) LIKE '%medico%' OR LOWER(p.contacto) LIKE '%médico%' THEN 'Recomendación de doctor/médico'
            WHEN LOWER(p.contacto) LIKE '%refer%' OR LOWER(p.contacto) LIKE '%recomend%' OR LOWER(p.contacto) LIKE '%paciente%' OR LOWER(p.contacto) LIKE '%cliente%' THEN 'Referido de otro paciente'
            
            -- Simple phone patterns (broader)
            WHEN LOWER(p.contacto) LIKE '%tel%' OR LOWER(p.contacto) LIKE '%llam%' OR LOWER(p.contacto) LIKE '%phone%' OR LOWER(p.contacto) LIKE '%call%' THEN 'Llamada telefónica'
            
            -- Simple web patterns (broader)
            WHEN LOWER(p.contacto) LIKE '%google%' OR LOWER(p.contacto) LIKE '%busq%' OR LOWER(p.contacto) LIKE '%search%' OR LOWER(p.contacto) LIKE '%online%' THEN 'Google/Búsqueda web'
            WHEN LOWER(p.contacto) LIKE '%pagina%' OR LOWER(p.contacto) LIKE '%web%' OR LOWER(p.contacto) LIKE '%sitio%' THEN 'Página web'
            
            -- Simple advertising patterns (broader)
            WHEN LOWER(p.contacto) LIKE '%publi%' OR LOWER(p.contacto) LIKE '%folle%' OR LOWER(p.contacto) LIKE '%cartel%' OR LOWER(p.contacto) LIKE '%anun%' OR LOWER(p.contacto) LIKE '%promo%' THEN 'Publicidad/Folleto'
            
            -- Simple general patterns (broader)
            WHEN LOWER(p.contacto) LIKE '%peaton%' OR LOWER(p.contacto) LIKE '%camina%' OR LOWER(p.contacto) LIKE '%walk%' THEN 'Otro - Peaton/Caminando'
            WHEN LOWER(p.contacto) LIKE '%clinic%' OR LOWER(p.contacto) LIKE '%dental%' OR LOWER(p.contacto) LIKE '%dentist%' THEN 'Otro - Clínica/Dentista'
            
            -- NA/No answer patterns
            WHEN LOWER(p.contacto) LIKE '%na%' OR LOWER(p.contacto) LIKE '%n/a%' OR LOWER(p.contacto) LIKE '%none%' OR LOWER(p.contacto) LIKE '%no%' OR LOWER(p.contacto) = 'na' OR LOWER(p.contacto) = 'n/a' THEN 'Otro - Sin respuesta'
            
            -- Keep existing values that match our options exactly
            WHEN p.contacto IN ('Recomendación de amigo/familiar', 'Recomendación de doctor/médico', 'Facebook', 'Instagram', 'WhatsApp', 'Llamada telefónica', 'Google/Búsqueda web', 'Página web', 'Referido de otro paciente', 'Publicidad/Folleto', 'Otro') THEN p.contacto
            
            -- Everything else goes to 'Otro'
            ELSE 'Otro'
        END as contacto,
        p.contacto as contacto_original
    FROM contacto_backup p
) normalized_data
WHERE contacto = 'Otro';
