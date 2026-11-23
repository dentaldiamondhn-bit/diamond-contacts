import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/contacts/sync/push - Apply all local changes for the signed-in user.
 *
 * Body:
 *   contacts: upserts (includes soft-deleted rows with deleted===1)
 *   labels: upserts
 *   phones: full replacement per contact_id
 *   emails: full replacement per contact_id
 *   junctions: full replacement per contact_id
 *   medicalHistory: upserts keyed by contact_id
 *   deletions: { contacts:[{id,user_id,first_name,last_name,deleted_at,snapshot}], labels:[id], medicalHistory:[contactId] }
 *
 * Uses the service role key; authz enforced via Clerk `auth()`.
 */
export async function POST(req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  const body = await req.json();
  const {
    contacts = [],
    labels = [],
    phones = [],
    emails = [],
    junctions = [],
    medicalHistory = [],
    deletions = { contacts: [], labels: [], medicalHistory: [] },
  } = body;

  const supabase = createServerServiceClient();
  const now = new Date().toISOString();

  // --- Contacts: upsert (soft-delete sets deleted_at) ---
  for (const c of contacts) {
    const { id, phones: _p, emails: _e, label_ids: _l, ...rest } = c;
    const { synced: _synced, deleted: _deleted, deleted_at: _deletedAt, ...payload } = rest;

    if (c.deleted === 1) {
      await supabase
        .from('contacts')
        .update({ deleted_at: now, updated_at: now, version: (c.version ?? 1) + 1 })
        .eq('id', id)
        .throwOnError();
    } else {
      await supabase
        .from('contacts')
        .upsert(
          {
            id,
            user_id: userId,
            ...payload,
            deleted_at: null,
            updated_at: now,
            version: (c.version ?? 1) + 1,
          },
          { onConflict: 'id' },
        )
        .throwOnError();
    }
  }

  // --- Labels: upsert ---
  for (const label of labels) {
    await supabase
      .from('contact_labels')
      .upsert(
        { id: label.id, user_id: label.user_id ?? userId, name: label.name, color: label.color },
        { onConflict: 'id' },
      )
      .throwOnError();
  }

  // --- Phones: replace per contact ---
  const phoneContactIds = [...new Set(phones.map((p: { contact_id: string }) => p.contact_id))];
  for (const contactId of phoneContactIds) {
    await supabase.from('contact_phones').delete().eq('contact_id', contactId).throwOnError();
    const contactPhones = phones.filter((p: { contact_id: string }) => p.contact_id === contactId);
    if (contactPhones.length > 0) {
      await supabase
        .from('contact_phones')
        .insert(
          contactPhones.map((p) => ({
            id: p.id,
            contact_id: p.contact_id,
            type: p.type,
            phone_number: p.phone_number,
            is_primary: !!p.is_primary,
          })),
        )
        .throwOnError();
    }
  }

  // --- Emails: replace per contact ---
  const emailContactIds = [...new Set(emails.map((e: { contact_id: string }) => e.contact_id))];
  for (const contactId of emailContactIds) {
    await supabase.from('contact_emails').delete().eq('contact_id', contactId).throwOnError();
    const contactEmails = emails.filter((e: { contact_id: string }) => e.contact_id === contactId);
    if (contactEmails.length > 0) {
      await supabase
        .from('contact_emails')
        .insert(
          contactEmails.map((e) => ({
            id: e.id,
            contact_id: e.contact_id,
            type: e.type,
            email: e.email,
            is_primary: !!e.is_primary,
          })),
        )
        .throwOnError();
    }
  }

  // --- Junctions: replace per contact ---
  const junctionContactIds = [...new Set(junctions.map((j: { contact_id: string }) => j.contact_id))];
  for (const contactId of junctionContactIds) {
    await supabase
      .from('contact_label_junction')
      .delete()
      .eq('contact_id', contactId)
      .throwOnError();
    const contactJunctions = junctions.filter((j: { contact_id: string }) => j.contact_id === contactId);
    if (contactJunctions.length > 0) {
      await supabase
        .from('contact_label_junction')
        .insert(
          contactJunctions.map((j) => ({ contact_id: j.contact_id, label_id: j.label_id })),
        )
        .throwOnError();
    }
  }

  // --- Medical history: upsert keyed by contact_id ---
  for (const h of medicalHistory) {
    await supabase
      .from('patient_medical_history')
      .upsert(
        {
          contact_id: h.contactId,
          user_id: h.user_id ?? null,
          allergies: h.allergies ?? [],
          chronic_conditions: h.chronicConditions ?? [],
          current_medications: h.currentMedications ?? [],
          odontogram_notes: h.odontogramNotes ?? null,
          last_dental_visit: h.lastDentalVisit ?? null,
          blood_type: h.bloodType ?? null,
          updated_at: h.updatedAt ?? now,
        },
        { onConflict: 'contact_id' },
      )
      .throwOnError();
  }

  // --- Deletions ---
  for (const d of deletions.contacts ?? []) {
    try {
      await supabase
        .from('deleted_contacts')
        .insert({
          id: d.id,
          user_id: d.user_id ?? userId,
          full_name: [d.first_name, d.last_name].filter(Boolean).join(' ').trim() || null,
          deleted_at: d.deleted_at ?? null,
          snapshot: d.snapshot ?? null,
        })
        .throwOnError();
    } catch {
      // Archive failure must not block the delete.
    }
    await supabase.from('contacts').delete().eq('id', d.id).throwOnError();
  }
  for (const id of deletions.labels ?? []) {
    await supabase.from('contact_labels').delete().eq('id', id).throwOnError();
  }
  for (const contactId of deletions.medicalHistory ?? []) {
    await supabase.from('patient_medical_history').delete().eq('contact_id', contactId).throwOnError();
  }

  return NextResponse.json({ ok: true });
}
