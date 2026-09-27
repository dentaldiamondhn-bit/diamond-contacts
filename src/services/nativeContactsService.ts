import { Contacts, PhoneType, EmailType } from '@capacitor-community/contacts';
import { Capacitor } from '@capacitor/core';

interface MirrorableContact {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  phones?: { phone_number: string }[];
  emails?: { email: string }[];
}

const mirrorKey = (id: string) => `dl_native_mirrored:${id}`;

export async function mirrorLocalContact(contact: MirrorableContact) {
  if (!Capacitor.isNativePlatform() || !contact.id) return;
  if (!contact.first_name && !contact.last_name) return;

  try {
    if (localStorage.getItem(mirrorKey(contact.id))) return;
  } catch {
    return;
  }

  const phone = contact.phones?.[0]?.phone_number ?? '';
  await syncContactToAndroidNative({
    givenName: contact.first_name ?? '',
    familyName: contact.last_name ?? '',
    phone,
    email: contact.emails?.[0]?.email,
  });

  try {
    localStorage.setItem(mirrorKey(contact.id), '1');
  } catch {
    // Ignore storage failures; worst case a duplicate native card next edit.
  }
}

export async function syncContactToAndroidNative(contact: {
  givenName: string;
  familyName: string;
  phone: string;
  email?: string;
}) {
  if (!Capacitor.isNativePlatform()) return;

  const permission = await Contacts.requestPermissions();
  if (permission.contacts !== 'granted') return;

  try {
    await Contacts.createContact({
      contact: {
        name: { given: contact.givenName, family: contact.familyName },
        organization: { company: 'Clinica Dental Diamond' },
        phones: [{ type: PhoneType.Mobile, label: 'mobile', number: contact.phone }],
        emails: contact.email ? [{ type: EmailType.Work, label: 'work', address: contact.email }] : [],
      },
    });
  } catch (err) {
    console.error('Failed writing contact to Android System Store:', err);
  }
}