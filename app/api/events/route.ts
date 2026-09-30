import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';
import { CLINIC_TIME_ZONE } from '@/calendario/rbcAdapter';
import { findDentistConflicts, dentistConflictMessage } from '@/lib/dentistAvailability';

export const runtime = 'nodejs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Strip stray `:ss` (browser time inputs / legacy rows) → `HH:MM`, else blank. */
function normalizeStoredTime(t?: string | null): string {
  const [h = '', m = ''] = (t ?? '').split(':');
  const hh = h.trim().padStart(2, '0');
  const mm = m.slice(0, 2) || '00';
  const valid = /^\d{2}$/.test(hh) && Number(hh) <= 23 && /^\d{2}$/.test(mm) && Number(mm) <= 59;
  return valid ? `${hh}:${mm}` : '';
}

export async function GET(req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  if (dateFrom && !DATE_RE.test(dateFrom)) {
    return NextResponse.json({ error: 'date_from must be YYYY-MM-DD' }, { status: 400 });
  }
  if (dateTo && !DATE_RE.test(dateTo)) {
    return NextResponse.json({ error: 'date_to must be YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const supabase = createServerServiceClient();
    let query = supabase.from('events').select('*').eq('user_id', userId);

    if (dateFrom) query = query.gte('date', dateFrom);
    if (dateTo) query = query.lte('date', dateTo);

    const { data, error: dbError } = await query
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (dbError) throw dbError;
    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const body = await req.json();
    const {
      title,
      patient_name,
      color,
      notes,
      description,
      location,
      event_type,
      status,
      priority,
      reminder_minutes,
      patient_id,
      procedure,
      dentist,
      phone,
      phone_country,
    } = body;

    const supabase = createServerServiceClient();

    // Server-side dentist availability — refuse with 409 + DENTIST_CONFLICT
    // unless `force_conflict` overrides it.
    const forceConflicts = !!body.force_conflict;
    const effectiveDate = body.date || (() => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: CLINIC_TIME_ZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date());
      const v = (t: string) => parts.find(p => p.type === t)?.value || '';
      return `${v('year')}-${v('month')}-${v('day')}`;
    })();
    const effectiveStart = normalizeStoredTime(body.start_time) || '09:00';
    const effectiveEnd = normalizeStoredTime(body.end_time) || '09:30';
    const dentistName = (body.dentist || '').trim();
    if (dentistName && !forceConflicts) {
      const conflicts = await findDentistConflicts(
        supabase, dentistName, effectiveDate, effectiveStart, effectiveEnd
      );
      if (conflicts.length > 0) {
        return NextResponse.json(
          {
            error: dentistConflictMessage(dentistName),
            code: 'DENTIST_CONFLICT',
            conflicts,
          },
          { status: 409 }
        );
      }
    }

    const baseInsert: Record<string, unknown> = {
      user_id: userId,
      title: title || `Cita - ${patient_name}`,
      patient_name: patient_name || '',
      date: effectiveDate,
      start_time: effectiveStart,
      end_time: effectiveEnd,
      color: color || '#0d9488',
      notes: notes || '',
    };

    baseInsert.description = description || '';
    baseInsert.location = location || '';
    baseInsert.event_type = event_type || 'appointment';
    baseInsert.status = status || 'scheduled';
    baseInsert.priority = priority || 'medium';
    baseInsert.reminder_minutes = reminder_minutes ?? 30;
    baseInsert.patient_id = patient_id || null;
    baseInsert.procedure = procedure || '';
    baseInsert.dentist = dentist || '';
    baseInsert.phone = phone || '';
    baseInsert.phone_country = phone_country || '504';

    const { data, error: dbError } = await supabase
      .from('events')
      .insert(baseInsert)
      .select()
      .single();

    if (dbError) {
      return NextResponse.json(
        {
          error: dbError.message,
          code: dbError.code,
          details: dbError.details,
          hint: dbError.hint,
        },
        { status: 400 }
      );
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const body = await req.json();
    const { id } = body;

    const supabase = createServerServiceClient();
    const { data, error: dbError } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');

    if (dbError) throw dbError;
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Evento no encontrado o no tienes permiso para eliminarlo' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}