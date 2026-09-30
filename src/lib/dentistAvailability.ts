import type { SupabaseClient } from '@supabase/supabase-js';

/** One conflicting dentist booking (server-side availability payload). */
export interface DentistConflict {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  patient_name: string | null;
  title: string | null;
  dentist: string | null;
}

/**
 * Server-side dentist availability (clinic-wide, service role). Any non-finished
 * event whose dentist matches `dentist` and whose window overlaps
 * [start_time, end_time) on `date` conflicts — including events the caller
 * cannot see (the dentist's own private bookings). Cancelled/completed slots are
 * free. `excludeId` skips the event being saved/moved (its own slot).
 */
export async function findDentistConflicts(
  supabase: SupabaseClient,
  dentist: string,
  date: string,
  start_time: string,
  end_time: string,
  excludeId?: number
): Promise<DentistConflict[]> {
  const name = (dentist || '').trim();
  if (!name) return [];

  let query = supabase
    .from('events')
    .select('id, date, start_time, end_time, patient_name, title, dentist')
    .ilike('dentist', name)
    .eq('date', date)
    .lt('start_time', end_time)
    .gt('end_time', start_time)
    .not('status', 'in', '(cancelled,completed)');
  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query.limit(10);
  if (error) throw error;
  return (data ?? []) as DentistConflict[];
}

/** Shared es-HN warning used by the 409 handler. */
export function dentistConflictMessage(dentist: string): string {
  return `El odontólogo ${dentist} ya tiene una cita en ese horario.`;
}