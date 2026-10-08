export const CLINIC_TIME_ZONE = 'America/Tegucigalpa';

export function clinicDateKey(date: Date = new Date(), offsetDays = 0): string {
  const shifted = new Date(date.getTime() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function dateToDateStr(date: Date): string {
  return clinicDateKey(date);
}

export function dateToTimeStr(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** `HH:MM` for a given instant, in clinic-local time (wall clock). */
export function clinicClockTime(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value || '';
  const hour = value('hour') === '24' ? '00' : value('hour');
  return `${hour.padStart(2, '0')}:${value('minute').padStart(2, '0')}`;
}

/** Coerce a stored clock value to `HH:MM` (strips stray `:ss` suffixes, blanks). */
export function normalizeTime(time?: string | null): string {
  const [h, mi] = (time ?? '').split(':');
  const hh = String(Number(h));
  const mm = (mi || '').slice(0, 2) || '00';
  const valid = /^\d{2}$/.test(hh) && Number(hh) <= 23 && /^\d{2}$/.test(mm) && Number(mm) <= 59;
  return valid ? `${hh}:${mm}` : '';
}

/**
 * The true UTC instant whose *clinic-local* clock shows `date` + `time` (wall
 * clock). `America/Tegucigalpa` has no DST, so the offset is a constant
 * UTC−06:00 — this anchors `event_reminders.reminder_time`.
 */
export function clinicWallClockTimestamp(date: string, time?: string): Date {
  const [y = '0', mo = '0', d = '0'] = (date || '').split('-');
  const [h = '0', mi = '0'] = (time || '09:00').split(':');
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  const clinicOffsetMs = 6 * 3600 * 1000; // UTC−06:00 = wall + 6h in UTC
  return new Date(wall + clinicOffsetMs);
}

/** `17:45` → `5:45 p. m.` — the es-HN 12-hour display (only `hh:mm`, no seconds). */
export function formatClock12(time?: string | null): string {
  const t = normalizeTime(time);
  if (!t) return '';
  const h24 = Number(t.slice(0, 2));
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 >= 12 ? 'p. m.' : 'a. m.';
  return `${h}:${t.slice(3, 5)} ${suffix}`;
}

/** `17:45` + 60 → `18:45` (`HH:MM`). Wraps past midnight within the same key. */
export function addHourToTime(time?: string | null, hours = 1): string {
  const t = normalizeTime(time) || '09:00';
  const h24 = (Number(t.slice(0, 2)) + hours) % 24;
  return `${String(h24).padStart(2, '0')}:${t.slice(3, 5)}`;
}

/** `17:45` + 45 → `18:30` (`HH:MM`). Minute-granularity offset for quick-duration chips. */
export function addMinutesToTime(time?: string | null, minutes = 0): string {
  const t = normalizeTime(time) || '09:00';
  const total = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + minutes;
  const clamped = ((total % 1440) + 1440) % 1440; // wrap past midnight, guard negatives
  const h24 = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(h24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
