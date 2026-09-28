import { Capacitor } from '@capacitor/core';
import { Contacts, PhoneType, EmailType } from '@capacitor-community/contacts';
import { formatToE164 } from '@/lib/contacts/vcard';

interface MirrorableContact {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  phones?: { phone_number: string }[];
  emails?: { email: string }[];
}

const mirrorKey = (id: string) => `dl_native_mirrored:${id}`;
const hashKey = (id: string) => `dl_native_hash:${id}`;

/**
 * Asks for READ_CONTACTS/WRITE_CONTACTS on first app launch (native only).
 * Keeps the first silent create/edit from being blocked by a late prompt.
 */
export async function requestContactsPermissionOnStart(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Contacts.requestPermissions();
  } catch {
    // Ignore denials; per-op grants are re-requested in syncContactToAndroidNative.
  }
}

function contactFingerprint(contact: MirrorableContact): string {
  return [
    contact.first_name ?? '',
    contact.last_name ?? '',
    contact.phones?.[0]?.phone_number ?? '',
    contact.emails?.[0]?.email ?? '',
  ].join('|');
}

/**
 * Mirrors a contact into the Android System Address Book as a single card.
 * The plugin has no update API in v8, so edits are applied as delete + recreate
 * (a fresh card with the same name/E.164 number, still matched by caller-ID and
 * WhatsApp). A content hash skips the write when nothing relevant changed.
 */
export async function mirrorLocalContact(contact: MirrorableContact) {
  if (!Capacitor.isNativePlatform() || !contact.id) return;
  if (!contact.first_name && !contact.last_name) return;
  const phone = formatToE164(contact.phones?.[0]?.phone_number, '+504');
  if (!phone) return;

  const fingerprint = contactFingerprint(contact);
  try {
    if (localStorage.getItem(hashKey(contact.id)) === fingerprint) return;
  } catch {
    // Storage unavailable: fall through and re-mirror.
  }

  const nativeId = readNativeId(contact.id);
  if (nativeId && nativeId !== '1') {
    try {
      await Contacts.deleteContact({ contactId: nativeId });
    } catch {
      // Best-effort; a stale nativeId (e.g. contact removed by user) is fine.
    }
  }

  try {
    const result = await syncContactToAndroidNative({
      givenName: contact.first_name ?? '',
      familyName: contact.last_name ?? '',
      phone,
      email: contact.emails?.[0]?.email,
    });
    if (!result) return;
    localStorage.setItem(mirrorKey(contact.id), result.contactId);
    localStorage.setItem(hashKey(contact.id), fingerprint);
  } catch (err) {
    console.error('Failed writing contact to Android System Store:', err);
  }
}

/** Deletes the mirrored native card when a contact is moved to the trash. */
export async function deleteMirroredNativeContact(contact: { id?: string }): Promise<void> {
  if (!Capacitor.isNativePlatform() || !contact.id) return;
  const nativeId = readNativeId(contact.id);
  if (!nativeId || nativeId === '1') return;
  try {
    await Contacts.deleteContact({ contactId: nativeId });
  } catch {
    // Best-effort; nothing to do if the card no longer exists.
  }
  try {
    localStorage.removeItem(mirrorKey(contact.id));
    localStorage.removeItem(hashKey(contact.id));
  } catch {
    // Ignore storage failures.
  }
}

function readNativeId(id: string): string | null {
  try {
    return localStorage.getItem(mirrorKey(id));
  } catch {
    return null;
  }
}

export async function syncContactToAndroidNative(contact: {
  givenName: string;
  familyName: string;
  phone: string;
  email?: string;
}): Promise<{ contactId: string; synced: boolean } | { contactId: null; synced: false }> {
  if (!Capacitor.isNativePlatform()) return { contactId: null, synced: false };

  const permission = await Contacts.requestPermissions();
  if (permission.contacts !== 'granted') return { contactId: null, synced: false };

  try {
    const result = await Contacts.createContact({
      contact: {
        name: { given: contact.givenName, family: contact.familyName },
        organization: { company: 'Clinica Dental Diamond' },
        phones: [{ type: PhoneType.Mobile, label: 'mobile', number: contact.phone }],
        emails: contact.email ? [{ type: EmailType.Work, label: 'work', address: contact.email }] : [],
      },
    });
    return { contactId: result.contactId, synced: true };
  } catch (err) {
    console.error('Failed writing contact to Android System Store:', err);
    return { contactId: null, synced: false };
  }
}