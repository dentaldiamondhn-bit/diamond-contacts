import Dexie, { type Table } from 'dexie'

export type PhoneType = 'mobile' | 'work' | 'home' | 'whatsapp' | 'fax' | 'other'
export type EmailType = 'work' | 'personal' | 'other'

export type ContactView = 'all' | 'favorites' | 'archived' | 'trash' | 'recentHistory'
/** 'all' | 'favorites' | 'archived' | 'trash' | 'recentHistory' | { labelId } */
export type ContactFilter = ContactView | { labelId: string }
export type ContactSortKey = 'name' | 'phone' | 'email' | 'labels' | 'updated'
export type SortDirection = 'asc' | 'desc'

export interface ContactSort {
  key: ContactSortKey
  dir: SortDirection
}

export interface LocalContactPhone {
  id: string
  type: PhoneType
  phone_number: string
  is_primary?: boolean
}

export interface LocalContactEmail {
  id: string
  type: EmailType
  email: string
  is_primary?: boolean
}

export interface LocalContact {
  id: string
  user_id: string
  patient_id?: string | null
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  job_title?: string | null
  notes?: string | null
  avatar_url?: string | null
  address?: string | null
  dob?: string | null
  emergency_contact?: string | null
  is_favorite: boolean
  is_archived: boolean
  version?: number
  created_at?: string | null
  updated_at: string
  deleted_at?: string | null
  phones: LocalContactPhone[]
  emails: LocalContactEmail[]
  label_ids: string[]
  /** 0 = pending upload, 1 = in sync with Supabase */
  synced: 0 | 1
  /** 0 = active, 1 = soft-deleted tombstone (kept for sync) */
  deleted: 0 | 1
}

export interface LocalLabel {
  id: string
  user_id: string
  name: string
  color: string
  synced: 0 | 1
}

/** 1:1 clinical summary stored per contact (allergies, conditions, medications). */
export interface MedicalHistory {
  contactId: string
  allergies: string[]
  chronicConditions: string[]
  currentMedications: string[]
  odontogramNotes?: string
  lastDentalVisit?: string
  bloodType?: string
  updatedAt: string
  /** 0 = pending upload, 1 = in sync with Supabase */
  synced: 0 | 1
}

/** Window (days) used by the "Historiales Recientes" filter. */
export const RECENT_HISTORY_DAYS = 60

class ContactsDatabase extends Dexie {
  contacts!: Table<LocalContact, string>
  labels!: Table<LocalLabel, string>
  medicalHistories!: Table<MedicalHistory, string>

  constructor() {
    super('ClinicContactsDB')
    this.version(1).stores({
      contacts: 'id, user_id, first_name, last_name, synced, deleted, updated_at',
      labels: 'id, user_id, name',
    })
    this.version(2).stores({
      contacts: 'id, user_id, first_name, last_name, synced, deleted, updated_at',
      labels: 'id, user_id, name',
      medicalHistories: 'contactId, updatedAt, synced',
    })
  }
}

export const db = new ContactsDatabase()

export const LABEL_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#8B5CF6', // violet
  '#F59E0B', // amber
  '#EF4444', // red
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
]

export const DEFAULT_LABEL_NAMES = ['Pacientes Activos', 'En Tratamiento', 'VIP', 'Seguros']

export function newLocalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function toSearchable(contact: LocalContact): string {
  const email = contact.emails[0]?.email ?? ''
  const phone = contact.phones.map((p) => p.phone_number).join(' ')
  return `${contact.first_name ?? ''} ${contact.last_name ?? ''} ${contact.company ?? ''} ${contact.job_title ?? ''} ${email} ${phone}`.toLowerCase()
}

export function fullName(contact: Pick<LocalContact, 'first_name' | 'last_name'>): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim()
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-pink-500',
]

export function avatarColor(name: string): string {
  const code = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

export function primaryPhone(contact: LocalContact): LocalContactPhone | undefined {
  return contact.phones.find((p) => p.is_primary) ?? contact.phones[0]
}

export function primaryEmail(contact: LocalContact): LocalContactEmail | undefined {
  return contact.emails.find((e) => e.is_primary) ?? contact.emails[0]
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-HN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export async function getLabels(userId: string): Promise<LocalLabel[]> {
  const list = await db.labels.where('user_id').equals(userId).toArray()
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getMedicalHistory(contactId: string): Promise<MedicalHistory | undefined> {
  return await db.medicalHistories.get(contactId)
}

export async function getRecentMedicalHistoryCount(): Promise<number> {
  const start = new Date(Date.now() - RECENT_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString()
  return db.medicalHistories.where('updatedAt').above(start).count()
}

export async function queryContacts(filter: ContactFilter, search?: string): Promise<LocalContact[]> {
  const isTrash = filter === 'trash'
  let base = await db.contacts
    .where('deleted')
    .equals(isTrash ? 1 : 0)
    .toArray()

  if (filter === 'archived') {
    base = base.filter((c) => c.is_archived)
  } else if (filter !== 'trash') {
    base = base.filter((c) => !c.is_archived)
  }

  if (filter === 'favorites') {
    base = base.filter((c) => c.is_favorite)
  } else if (filter === 'recentHistory') {
    const start = new Date(Date.now() - RECENT_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const histories = await db.medicalHistories.where('updatedAt').above(start).toArray()
    const ids = new Set(histories.map((h) => h.contactId))
    base = base.filter((c) => ids.has(c.id))
  } else if (typeof filter === 'object') {
    const labelId = filter.labelId
    base = base.filter((c) => c.label_ids.includes(labelId))
  }

  const term = search?.trim().toLowerCase() ?? ''
  if (term) {
    base = base.filter((c) => toSearchable(c).includes(term))
  }

  return base
}

export function sortContacts(list: LocalContact[], sort: ContactSort): LocalContact[] {
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    let av: string | number
    let bv: string | number
    switch (sort.key) {
      case 'phone':
        av = primaryPhone(a)?.phone_number ?? ''
        bv = primaryPhone(b)?.phone_number ?? ''
        break
      case 'email':
        av = primaryEmail(a)?.email ?? ''
        bv = primaryEmail(b)?.email ?? ''
        break
      case 'labels':
        av = a.label_ids.length
        bv = b.label_ids.length
        break
      case 'updated':
        av = new Date(a.updated_at ?? 0).getTime()
        bv = new Date(b.updated_at ?? 0).getTime()
        break
      default:
        av = fullName(a).toLowerCase()
        bv = fullName(b).toLowerCase()
    }
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv), 'es') * dir
  })
}