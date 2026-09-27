import type { LocalContact } from './db'
import { newLocalId } from './db'
import { updateLocalContact, updateMedicalHistory, type MedicalHistoryPatch } from './syncEngine'

/**
 * The subset of a `patients` row needed to link + snapshot into a contact.
 * `/api/patients/search` returns full rows, so this stays structurally loose.
 */
export interface PatientLinkMatch {
  paciente_id?: string
  nombre_completo?: string | null
  numero_identidad?: string | null
  direccion?: string | null
  fecha_nacimiento?: string | null
  telefono?: string | null
  codigopais?: string | null
  email?: string | null
  trabajo?: string | null
  contacto_emergencia?: string | null
  contacto_telefono?: string | null
  codigopaisemergencia?: string | null
  alergias?: string | null
  enfermedades?: string | null
  medicamentos?: string | null
  ultima_limpieza?: string | null
  visitas_dentista?: string | null
  observaciones_medicas?: string | null
  observaciones_generales?: string | null
  tipo_sangre?: string | null
}

const digits = (s?: string | null): string => (s ?? '').replace(/\D/g, '')
const localPart = (s?: string | null): string => digits(s).slice(-8)

function phoneToDisplay(p: PatientLinkMatch): string {
  const raw = (p.telefono ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('+') || /^\d{1,3}\s/.test(raw)) return raw
  const cc = (p.codigopais ?? '').trim()
  return cc ? `+${cc} ${raw}` : raw
}

function emergencyPhoneToDisplay(p: PatientLinkMatch): string {
  const raw = (p.contacto_telefono ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('+') || /^\d{1,3}\s/.test(raw)) return raw
  const cc = (p.codigopaisemergencia ?? '').trim()
  return cc ? `+${cc} ${raw}` : raw
}

/** Split a free-text patient-form field (newlines, commas, semicolons) into tags. */
function splitField(s?: string | null): string[] {
  return (s ?? '')
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

/** Values that mean "no allergies/conditions/medications" and must not tint UI. */
const NEGATION_TAGS = new Set([
  'no',
  'n/a',
  'na',
  'none',
  '0',
  '-',
  'no hay',
  'no hay alergias',
  'no presenta',
  'no presenta alergias',
  'no refiere',
  'no refiere alergias',
  'no aplica',
  'no aplicable',
  'ninguna',
  'ninguno',
  'ninguna alergia',
  'sin alergias',
  'sin',
  'desconocido',
  'no conocida',
  'no conocidas',
  'no se conocen',
])

const normalizeTag = (t: string): string =>
  t.trim().toLowerCase().replace(/[¡!¿?.,]/g, '').replace(/\s+/g, ' ').trim()

export function isMeaningfulMedicalTag(tag: string): boolean {
  const t = normalizeTag(tag)
  return t !== '' && !NEGATION_TAGS.has(t)
}

/** Keep only tags that represent an actual medical item (drops "No", "N/A", "0", …). */
export function meaningfulMedicalTags(tags: string[]): string[] {
  return tags.filter(isMeaningfulMedicalTag)
}

const BLOOD_TYPES = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])

/**
 * Rank a patient against the contact for the "posibles coincidencias" list.
 * Higher = stronger signal. Phone match is the heaviest single indicator.
 */
export function scorePatientMatch(contact: LocalContact, patient: PatientLinkMatch): number {
  let score = 0
  const contactName = fullNameLike(contact).toLowerCase()
  const contactWords = contactName.split(/\s+/).filter(Boolean)
  const patientName = (patient.nombre_completo ?? '').toLowerCase()

  if (patientName && contactName && patientName === contactName) score += 4
  else if (contactWords.length && patientName.split(/\s+/).every((w) => contactWords.includes(w))) score += 3

  if (patientName && contactWords.length) {
    for (const w of contactWords) {
      if (patientName.includes(w)) score += 1
    }
  }

  const contactLocalPhones = contact.phones.map((p) => localPart(p.phone_number)).filter(Boolean)
  const patientPhone = localPart(patient.telefono)
  if (patientPhone && contactLocalPhones.includes(patientPhone)) score += 4

  const contactEmails = contact.emails.map((e) => e.email.trim().toLowerCase()).filter(Boolean)
  const patientEmail = (patient.email ?? '').trim().toLowerCase()
  if (patientEmail && contactEmails.includes(patientEmail)) score += 3

  return score
}

function fullNameLike(c: LocalContact): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
}

/**
 * Link a contact to an existing paciente (EHR) and snapshot the patient-form
 * data into the contact:
 *  - Información: address, dob, job_title, emergency_contact, phone, email, notes
 *  - Historial Médico: alergias, enfermedades, medicamentos, última limpieza, notas
 * Existing contact values are never overwritten (the rapid SMS-intake flow may
 * already hold better info); only blank fields get filled and new phones/emails
 * are appended if they don't already exist.
 */
export async function linkContactToPatient(contact: LocalContact, patient: PatientLinkMatch): Promise<void> {
  const patchContact: Parameters<typeof updateLocalContact>[1] = {
    patient_id: patient.paciente_id ?? null,
  }

  if (!contact.address && patient.direccion) patchContact.address = patient.direccion
  if (!contact.dob && patient.fecha_nacimiento) patchContact.dob = patient.fecha_nacimiento.slice(0, 10)
  if (!contact.job_title && patient.trabajo) patchContact.job_title = patient.trabajo
  if (!contact.notes && patient.observaciones_generales) patchContact.notes = patient.observaciones_generales
  if (!contact.emergency_contact) {
    const em = [patient.contacto_emergencia, emergencyPhoneToDisplay(patient)].filter(Boolean).join(' — ')
    if (em) patchContact.emergency_contact = em
  }

  const displayPhone = phoneToDisplay(patient)
  const phoneLocal = localPart(patient.telefono)
  if (displayPhone && phoneLocal && !contact.phones.some((p) => localPart(p.phone_number) === phoneLocal)) {
    patchContact.phones = [
      ...contact.phones,
      { id: newLocalId(), type: 'mobile', phone_number: displayPhone, is_primary: contact.phones.length === 0 },
    ]
  }

  const patientEmail = (patient.email ?? '').trim()
  if (patientEmail && !contact.emails.some((e) => e.email.trim().toLowerCase() === patientEmail.toLowerCase())) {
    patchContact.emails = [
      ...contact.emails,
      { id: newLocalId(), type: 'work', email: patientEmail, is_primary: contact.emails.length === 0 },
    ]
  }

  const medical: MedicalHistoryPatch = {
    allergies: meaningfulMedicalTags(splitField(patient.alergias)),
    chronicConditions: meaningfulMedicalTags(splitField(patient.enfermedades)),
    currentMedications: meaningfulMedicalTags(splitField(patient.medicamentos)),
  }
  const lastVisit = (patient.visitas_dentista ?? '').trim()
  if (lastVisit) medical.lastDentalVisit = lastVisit
  if (patient.observaciones_medicas) medical.odontogramNotes = patient.observaciones_medicas
  const blood = (patient.tipo_sangre ?? '').trim().toUpperCase()
  if (BLOOD_TYPES.has(blood)) medical.bloodType = blood

  await updateLocalContact(contact.id, patchContact)
  await updateMedicalHistory(contact.id, medical)
}