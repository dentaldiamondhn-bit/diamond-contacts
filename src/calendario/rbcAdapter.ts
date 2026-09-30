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