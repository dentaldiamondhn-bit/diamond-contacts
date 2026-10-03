import { supabase } from '../supabase'
import { formatToE164 } from './vcard'
import { deleteMirroredNativeContact, mirrorLocalContact } from '../../services/nativeContactsService'
import {
  db,
  newLocalId,
  LABEL_COLORS,
  type LocalContact,
  type LocalContactEmail,
  type LocalContactPhone,
  type LocalLabel,
  type MedicalHistory,
  type PhoneType,
  type EmailType,
} from './db'

// ---------------------------------------------------------------------------
// SINGLE-FLIGHT SYNC LOCK
// ---------------------------------------------------------------------------
// Pushes and pulls may be triggered from many paths (CRUD helpers, focus /
// online events, realtime, manual resync). Without serialization they
// interleave the non-atomic child sync (upsert + prune) and collide on the
// very same UUIDs, producing duplicate-key 409 storms against Supabase. Chain
// every sync operation through this queue so only one runs at a time.
let syncQueue: Promise<unknown> = Promise.resolve()

function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = syncQueue.then(fn, fn)
  syncQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

interface RemotePhoneRow {
  id: string
  type: PhoneType | string
  phone_number: string
  is_primary?: boolean
}

interface RemoteEmailRow {
  id: string
  type: EmailType | string
  email: string
  is_primary?: boolean
}

interface RemoteContactRow {
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
  gender?: string | null
  emergency_contact?: string | null
  insurance_provider?: string | null
  policy_number?: string | null
  blood_type?: string | null
  is_favorite?: boolean
  is_archived?: boolean
  version?: number
  created_at?: string | null
  updated_at?: string | null
  deleted_at?: string | null
  contact_phones?: RemotePhoneRow[] | null
  contact_emails?: RemoteEmailRow[] | null
}

interface RemoteHistoryRow {
  contact_id: string
  user_id?: string | null
  allergies?: string[] | null
  chronic_conditions?: string[] | null
  current_medications?: string[] | null
  odontogram_notes?: string | null
  last_dental_visit?: string | null
  blood_type?: string | null
  updated_at?: string | null
}

interface RemoteLabelRow {
  id: string
  user_id: string
  name: string
  color: string
}

interface RemoteJunctionRow {
  contact_id: string
  label_id: string
}

function toLocalContact(row: RemoteContactRow, userId: string): LocalContact {
  const deletedAt = row.deleted_at ?? null
  return {
    id: row.id,
    user_id: row.user_id || userId,
    patient_id: row.patient_id ?? null,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    company: row.company ?? null,
    job_title: row.job_title ?? null,
    notes: row.notes ?? null,
    avatar_url: row.avatar_url ?? null,
    address: row.address ?? null,
    dob: row.dob ?? null,
    emergency_contact: row.emergency_contact ?? null,
    is_favorite: !!row.is_favorite,
    is_archived: !!row.is_archived,
    version: row.version ?? 1,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
    deleted_at: deletedAt,
    phones: (row.contact_phones ?? []).map((p) => ({
      id: p.id,
      type: (['mobile', 'work', 'home', 'whatsapp', 'fax', 'other'] as string[]).includes(p.type)
        ? (p.type as PhoneType)
        : 'other',
      phone_number: p.phone_number,
      is_primary: !!p.is_primary,
    })),
    emails: (row.contact_emails ?? []).map((e) => ({
      id: e.id,
      type: (['work', 'personal', 'other'] as string[]).includes(e.type)
        ? (e.type as EmailType)
        : 'other',
      email: e.email,
      is_primary: !!e.is_primary,
    })),
    label_ids: [],
    synced: 1,
    deleted: deletedAt ? 1 : 0,
  }
}

// ---------------------------------------------------------------------------
// PUSH: local IndexedDB -> Supabase
// ---------------------------------------------------------------------------

async function adoptRemoteLabel(
  fromId: string,
  server: { id: string; name: string; color: string },
  userId: string,
): Promise<void> {
  const contacts = await db.contacts.where('user_id').equals(userId).toArray()
  const affected = contacts.filter((c) => c.label_ids.includes(fromId))
  for (const c of affected) {
    await db.contacts.update(c.id, {
      label_ids: c.label_ids.map((lid) => (lid === fromId ? server.id : lid)),
      version: (c.version ?? 1) + 1,
      updated_at: new Date().toISOString(),
      synced: 0,
    })
  }
  await db.labels.delete(fromId)
  await db.labels.put({ id: server.id, user_id: userId, name: server.name, color: server.color, synced: 1 })
}

async function pushLabels(userId: string): Promise<number> {
  const all = await db.labels.where('user_id').equals(userId).toArray()
  const unsynced = all.filter((l) => l.synced === 0)
  let pushed = 0
  for (const label of unsynced) {
    try {
      // Resolve the remote row BEFORE writing. A label that already exists
      // remotely (rename/color edit while synced=1, a re-created row, or another
      // device) must keep its id stable — the ORG/TITLE/ADR CardDAV junction keys
      // off it. Matching on (user_id, name) as well as id means a name collision
      // ADOPTS the server row instead of provoking a 409 from the insert
      // (contact_labels_user_id_name_key), which the browser logs as a red
      // network error even though the catch below recovers from it.
      const [{ data: byId }, { data: byName }] = await Promise.all([
        supabase
          .from('contact_labels')
          .select('id, name, color')
          .eq('id', label.id)
          .maybeSingle(),
        supabase
          .from('contact_labels')
          .select('id, name, color')
          .eq('user_id', userId)
          .eq('name', label.name)
          .maybeSingle(),
      ])

      const server = byId ?? byName
      if (!server) {
        await supabase.from('contact_labels').insert({
          id: label.id,
          user_id: userId,
          name: label.name,
          color: label.color,
        }).throwOnError()
      } else if (server.id !== label.id) {
        // Same name, different id: fold the local row onto the server one so
        // local references (and the junction rows) keep pointing at a real label.
        await adoptRemoteLabel(label.id, server, userId)
        pushed += 1
        continue
      } else {
        await supabase
          .from('contact_labels')
          .update({ name: label.name, color: label.color })
          .eq('id', label.id)
          .throwOnError()
      }
      await db.labels.update(label.id, { synced: 1 })
      pushed += 1
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        // Lost the race against a concurrent insert (another device, or the
        // /api/contacts/tags route): adopt the row that won.
        const { data: byName } = await supabase
          .from('contact_labels')
          .select('id, name, color')
          .eq('user_id', userId)
          .eq('name', label.name)
          .maybeSingle()
        if (byName && byName.id !== label.id) {
          await adoptRemoteLabel(label.id, byName, userId)
          pushed += 1
        }
        continue
      }
      console.error(`[sync] push de etiqueta fallida (${label.name}):`, err)
    }
  }
  return pushed
}

async function pushContactJunctions(contactId: string, labelIds: string[]): Promise<void> {
  await supabase.from('contact_label_junction').delete().eq('contact_id', contactId).throwOnError()
  if (labelIds.length > 0) {
    await supabase
      .from('contact_label_junction')
      .insert(labelIds.map((label_id) => ({ contact_id: contactId, label_id })))
      .throwOnError()
  }
}

async function runPushLocalChanges(userId: string): Promise<number> {
  const unsynced = await db.contacts.where('synced').equals(0).toArray()
  let pushed = 0

  for (const contact of unsynced) {
    const now = new Date().toISOString()
    try {
      if (contact.deleted === 1) {
        await supabase
          .from('contacts')
          .update({ deleted_at: now, updated_at: now, version: (contact.version ?? 1) + 1 })
          .eq('id', contact.id)
          .throwOnError()
      } else {
        const { id, phones, emails, label_ids, ...rest } = contact
        const { synced: _synced, deleted: _deleted, deleted_at: _deletedAt, ...payload } = rest
        await supabase
          .from('contacts')
          .upsert(
            {
              id,
              user_id: userId,
              ...payload,
              deleted_at: null,
              updated_at: now,
              version: (contact.version ?? 1) + 1,
            },
            { onConflict: 'id' },
          )
          .throwOnError()

        await Promise.all([
          replaceRemoteRows(
            'contact_phones',
            id,
            phones.map((p) => ({
              id: p.id,
              contact_id: id,
              type: p.type,
              phone_number: p.phone_number,
              is_primary: !!p.is_primary,
            })),
          ),
          replaceRemoteRows(
            'contact_emails',
            id,
            emails.map((e) => ({
              id: e.id,
              contact_id: id,
              type: e.type,
              email: e.email,
              is_primary: !!e.is_primary,
            })),
          ),
          pushContactJunctions(id, label_ids),
        ])
      }

      await db.contacts.update(contact.id, {
        synced: 1,
        deleted_at: contact.deleted === 1 ? contact.deleted_at ?? now : null,
        version: (contact.version ?? 1) + 1,
      })
      pushed += 1
    } catch (err) {
      console.error(`[sync] push fallida para ${contact.id}:`, err)
    }
  }

  const labelsPushed = await pushLabels(userId)
  const historyPushed = await pushMedicalHistories()
  return pushed + labelsPushed + historyPushed
}

// Child rows are fully replaced per contact. Safe under the single-flight
// lock; any failure throws and leaves the contact unsynced for retry.
async function replaceRemoteRows(
  table: 'contact_phones' | 'contact_emails',
  contactId: string,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  await supabase.from(table).delete().eq('contact_id', contactId).throwOnError()
  if (rows.length > 0) {
    await supabase.from(table).insert(rows as never[]).throwOnError()
  }
}

export function pushLocalChanges(userId: string): Promise<number> {
  return withSyncLock(() => runPushLocalChanges(userId))
}

// ---------------------------------------------------------------------------
// MEDICAL HISTORY sync (1:1 summary per contact)
// ---------------------------------------------------------------------------

async function pushMedicalHistories(): Promise<number> {
  const unsynced = await db.medicalHistories.where('synced').equals(0).toArray()
  let pushed = 0
  for (const h of unsynced) {
    try {
      const owner = await db.contacts.get(h.contactId)
      await supabase.from('patient_medical_history').upsert(
        {
          contact_id: h.contactId,
          user_id: owner?.user_id ?? null,
          allergies: h.allergies,
          chronic_conditions: h.chronicConditions,
          current_medications: h.currentMedications,
          odontogram_notes: h.odontogramNotes ?? null,
          last_dental_visit: h.lastDentalVisit ?? null,
          blood_type: h.bloodType ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'contact_id' },
      ).throwOnError()
      await db.medicalHistories.update(h.contactId, { synced: 1, updatedAt: new Date().toISOString() })
      pushed += 1
    } catch (err) {
      console.error(`[sync] push de historial clínico fallida (${h.contactId}):`, err)
    }
  }
  return pushed
}

function toLocalMedicalHistory(row: RemoteHistoryRow): MedicalHistory {
  return {
    contactId: row.contact_id,
    allergies: row.allergies ?? [],
    chronicConditions: row.chronic_conditions ?? [],
    currentMedications: row.current_medications ?? [],
    odontogramNotes: row.odontogram_notes ?? undefined,
    lastDentalVisit: row.last_dental_visit ?? undefined,
    bloodType: row.blood_type ?? undefined,
    updatedAt: row.updated_at ?? new Date().toISOString(),
    synced: 1,
  }
}

// ---------------------------------------------------------------------------
// PULL: Supabase -> local IndexedDB (last-write-wins, local pending wins)
// ---------------------------------------------------------------------------

export function pullRemoteContacts(userId: string): Promise<number> {
  return withSyncLock(() => runPullRemoteContacts(userId))
}

async function runPullRemoteContacts(userId: string): Promise<number> {
  const [contactsRes, labelsRes, junctionsRes] = await Promise.all([
    supabase
      .from('contacts')
      .select('*, contact_phones(*), contact_emails(*)')
      .eq('user_id', userId)
      .limit(2000),
    supabase.from('contact_labels').select('*').eq('user_id', userId),
    supabase.from('contact_label_junction').select('contact_id, label_id'),
  ])

  if (contactsRes.error) throw new Error(contactsRes.error.message)

  const rows = (Array.isArray(contactsRes.data) ? contactsRes.data : []) as RemoteContactRow[]
  const labelRows = (Array.isArray(labelsRes.data) ? labelsRes.data : []) as RemoteLabelRow[]
  const junctionRows = (Array.isArray(junctionsRes.data) ? junctionsRes.data : []) as RemoteJunctionRow[]
  const remoteIds = new Set(rows.map((r) => r.id))

  // Reconcile labels
  const junctionByContact = new Map<string, string[]>()
  for (const j of junctionRows) {
    const list = junctionByContact.get(j.contact_id) ?? []
    list.push(j.label_id)
    junctionByContact.set(j.contact_id, list)
  }
  const remoteLabelIds = new Set(labelRows.map((l) => l.id))
  let reconciled = 0

  for (const label of labelRows) {
    await db.labels.put({
      id: label.id,
      user_id: label.user_id || userId,
      name: label.name,
      color: label.color,
      synced: 1,
    })
    reconciled += 1
  }
  const localLabels = await db.labels.where('user_id').equals(userId).toArray()
  for (const local of localLabels) {
    if (local.synced === 1 && !remoteLabelIds.has(local.id)) {
      await db.labels.delete(local.id)
    }
  }

  // Reconcile contacts
  for (const row of rows) {
    const existing = await db.contacts.get(row.id)
    const remoteTs = new Date(row.updated_at ?? 0).getTime()
    const localTs = existing ? new Date(existing.updated_at ?? 0).getTime() : 0

    // Local unsynced edit that is newer (or ties) wins and is pushed later.
    // `>=` (not `>`) prevents a millisecond-equality collision from silently
    // dropping a pending local edit; the next push re-stamps updated_at.
    if (existing && existing.synced === 0 && localTs >= remoteTs) continue

    const local = toLocalContact(row, userId)
    local.label_ids = junctionByContact.get(row.id) ?? []
    await db.contacts.put(local)
    reconciled += 1
  }

  // Tombstone any synced local rows that no longer exist remotely.
  const localRows = await db.contacts.where('user_id').equals(userId).toArray()
  for (const local of localRows) {
    if (local.synced === 1 && !remoteIds.has(local.id) && local.deleted === 0) {
      await db.contacts.update(local.id, { deleted: 1, deleted_at: new Date().toISOString() })
    }
  }

  // Reconcile medical histories LAST and best-effort: a failure here (e.g. a
  // column missing from the deployed schema) must never abort the contact pull.
  try {
    await reconcileMedicalHistories(userId, rows)
  } catch (err) {
    console.warn('[sync] reconciliación de historiales clínicos fallida (se reintentará):', err)
  }

  return reconciled
}

async function reconcileMedicalHistories(userId: string, rows: RemoteContactRow[]): Promise<void> {
  const contactIds = rows.map((r) => r.id)
  let histories: RemoteHistoryRow[] = []
  if (contactIds.length > 0) {
    const chunkSize = 900
    for (let i = 0; i < contactIds.length; i += chunkSize) {
      const chunk = contactIds.slice(i, i + chunkSize)
      const { data, error } = await supabase
        .from('patient_medical_history')
        .select('contact_id, allergies, chronic_conditions, current_medications, odontogram_notes, last_dental_visit, updated_at')
        .in('contact_id', chunk)
      if (error) throw new Error(error.message)
      histories = histories.concat(Array.isArray(data) ? (data as RemoteHistoryRow[]) : [])
    }
  }

  const remoteContactIds = new Set(contactIds)
  const remoteHistories = new Set(histories.map((h) => h.contact_id))

  // Local unsynced history that is newer wins and gets pushed on next sync.
  for (const row of histories) {
    const existing = await db.medicalHistories.get(row.contact_id)
    // Local unsynced history that is newer (or ties) wins and gets pushed on
    // next sync — same `>=` tie-break as the contacts pull.
    const remoteTs = new Date(row.updated_at ?? 0).getTime()
    const localTs = existing ? new Date(existing.updatedAt ?? 0).getTime() : 0
    if (existing && existing.synced === 0 && localTs >= remoteTs) continue
    await db.medicalHistories.put(toLocalMedicalHistory(row))
  }

  // Drop local histories whose contact is gone or whose server row was deleted.
  const localHistories = await db.medicalHistories.toArray()
  for (const local of localHistories) {
    const stillLinked = remoteContactIds.has(local.contactId)
    if (local.synced === 1 && (!stillLinked || !remoteHistories.has(local.contactId))) {
      await db.medicalHistories.delete(local.contactId)
    }
  }
}

// ---------------------------------------------------------------------------
// REALTIME subscription (Supabase websockets -> local)
// ---------------------------------------------------------------------------

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleRealtimePull(userId: string, onChange: () => void): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    pullRemoteContacts(userId)
      .catch((err) => console.error('[sync] pull en tiempo real fallida:', err))
      .finally(onChange)
  }, 600)
}

export function subscribeToRealtimeSync(
  userId: string,
  onChange: () => void,
): { channel: ReturnType<typeof supabase.channel>; unsubscribe: () => void } {
  const handleChange = () => scheduleRealtimePull(userId, onChange)

  // Contacts changes are the critical cross-device path: keep them on their OWN
  // channel so a failing bind on an auxiliary table (e.g. patient_medical_history
  // subscribed via a user_id column that a partially-applied migration left out)
  // can never silence contact events for the whole socket.
  const channel = supabase
    .channel('contacts_sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'contacts', filter: `user_id=eq.${userId}` },
      handleChange,
    )
    .subscribe()

  // Auxiliary tables on a SECOND channel: medical history + etiquetas + their
  // junction. The history is filtered at the socket level through the
  // denormalized user_id column (migration 20260926000000) so other clinics'
  // history updates never reach this client's connection; the junction carries
  // its own denormalized user_id (migration 20261001) for the same reason. If a
  // bind here errors, only auxiliary live updates are lost — never contacts.
  const auxChannel = supabase
    .channel('contacts_sync_aux')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'patient_medical_history', filter: `user_id=eq.${userId}` },
      handleChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'contact_labels', filter: `user_id=eq.${userId}` },
      handleChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'contact_label_junction', filter: `user_id=eq.${userId}` },
      handleChange,
    )
    .subscribe()

  return {
    channel,
    unsubscribe: () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      supabase.removeChannel(channel)
      supabase.removeChannel(auxChannel)
    },
  }
}

export interface ContactsSyncHandle {
  unsubscribe: () => void
  syncNow: () => Promise<number>
}

export function initContactsSync(userId: string, onChange?: () => void): ContactsSyncHandle {
  let disposed = false
  const notify = () => {
    if (!disposed) onChange?.()
  }

  const { unsubscribe } = subscribeToRealtimeSync(userId, notify)

  void pullRemoteContacts(userId)
    .catch((err) => console.error('[sync] pull inicial fallida:', err))
    .finally(notify)

  const handleOnline = () => {
    void pushLocalChanges(userId)
      .then(() => pullRemoteContacts(userId))
      .catch((err) => console.error('[sync] sincronización online fallida:', err))
      .finally(notify)
  }
  window.addEventListener('online', handleOnline)
  window.addEventListener('focus', handleOnline)

  return {
    unsubscribe: () => {
      disposed = true
      unsubscribe()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('focus', handleOnline)
    },
    syncNow: () => pushLocalChanges(userId).then((n) => pullRemoteContacts(userId).then(() => n)),
  }
}

// ---------------------------------------------------------------------------
// Local-first write helpers (write to IndexedDB first, then push)
// ---------------------------------------------------------------------------

export interface NewContactInput {
  first_name?: string
  last_name?: string
  company?: string
  job_title?: string
  notes?: string
  address?: string
  dob?: string
  emergency_contact?: string
  is_favorite?: boolean
  is_archived?: boolean
  label_ids?: string[]
  phones: { id?: string; type: PhoneType; phone_number: string; is_primary?: boolean }[]
  emails: { id?: string; type: EmailType; email: string; is_primary?: boolean }[]
}

export async function createLocalContact(userId: string, input: NewContactInput): Promise<LocalContact> {
  const id = newLocalId()
  const now = new Date().toISOString()
  const contact: LocalContact = {
    id,
    user_id: userId,
    first_name: input.first_name ?? null,
    last_name: input.last_name ?? null,
    company: input.company ?? null,
    job_title: input.job_title ?? null,
    notes: input.notes ?? null,
    address: input.address ?? null,
    dob: input.dob ?? null,
    emergency_contact: input.emergency_contact ?? null,
    is_favorite: !!input.is_favorite,
    is_archived: !!input.is_archived,
    version: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    phones: input.phones.map((p) => ({
      id: p.id ?? newLocalId(),
      type: p.type,
      phone_number: formatToE164(p.phone_number, '+504'),
      is_primary: p.is_primary ?? false,
    })),
    emails: input.emails.map((e) => ({
      id: e.id ?? newLocalId(),
      type: e.type,
      email: e.email,
      is_primary: e.is_primary ?? false,
    })),
    label_ids: input.label_ids ?? [],
    synced: 0,
    deleted: 0,
  }

  await db.contacts.add(contact)
  void mirrorLocalContact(contact)
  void pushLocalChanges(userId)
  return contact
}

export interface UpdateContactPatch {
  first_name?: string | null
  last_name?: string | null
  patient_id?: string | null
  company?: string | null
  job_title?: string | null
  notes?: string | null
  address?: string | null
  dob?: string | null
  gender?: string | null
  emergency_contact?: string | null
  insurance_provider?: string | null
  policy_number?: string | null
  blood_type?: string | null
  is_favorite?: boolean
  is_archived?: boolean
  label_ids?: string[]
  phones?: LocalContactPhone[]
  emails?: LocalContactEmail[]
}

export async function updateLocalContact(id: string, patch: UpdateContactPatch): Promise<void> {
  const existing = await db.contacts.get(id)
  if (!existing) return

  const { label_ids, phones, ...rest } = patch
  await db.contacts.update(id, {
    ...rest,
    ...(label_ids !== undefined ? { label_ids } : {}),
    ...(phones !== undefined
      ? { phones: phones.map((p) => ({ ...p, phone_number: formatToE164(p.phone_number, '+504') })) }
      : {}),
    version: (existing.version ?? 1) + 1,
    updated_at: new Date().toISOString(),
    synced: 0,
  })
  const updated = await db.contacts.get(id)
  if (updated) {
    void mirrorLocalContact(updated)
  }
  void pushLocalChanges(existing.user_id)
}

export async function toggleFavoriteLocal(id: string): Promise<void> {
  const existing = await db.contacts.get(id)
  if (!existing) return
  await db.contacts.update(id, {
    is_favorite: !existing.is_favorite,
    version: (existing.version ?? 1) + 1,
    updated_at: new Date().toISOString(),
    synced: 0,
  })
  void pushLocalChanges(existing.user_id)
}

export async function softDeleteLocalContact(id: string): Promise<void> {
  const existing = await db.contacts.get(id)
  if (!existing) return
  await db.contacts.update(id, {
    deleted: 1,
    deleted_at: new Date().toISOString(),
    version: (existing.version ?? 1) + 1,
    updated_at: new Date().toISOString(),
    synced: 0,
  })
  void deleteMirroredNativeContact(existing)
  void pushLocalChanges(existing.user_id)
}

export async function restoreLocalContact(id: string): Promise<void> {
  const existing = await db.contacts.get(id)
  if (!existing) return
  await db.contacts.update(id, {
    deleted: 0,
    deleted_at: null,
    version: (existing.version ?? 1) + 1,
    updated_at: new Date().toISOString(),
    synced: 0,
  })
  void pushLocalChanges(existing.user_id)
}

export function permanentlyDeleteLocalContact(id: string): Promise<void> {
  return withSyncLock(() => runPermanentDelete(id))
}

async function runPermanentDelete(id: string): Promise<void> {
  const existing = await db.contacts.get(id)
  if (!existing) return
  // Child rows (phones, emails, junctions) and the 1:1 medical history clean
  // up via ON DELETE CASCADE, so one server call is enough.
  await supabase.from('contacts').delete().eq('id', id).throwOnError()
  await db.medicalHistories.delete(id)
  await db.contacts.delete(id)
}

export interface MedicalHistoryPatch {
  allergies?: string[]
  chronicConditions?: string[]
  currentMedications?: string[]
  odontogramNotes?: string | null
  lastDentalVisit?: string | null
  bloodType?: string | null
}

export async function updateMedicalHistory(contactId: string, patch: MedicalHistoryPatch): Promise<void> {
  const existing = await db.medicalHistories.get(contactId)
  const next: MedicalHistory = {
    contactId,
    allergies: patch.allergies ?? existing?.allergies ?? [],
    chronicConditions: patch.chronicConditions ?? existing?.chronicConditions ?? [],
    currentMedications: patch.currentMedications ?? existing?.currentMedications ?? [],
    odontogramNotes: patch.odontogramNotes ?? existing?.odontogramNotes ?? undefined,
    lastDentalVisit: patch.lastDentalVisit ?? existing?.lastDentalVisit ?? undefined,
    bloodType: patch.bloodType ?? existing?.bloodType ?? undefined,
    updatedAt: new Date().toISOString(),
    synced: 0,
  }
  await db.medicalHistories.put(next)
  const contact = await db.contacts.get(contactId)
  if (contact) void pushLocalChanges(contact.user_id)
}

export async function removeMedicalHistory(contactId: string): Promise<void> {
  const existing = await db.medicalHistories.get(contactId)
  if (!existing) return
  await db.medicalHistories.delete(contactId)
  await supabase.from('patient_medical_history').delete().eq('contact_id', contactId).throwOnError()
}

export async function createLocalLabel(userId: string, name: string, color?: string): Promise<LocalLabel> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('El nombre de la etiqueta está vacío')
  // contact_labels is UNIQUE (user_id, name), so a duplicate created here could
  // only ever reach the server as a 409 — reject it up front instead.
  const siblings = await db.labels.where('user_id').equals(userId).toArray()
  if (siblings.some((l) => l.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`Ya existe una etiqueta llamada "${trimmed}"`)
  }
  const id = newLocalId()
  const label: LocalLabel = {
    id,
    user_id: userId,
    name: trimmed,
    color: color ?? LABEL_COLORS[newLocalId().charCodeAt(0) % LABEL_COLORS.length],
    synced: 0,
  }
  await db.labels.add(label)
  void pushLocalChanges(userId)
  return label
}

export interface LocalLabelPatch {
  name?: string
  color?: string
}

/** Rename / recolor a label locally; the sync push (UPDATE-first) propagates it. */
export async function updateLocalLabel(userId: string, id: string, patch: LocalLabelPatch): Promise<void> {
  const existing = await db.labels.get(id)
  if (!existing) return
  const next: Partial<LocalLabel> = {
    ...patch,
    synced: 0,
  }
  await db.labels.update(id, next)
  void pushLocalChanges(userId)
}

/** Soft-remove a label locally; junctions cascade on the server via DELETE-first sync. */
export function deleteLocalLabel(userId: string, id: string): Promise<void> {
  return withSyncLock(() => runDeleteLocalLabel(userId, id))
}

async function runDeleteLocalLabel(userId: string, id: string): Promise<void> {
  await db.labels.delete(id)
  await db.contacts.where('user_id').equals(userId).each(async (c) => {
    if (c.label_ids.includes(id)) {
      await db.contacts.update(c.id, {
        label_ids: c.label_ids.filter((lid) => lid !== id),
        version: (c.version ?? 1) + 1,
        updated_at: new Date().toISOString(),
        synced: 0,
      })
    }
  })
  try {
    // Delete the label row directly so a later pull does NOT resurrect it
    // (the reconcile step re-puts every server-side label). Junction rows
    // cascade via contact_label_junction ON DELETE CASCADE.
    await supabase.from('contact_labels').delete().eq('id', id).throwOnError()
  } catch (err) {
    console.warn(`[sync] no se pudo eliminar la etiqueta ${id} en la nube (se reintentará en la próxima escritura):`, err)
  }
  void pushLocalChanges(userId)
}

export async function countPendingSync(): Promise<number> {
  return db.contacts.where('synced').equals(0).count()
}