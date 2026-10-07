import { Capacitor, registerPlugin } from '@capacitor/core';
import { Contacts, PhoneType, EmailType } from '@capacitor-community/contacts';
import { formatToE164 } from '@/lib/contacts/vcard';
import { db, type NativeMirror } from '@/lib/contacts/db';

interface MirrorableContact {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  phones?: { phone_number: string }[];
  emails?: { email: string }[];
  notes?: string | null;
}

interface BridgeContact {
  givenName: string;
  familyName: string;
  /** Human-readable display number, e.g. "+504 8855-5983". */
  phone: string;
  /** Strict E.164, e.g. "+50488555983" (stored into Phone.NORMALIZED_NUMBER). */
  e164: string;
  email?: string;
  note?: string;
}

interface NativeBridgePlugin {
  getAccounts(): Promise<{ accounts: Array<{ type: string; name: string; syncable: boolean }> }>;
  upsertContact(options: BridgeContact & { accountType?: string | null; accountName?: string | null }): Promise<{
    contactId: string;
    rawContactId: string;
    updated: boolean;
    accountType: string | null;
    accountName: string | null;
  }>;
  deleteByPhone(options: { phone: string }): Promise<{ deleted: number }>;
  syncAll(options: {
    contacts: BridgeContact[];
    accountType?: string | null;
    accountName?: string | null;
  }): Promise<{ processed: number; created: number; updated: number; failed: number }>;
  notifyNativeContactsChanged(): Promise<void>;
}

export const NativeContactsBridge = registerPlugin<NativeBridgePlugin>('NativeContactsBridge');

function isBridgeAvailable(): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  if (typeof (window as unknown as { NativeContactsBridge?: unknown }).NativeContactsBridge !== 'undefined') {
    return true;
  }
  // The bridge plugin is registered on Android; trust the platform + the
  // try/catch fallback around every call.
  return true;
}

const hashKey = (id: string) => `dl_native_hash:${id}`;
const mirrorKey = (id: string) => `dl_native_mirrored:${id}`;

/**
 * Asks for READ_CONTACTS/WRITE_CONTACTS on first app launch (native only).
 * Keeps the first silent create/edit from being blocked by a late prompt.
 */
export async function requestContactsPermissionOnStart(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Contacts.requestPermissions();
  } catch {
    // Ignore denials; per-op grants are re-requested before writes.
  }
}

function contactFingerprint(contact: MirrorableContact): string {
  return [
    contact.first_name ?? '',
    contact.last_name ?? '',
    contact.phones?.[0]?.phone_number ?? '',
    contact.emails?.[0]?.email ?? '',
    contact.notes ?? '',
  ].join('|');
}

/** "+50488555983" -> "+504 8855-5983" (HN mobile layout); falls back to E.164. */
export function formatDisplayPhone(raw: string): string {
  const e164 = formatToE164(raw, '+504');
  const digits = e164.replace(/[^\d]/g, '');
  if (digits.startsWith('504') && digits.length === 12) {
    return `+504 ${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return e164;
}

function toBridgeInput(contact: MirrorableContact): BridgeContact | null {
  if (!contact.first_name && !contact.last_name) return null;
  const e164 = formatToE164(contact.phones?.[0]?.phone_number, '+504');
  if (!e164) return null;
  return {
    givenName: (contact.first_name ?? '').trim(),
    familyName: (contact.last_name ?? '').trim(),
    phone: formatDisplayPhone(contact.phones?.[0]?.phone_number ?? ''),
    e164,
    email: contact.emails?.[0]?.email?.trim() ?? '',
    note: contact.notes?.trim() ?? '',
  };
}

async function loadMirror(appContactId: string): Promise<NativeMirror | undefined> {
  try {
    return await db.nativeMirrors.get(appContactId);
  } catch {
    return undefined;
  }
}

function hasFingerprint(id: string, fingerprint: string): boolean {
  try {
    return localStorage.getItem(hashKey(id)) === fingerprint;
  } catch {
    return false;
  }
}

function saveFingerprint(id: string, fingerprint: string): void {
  try {
    localStorage.setItem(hashKey(id), fingerprint);
  } catch {
    // Ignore storage failures; worst case the card is re-mirrored next edit.
  }
}

/**
 * Mirrors a contact into the Android System Address Book.
 * Primary path: the account-aware NativeContactsBridge (in-place edit matched by
 * E.164 number, written under a syncable account so WhatsApp indexes it).
 * Fallback: @capacitor-community/contacts delete+recreate for web/emulator/dev.
 */
export async function mirrorLocalContact(contact: MirrorableContact) {
  if (!Capacitor.isNativePlatform() || !contact.id) return;
  const input = toBridgeInput(contact);
  if (!input) return;

  const fingerprint = contactFingerprint(contact);
  if (hasFingerprint(contact.id, fingerprint)) return;

  if (isBridgeAvailable()) {
    try {
      const mirror = await loadMirror(contact.id);
      const result = await NativeContactsBridge.upsertContact({
        ...input,
        accountType: mirror?.accountType ?? null,
        accountName: mirror?.accountName ?? null,
      });
      await db.nativeMirrors.put({
        appContactId: contact.id,
        nativeContactId: result.contactId,
        rawContactId: result.rawContactId,
        accountType: result.accountType ?? undefined,
        accountName: result.accountName ?? undefined,
        phone: input.phone,
        updatedAt: new Date().toISOString(),
      });
      saveFingerprint(contact.id, fingerprint);
      return;
    } catch (err) {
      console.warn('[native] bridge upsert failed, falling back to community plugin:', err);
    }
  }

  // Community-plugin fallback (delete stored card by native id, then recreate).
  const nativeId = readNativeId(contact.id);
  if (nativeId && nativeId !== '1') {
    try {
      await Contacts.deleteContact({ contactId: nativeId });
    } catch {
      // Best-effort; E.164 lookup on the next bridge run reconciles leftovers.
    }
  }
  const result = await syncContactToAndroidNative(input);
  if (!result.synced) return;
  try {
    localStorage.setItem(mirrorKey(contact.id), result.contactId);
  } catch {
    // Ignore storage failures; worst case a duplicate native card next edit.
  }
  saveFingerprint(contact.id, fingerprint);
}

/** Deletes the mirrored native card when a contact is moved to the trash. */
export async function deleteMirroredNativeContact(contact: { id?: string; phones?: { phone_number: string }[] }): Promise<void> {
  if (!Capacitor.isNativePlatform() || !contact.id) return;

  if (isBridgeAvailable()) {
    try {
      const phone = formatToE164(contact.phones?.[0]?.phone_number, '+504');
      const target = phone || (await loadMirror(contact.id))?.phone;
      if (target) await NativeContactsBridge.deleteByPhone({ phone: target });
      await db.nativeMirrors.delete(contact.id);
      clearNativeKeys(contact.id);
      return;
    } catch (err) {
      console.warn('[native] bridge delete failed, falling back to community plugin:', err);
    }
  }

  const nativeId = readNativeId(contact.id);
  if (nativeId && nativeId !== '1') {
    try {
      await Contacts.deleteContact({ contactId: nativeId });
    } catch {
      // Best-effort.
    }
  }
  clearNativeKeys(contact.id);
}

/**
 * Manual "Sincronizar Agenda Nativa": rewrites every active contact into the
 * Android Address Book in one clean loop, checking/updating matches by E.164.
 */
export interface NativeSyncSummary {
  processed: number;
  created: number;
  updated: number;
  failed: number;
  method: 'bridge' | 'community' | 'none';
}

export async function syncAllToNative(contacts: MirrorableContact[]): Promise<NativeSyncSummary> {
  const empty: NativeSyncSummary = { processed: 0, created: 0, updated: 0, failed: 0, method: 'none' };
  if (!Capacitor.isNativePlatform()) return empty;

  const valid = contacts
    .map(toBridgeInput)
    .filter((c): c is BridgeContact => c !== null);

  if (isBridgeAvailable()) {
    try {
      let pref: NativeMirror | undefined;
      for (const c of contacts) {
        if (!c.id) continue;
        pref = await loadMirror(c.id);
        if (pref) break;
      }
      const result = await NativeContactsBridge.syncAll({
        contacts: valid,
        accountType: pref?.accountType ?? null,
        accountName: pref?.accountName ?? null,
      });
      return { ...result, method: 'bridge' };
    } catch (err) {
      console.warn('[native] bridge syncAll failed:', err);
    }
  }

  // Community fallback: sequential mirror (delete+recreate), cheap for dev.
  let completed = 0;
  for (const contact of contacts) {
    await mirrorLocalContact(contact);
    completed += 1;
  }
  return { processed: completed, created: completed, updated: 0, failed: 0, method: 'community' };
}

function readNativeId(id: string): string | null {
  try {
    return localStorage.getItem(mirrorKey(id));
  } catch {
    return null;
  }
}

function clearNativeKeys(id: string): void {
  try {
    localStorage.removeItem(mirrorKey(id));
    localStorage.removeItem(hashKey(id));
  } catch {
    // Ignore storage failures.
  }
}

export async function syncContactToAndroidNative(contact: BridgeContact): Promise<{ contactId: string; synced: boolean } | { contactId: null; synced: false }> {
  if (!Capacitor.isNativePlatform()) return { contactId: null, synced: false };

  const permission = await Contacts.requestPermissions();
  if (permission.contacts !== 'granted') return { contactId: null, synced: false };

  try {
    const result = await Contacts.createContact({
      contact: {
        // v8 payload shape: name/organization/note are structured objects, not
        // the flat v6 fields (givenName/familyName/organizationName).
        name: { given: contact.givenName.trim(), family: contact.familyName.trim() },
        organization: { company: 'Clinica Dental Diamond' },
        note: contact.note?.trim() ?? '',
        phones: [
          {
            type: PhoneType.Mobile,
            label: 'mobile',
            isPrimary: true,
            number: contact.phone,
          },
        ],
        emails: contact.email
          ? [{ type: EmailType.Work, label: 'work', isPrimary: true, address: contact.email.trim() }]
          : [],
      },
    });
    console.log('Successfully written contact to native Android provider:', contact.phone);
    return { contactId: result.contactId, synced: true };
  } catch (err) {
    console.error('Error writing native contact:', err);
    return { contactId: null, synced: false };
  }
}

export async function notifyNativeContactsChanged(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
  if (isBridgeAvailable() && NativeContactsBridge.notifyNativeContactsChanged) {
    await NativeContactsBridge.notifyNativeContactsChanged();
    return;
  }
} catch (err) {
  console.warn('[native] notifyNativeContactsChanged failed:', err);
}

}