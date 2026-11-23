import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/contacts/sync/pull - Pull all remote data for the signed-in user.
 *
 * Returns contacts (with phones/emails), labels, label junctions, and medical
 * history. Uses the service role key so RLS never filters results; authz is
 * enforced via Clerk `auth()` before any Supabase call.
 */
export async function GET(req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit') || '2000');

  const supabase = createServerServiceClient();

  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('*, contact_phones(*), contact_emails(*)')
    .eq('user_id', userId)
    .limit(limit);

  if (contactsError) {
    return NextResponse.json({ error: contactsError.message }, { status: 500 });
  }

  const { data: labels, error: labelsError } = await supabase
    .from('contact_labels')
    .select('*')
    .eq('user_id', userId);

  if (labelsError) {
    return NextResponse.json({ error: labelsError.message }, { status: 500 });
  }

  const ownLabelIds = (labels ?? []).map((l: { id: string }) => l.id);
  let junctions: { contact_id: string; label_id: string }[] = [];
  if (ownLabelIds.length > 0) {
    const { data: j, error: jError } = await supabase
      .from('contact_label_junction')
      .select('contact_id, label_id')
      .in('label_id', ownLabelIds);
    if (jError) {
      return NextResponse.json({ error: jError.message }, { status: 500 });
    }
    junctions = (j ?? []) as { contact_id: string; label_id: string }[];
  }

  const contactIds = (contacts ?? []).map((c: { id: string }) => c.id);
  let medicalHistory: Array<{
    contact_id: string;
    allergies?: string[] | null;
    chronic_conditions?: string[] | null;
    current_medications?: string[] | null;
    odontogram_notes?: string | null;
    last_dental_visit?: string | null;
    blood_type?: string | null;
    updated_at?: string | null;
  }> = [];
  const chunkSize = 900;
  for (let i = 0; i < contactIds.length; i += chunkSize) {
    const chunk = contactIds.slice(i, i + chunkSize);
    const { data: h, error: hError } = await supabase
      .from('patient_medical_history')
      .select('contact_id, allergies, chronic_conditions, current_medications, odontogram_notes, last_dental_visit, blood_type, updated_at')
      .in('contact_id', chunk);
    if (hError) {
      return NextResponse.json({ error: hError.message }, { status: 500 });
    }
    medicalHistory = medicalHistory.concat((h ?? []) as typeof medicalHistory);
  }

  return NextResponse.json({
    contacts: contacts ?? [],
    labels: labels ?? [],
    junctions,
    medicalHistory,
  });
}
