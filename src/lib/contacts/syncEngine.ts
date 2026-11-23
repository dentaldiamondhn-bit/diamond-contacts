import { pullRemoteData, pushRemoteData } from './syncApi'
import { formatToE164 } from './vcard'
import {
  NativeContactsBridge,
  notifyNativeContactsChanged,
  deleteMirroredNativeContact,
  mirrorLocalContact,
  syncContactToAndroidNative,
} from '../../services/nativeContactsService'
import { Capacitor } from '@capacitor/core'
import {
  db,
  getContactIdsForUser,
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

/**
 * Local cross-account purge is opt-in and OFF by default.
 *
 * Deleting another account's rows from this device is irreversible, and until
 * the Supabase backup is restored it can destroy the only surviving copy of a
 * clinic's contacts. So there is deliberately NO `NODE_ENV === 'production'`
 * shortcut here: a production build must arm this explicitly via
 * `NEXT_PUBLIC_ENABLE_PURGE=1`.
 */
const PURGE_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_PURGE === '1' || process.env.ENABLE_PURGE === '1'

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

interface OutboxFlushOptions {
  skipPull?: boolean
}

/**
 * Enqueue a local mutation into the offline outbox.
 *
 * Write failures (storage quota, IndexedDB errors) are logged but do not
 * crash the originating call: the in-memory change already occurred, so we
 * can still try to push if the browser becomes online. If we cannot even
 * persist the outbox row, the caller proceeds and the normal synced:0 flow
 * still covers it.
 */
async function enqueueOutbox(
  item: Omit<import('@/lib/contacts/db').OutboxItem, 'id' | 'created_at'> & {
    created_at?: number
  },
): Promise<void> {
  try {
    await db.offlineOutbox.add({
      ...item,
      created_at: item.created_at ?? Date.now(),
      payload: item.payload ?? null,
    } as import('@/lib/contacts/db').OutboxItem)
  } catch (err) {
    console.warn('[Offline Engine] No se pudo encolar mutación:', err)
  }
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

async function pushLabels(
  userId: string,
  remoteLabels: Array<{ id: string; name: string; color: string }>,
): Promise<{ toPush: Array<{ id: string; user_id: string; name: string; color: string }>; pushed: number }> {
  const all = await db.labels.where('user_id').equals(userId).toArray()
  const unsynced = all.filter((l) => l.synced === 0)
  const remoteLabelByName = new Map(remoteLabels.map((l) => [l.name.toLowerCase(), l]))
  let pushed = 0
  const toPush: Array<{ id: string; user_id: string; name: string; color: string }> = []

  for (const label of unsynced) {
    const existing = remoteLabelByName.get(label.name.toLowerCase())
    if (existing && existing.id !== label.id) {
      // Same name, different id: fold the local row onto the server one so
      // local references (and the junction rows) keep pointing at a real label.
      await adoptRemoteLabel(label.id, existing, userId)
      pushed += 1
    } else {
      toPush.push({ id: label.id, user_id: label.user_id, name: label.name, color: label.color })
    }
  }

  return { toPush, pushed }
}

async function runPushLocalChanges(userId: string): Promise<number> {
  // Scoped by user_id on purpose: IndexedDB survives sign-out, so an unscoped
  // `where('synced')` sweep would upload (and resurrect) the previous account's
  // pending rows from whichever device is now signed in.
  const unsynced = (await db.contacts.where('user_id').equals(userId).toArray()).filter(
    (c) => c.synced === 0,
  )
  if (unsynced.length === 0) {
    // Still push labels/medical history even if no contact changes.
    const labels = await db.labels.where('user_id').equals(userId).filter((l) => l.synced === 0).toArray()
    const histories = await db.medicalHistories.where('synced').equals(0).toArray()
    const owned = new Set(await getContactIdsForUser(userId))
    const unsyncedHistories = histories.filter((h) => owned.has(h.contactId))
    if (labels.length === 0 && unsyncedHistories.length === 0) return 0
    const remote = await pullRemoteData(userId)
    const remoteLabels = remote.data?.labels ?? []
    const { toPush, pushed: labelPushed } = await pushLabels(userId, remoteLabels)
    const medicalHistoryPayload = await Promise.all(unsyncedHistories.map(async (h) => {
      const owner = await db.contacts.get(h.contactId) // sync, best effort
      return {
        contact_id: h.contactId,
        user_id: owner?.user_id ?? null,
        allergies: h.allergies,
        chronic_conditions: h.chronicConditions,
        current_medications: h.currentMedications,
        odontogram_notes: h.odontogramNotes ?? null,
        last_dental_visit: h.lastDentalVisit ?? null,
        blood_type: h.bloodType ?? null,
        updated_at: h.updatedAt ?? new Date().toISOString(),
      }
    }))
    const pushPayload: any = {
      contacts: [],
      labels: toPush,
      phones: [],
      emails: [],
      junctions: [],
      medicalHistory: medicalHistoryPayload,
      deletions: { contacts: [], labels: [], medicalHistory: [] },
    }
    const { error } = await pushRemoteData(pushPayload)
    if (error) throw new Error(error)
    for (const l of toPush) await db.labels.update(l.id, { synced: 1 })
    for (const h of unsyncedHistories) {
      await db.medicalHistories.update(h.contactId, { synced: 1, updatedAt: new Date().toISOString() })
    }
    return labelPushed + unsyncedHistories.length
  }

  const now = new Date().toISOString()
  const pushContacts: Array<Record<string, unknown>> = []
  const pushPhones: Array<Record<string, unknown>> = []
  const pushEmails: Array<Record<string, unknown>> = []
  const pushJunctions: Array<{ contact_id: string; label_id: string }> = []
  const contactsToMarkSynced: string[] = []

  for (const contact of unsynced) {
    try {
      if (contact.deleted === 1) {
        pushContacts.push({
          id: contact.id,
          user_id: userId,
          deleted_at: now,
          updated_at: now,
          version: (contact.version ?? 1) + 1,
          deleted: 1,
        })
      } else {
        const { id, phones, emails, label_ids, ...rest } = contact
        const { synced: _synced, deleted: _deleted, deleted_at: _deletedAt, ...payload } = rest
        pushContacts.push({
          id,
          user_id: userId,
          ...payload,
          deleted_at: null,
          updated_at: now,
          version: (contact.version ?? 1) + 1,
        })
        for (const p of phones) {
          pushPhones.push({
            id: p.id,
            contact_id: id,
            type: p.type,
            phone_number: p.phone_number,
            is_primary: !!p.is_primary,
          })
        }
        for (const e of emails) {
          pushEmails.push({
            id: e.id,
            contact_id: id,
            type: e.type,
            email: e.email,
            is_primary: !!e.is_primary,
          })
        }
        for (const lid of label_ids) {
          pushJunctions.push({ contact_id: id, label_id: lid })
        }
      }
      contactsToMarkSynced.push(contact.id)
    } catch (err) {
      console.error(`[sync] push fallida para ${contact.id}:`, err)
    }
  }

  // Pull remote labels for conflict resolution before pushing labels.
  const remote = await pullRemoteData(userId)
  const remoteLabels = remote.data?.labels ?? []
  const { toPush: pushLabelsArr, pushed: labelPushed } = await pushLabels(userId, remoteLabels)

  // Medical histories whose contacts are owned by this account.
  const owned = new Set(await getContactIdsForUser(userId))
  const allHistories = await db.medicalHistories.where('synced').equals(0).toArray()
  const unsyncedHistories = allHistories.filter((h) => owned.has(h.contactId))
  const pushMedicalHistory = unsyncedHistories.map(async (h) => {
    const owner = await db.contacts.get(h.contactId)
    return {
      contact_id: h.contactId,
      user_id: owner?.user_id ?? null,
      allergies: h.allergies,
      chronic_conditions: h.chronicConditions,
      current_medications: h.currentMedications,
      odontogram_notes: h.odontogramNotes ?? null,
      last_dental_visit: h.lastDentalVisit ?? null,
      blood_type: h.bloodType ?? null,
      updated_at: h.updatedAt ?? new Date().toISOString(),
    }
  })
  const pushMedicalHistoryResolved = await Promise.all(pushMedicalHistory)

  const pushPayload: any = {
    contacts: pushContacts,
    labels: pushLabelsArr,
    phones: pushPhones,
    emails: pushEmails,
    junctions: pushJunctions,
    medicalHistory: pushMedicalHistoryResolved,
    deletions: { contacts: [], labels: [], medicalHistory: [] },
  }

  const { error } = await pushRemoteData(pushPayload)
  if (error) throw new Error(error)

  // Mark synced on success.
  for (const id of contactsToMarkSynced) {
    const contact = await db.contacts.get(id)
    if (!contact) continue
    await db.contacts.update(id, {
      synced: 1,
      deleted_at: contact.deleted === 1 ? contact.deleted_at ?? now : null,
      version: (contact.version ?? 1) + 1,
    })
  }
  for (const l of pushLabelsArr) await db.labels.update(l.id, { synced: 1 })
  for (const h of unsyncedHistories) {
    await db.medicalHistories.update(h.contactId, { synced: 1, updatedAt: new Date().toISOString() })
  }

  return contactsToMarkSynced.length + labelPushed + unsyncedHistories.length
}

export function pushLocalChanges(userId: string): Promise<number> {
  return withSyncLock(() => runPushLocalChanges(userId))
}

export async function flushOfflineOutbox(userId: string, opts?: OutboxFlushOptions): Promise<number> {
  return withSyncLock(async () => {
    if (!userId) return 0
    const items = await db.offlineOutbox.where('user_id').equals(userId).sortBy('created_at')
    let processed = 0
    for (const item of items) {
      try {
        const contact = await db.contacts.get(item.contact_id)
        // Re-apply/replay by driving the normal push for this contact state.
        // If contact is hard-deleted (not present in Dexie but action DELETE),
        // runPushLocalChanges will still see synced:0 rows; but contact no longer exists.
        // However, soft DELETE sets synced:0 + deleted:1; permanent delete clears from db.
        // For replay, just run a full push batch for this user — it's already scoped.
        // But to minimize work: trigger runPushLocalChanges which covers unsynced contacts/labels/histories.
        await runPushLocalChanges(userId)
        await db.offlineOutbox.delete(item.id as number)
        processed += 1
      } catch (err) {
        console.error('[Offline Engine] Error al vaciar outbox:', err)
        break // stop, retry later
      }
    }
    if (processed > 0 && !opts?.skipPull) {
      try {
        await pullRemoteContacts(userId)
      } catch (err) {
        console.error('[Offline Engine] pull post-outbox fallida:', err)
      }
    }
    return processed
  })
}

// ---------------------------------------------------------------------------
// MEDICAL HISTORY sync (1:1 summary per contact)
// ---------------------------------------------------------------------------

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
  // The server pull is always authorized via Clerk auth + service role key.
  // No client JWT is needed; RLS is bypassed on the server.
  const remote = await pullRemoteData(userId, 2000)
  if (remote.error) throw new Error(remote.error)

  const rows = (remote.data?.contacts ?? []) as RemoteContactRow[]
  const labelRows = (remote.data?.labels ?? []) as RemoteLabelRow[]
  const junctionRows = (remote.data?.junctions ?? []) as RemoteJunctionRow[]
  const medicalHistoryRows = (remote.data?.medicalHistory ?? []) as RemoteHistoryRow[]

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
    if (existing && existing.synced === 0 && localTs >= remoteTs) continue

    const local = toLocalContact(row, userId)
    local.label_ids = junctionByContact.get(row.id) ?? []
    await db.contacts.put(local)
    reconciled += 1
  }

  // Sync reconciled remote contacts to native Android address book and notify system observers
  if (Capacitor.isNativePlatform() && rows.length > 0) {
    try {
      for (const row of rows) {
        const deletedAt = row.deleted_at
        if (deletedAt) continue
        const phones = Array.isArray(row.contact_phones) ? row.contact_phones : []
        const emails = Array.isArray(row.contact_emails) ? row.contact_emails : []
        const primaryPhone = phones.find((p) => p.is_primary) || phones[0]
        const primaryEmail = emails.find((e) => e.is_primary) || emails[0]
        if (!primaryPhone?.phone_number) continue
        const givenName = row.first_name ?? ''
        const familyName = row.last_name ?? ''
        const fullName = `${givenName} ${familyName}`.trim()
        const noteParts: string[] = []
        if (row.notes) noteParts.push(row.notes)
        if (row.company) noteParts.push(`Empresa: ${row.company}`)
        if (row.job_title) noteParts.push(`Cargo: ${row.job_title}`)
        if (row.address) noteParts.push(`Dirección: ${row.address}`)
        if (row.dob) noteParts.push(`Nacimiento: ${row.dob}`)
        const note = noteParts.join('\n') || undefined
        try {
          await syncContactToAndroidNative({
            givenName,
            familyName,
            phone: formatToE164(primaryPhone.phone_number, '+504'),
            e164: formatToE164(primaryPhone.phone_number, '+504'),
            email: primaryEmail?.email ?? undefined,
            note,
          })
        } catch (err) {
          console.warn(`[sync] syncContactToAndroidNative falló para ${row.id}:`, err)
        }
      }
      await notifyNativeContactsChanged()
      console.log('[Sync Engine] Remote contacts pulled & Android OS notified for WhatsApp.')
    } catch (err) {
      console.warn('[sync] notificación nativa post-pull fallida:', err)
    }
  }

  // Collect remote contact IDs that were explicitly deleted (have deleted_at).
  const remoteDeletedIds = new Set(
    rows.filter((r) => r.deleted_at).map((r) => r.id),
  )

  // Tombstone any synced local rows that the remote explicitly deleted.
  const localRows = await db.contacts.where('user_id').equals(userId).toArray()
  for (const local of localRows) {
    if (local.synced === 1 && !local.deleted && remoteDeletedIds.has(local.id)) {
      await db.contacts.update(local.id, { deleted: 1, deleted_at: new Date().toISOString() })
    }
  }

  // Reconcile medical histories from the pull result (best-effort).
  try {
    await reconcileMedicalHistoriesFromPull(medicalHistoryRows, rows, localRows.length)
  } catch (err) {
    console.warn('[sync] reconciliación de historiales clínicos fallida (se reintentará):', err)
  }

  return reconciled
}

async function reconcileMedicalHistoriesFromPull(
  remoteHistories: RemoteHistoryRow[],
  rows: RemoteContactRow[],
  localRowCount: number,
): Promise<void> {
  const remoteContactIds = new Set(rows.map((r) => r.id))
  const remoteHistoryIds = new Set(remoteHistories.map((h) => h.contact_id))

  // Local unsynced history that is newer wins and gets pushed on next sync.
  for (const row of remoteHistories) {
    const existing = await db.medicalHistories.get(row.contact_id)
    const remoteTs = new Date(row.updated_at ?? 0).getTime()
    const localTs = existing ? new Date(existing.updatedAt ?? 0).getTime() : 0
    if (existing && existing.synced === 0 && localTs >= remoteTs) continue
    await db.medicalHistories.put(toLocalMedicalHistory(row))
  }

  // Drop local histories whose contact is gone or whose server row was deleted.
  const ownedContactIds = new Set(await getContactIdsForUser(userIdFromRows(rows)))
  const localHistories = await db.medicalHistories.toArray()
  for (const local of localHistories) {
    if (!ownedContactIds.has(local.contactId)) continue
    const stillLinked = remoteContactIds.has(local.contactId)
    if (local.synced === 1 && (!stillLinked || !remoteHistoryIds.has(local.contactId))) {
      await db.medicalHistories.delete(local.contactId)
    }
  }
}

function userIdFromRows(rows: RemoteContactRow[]): string {
  for (const r of rows) {
    if (r.user_id) return r.user_id
  }
  return ''
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
): { channel: { unsubscribe: () => void }; unsubscribe: () => void } {
  // Realtime websockets require a verified Clerk JWT on the Supabase socket,
  // which the anon-key client no longer provides. Cross-device sync is driven
  // by pull on mount, focus, and online events instead. Keep the API shape so
  // callers can still call .unsubscribe().
  return {
    channel: { unsubscribe: () => {} },
    unsubscribe: () => {},
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
    void flushOfflineOutbox(userId)
      .then(() => pushLocalChanges(userId))
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
    syncNow: () => flushOfflineOutbox(userId).then((n) => pushLocalChanges(userId).then((p) => p + n)).then((n) => pullRemoteContacts(userId).then(() => n)),
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
  await enqueueOutbox({
    contact_id: id,
    action: 'CREATE',
    payload: { id },
    user_id: userId,
  })
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
  await enqueueOutbox({
    contact_id: id,
    action: 'UPDATE',
    payload: { id },
    user_id: existing.user_id,
  })
  void pushLocalChanges(existing.user_id)
  await enqueueOutbox({
    contact_id: id,
    action: 'UPDATE',
    payload: { id },
    user_id: existing.user_id,
  })
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
  await enqueueOutbox({
    contact_id: id,
    action: 'UPDATE',
    payload: { id },
    user_id: existing.user_id,
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
  await enqueueOutbox({
    contact_id: id,
    action: 'DELETE',
    payload: { id },
    user_id: existing.user_id,
  })
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
  await enqueueOutbox({
    contact_id: id,
    action: 'UPDATE',
    payload: { id },
    user_id: existing.user_id,
  })
  void pushLocalChanges(existing.user_id)
}

export function permanentlyDeleteLocalContact(id: string): Promise<void> {
  return withSyncLock(() => runPermanentDelete(id))
}

async function runPermanentDelete(id: string): Promise<void> {
  const existing = await db.contacts.get(id)
  if (!existing) return

  // Archive a full snapshot BEFORE the hard delete. The cascade below removes
  // the child rows and the medical history, so without this the delete is
  // irreversible and there is no other "deleted_contacts" store to recover
  // from. Best effort: an archive failure must not block the user's delete.
  try {
    const history = await db.medicalHistories.get(id)
    const snapshot = { contact: existing, medical_history: history ?? null }
    await pushRemoteData({
      contacts: [],
      labels: [],
      phones: [],
      emails: [],
      junctions: [],
      medicalHistory: [],
      deletions: {
        contacts: [{
          id: existing.id,
          user_id: existing.user_id,
          first_name: existing.first_name,
          last_name: existing.last_name,
          deleted_at: existing.deleted_at ?? null,
          snapshot,
        }],
        labels: [],
        medicalHistory: [],
      },
    })
  } catch (err) {
    console.error('[sync] no se pudo archivar el contacto eliminado en deleted_contacts:', err)
  }

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
  await pushRemoteData({
    contacts: [],
    labels: [],
    phones: [],
    emails: [],
    junctions: [],
    medicalHistory: [],
    deletions: { contacts: [], labels: [], medicalHistory: [contactId] },
  }).catch((err) => {
    console.error(`[sync] no se pudo eliminar el historial clínico ${contactId} en la nube:`, err)
  })
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
    await pushRemoteData({
      contacts: [],
      labels: [],
      phones: [],
      emails: [],
      junctions: [],
      medicalHistory: [],
      deletions: { contacts: [], labels: [id], medicalHistory: [] },
    })
  } catch (err) {
    console.warn(`[sync] no se pudo eliminar la etiqueta ${id} en la nube (se reintentará en la próxima escritura):`, err)
  }
  void pushLocalChanges(userId)
}

export async function countPendingSync(userId: string): Promise<number> {
  if (!userId) return 0
  const rows = await db.contacts.where('user_id').equals(userId).toArray()
  const unsynced = rows.filter((c) => c.synced === 0 && c.deleted === 0).length
  const outbox = await db.offlineOutbox.where('user_id').equals(userId).count()
  return unsynced + outbox
}

/**
 * Recovers contacts that were erroneously tombstoned by the pull reconcile.
 *
 * A contact tombstoned by reconcile has `deleted === 1` and `synced === 1`
 * (never pushed, since reconcile never marks synced === 0). A contact the
 * user explicitly deleted locally has `deleted === 1` and `synced === 0`
 * (waiting to be pushed). We only recover the former — those that were never
 * meant to be deleted by the user.
 *
 * After calling this, run `flushOfflineOutbox` + `pushLocalChanges` + 
 * `pullRemoteContacts` (i.e. `syncNow()`) to re-create them on Supabase and
 * re-pull on every device.
 */
export async function recoverErroneousTombstones(userId: string): Promise<number> {
  if (!userId) return 0
  const tombstoned = await db.contacts
    .where('user_id')
    .equals(userId)
    .filter((c) => c.deleted === 1 && c.synced === 1)
    .toArray()

  if (tombstoned.length === 0) return 0

  await db.transaction('rw', db.contacts, async () => {
    for (const c of tombstoned) {
      await db.contacts.update(c.id, { deleted: 0, deleted_at: null, synced: 0 })
    }
  })

  console.info(
    `[sync] recuperados ${tombstoned.length} contacto(s) tombstoneados por error`,
  )
  return tombstoned.length
}

/**
 * Removes every OTHER account's rows from this device's IndexedDB.
 *
 * Reading scoped (see queryContacts) stops accounts from seeing each other, but
 * IndexedDB is per-origin: without this, the signed-out account's patient data
 * would sit at rest on the device — readable from devtools and recoverable by
 * anyone with the WebView's storage. Called whenever a user id resolves, so an
 * account switch evicts the previous account locally (it simply re-pulls from
 * Supabase next time).
 */
export async function purgeOtherUsersData(activeUserId: string): Promise<number> {
  if (!activeUserId) return 0
  if (!PURGE_ENABLED) {
    console.warn(
      '[sync] purgeOtherUsersData: deshabilitado (activa con NEXT_PUBLIC_ENABLE_PURGE=1 en producción/preview mientras se recupera el backup de Supabase)',
    )
    return 0
  }

  const foreignContacts = (await db.contacts.toArray()).filter(
    (c) => c.user_id !== activeUserId,
  )
  if (foreignContacts.length === 0) {
    // Still sweep orphan histories/mirrors left behind by older builds.
    const owned = new Set(await getContactIdsForUser(activeUserId))
    const orphanHistories = (await db.medicalHistories.toArray()).filter(
      (h) => !owned.has(h.contactId),
    )
    if (orphanHistories.length) await db.medicalHistories.bulkDelete(orphanHistories.map((h) => h.contactId));
    return 0
  }

  await db.transaction('rw', db.contacts, db.labels, db.medicalHistories, db.nativeMirrors, async () => {
    for (const c of foreignContacts) {
      await db.nativeMirrors.delete(c.id)
      await db.medicalHistories.delete(c.id)
    }
    await db.contacts.bulkDelete(foreignContacts.map((c) => c.id))

    const foreignLabels = (await db.labels.toArray()).filter((l) => l.user_id !== activeUserId)
    if (foreignLabels.length) await db.labels.bulkDelete(foreignLabels.map((l) => l.id))
  })

  console.info(
    `[sync] purga local: ${foreignContacts.length} contacto(s) de otra(s) cuenta(s) eliminados de este dispositivo`,
  )
  return foreignContacts.length
}