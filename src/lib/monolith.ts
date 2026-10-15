/**
 * Diamond Link monolith base URL.
 *
 * Links to patient/EHR and menu-navegacion routes resolve on the monolith
 * (app.dentaldiamondhn.com), matching the pattern used in diamond-calendar.
 * Override with NEXT_PUBLIC_MONOLITH_BASE if the monolith moves.
 */
export const MONOLITH_BASE =
  process.env.NEXT_PUBLIC_MONOLITH_BASE ?? 'https://app.dentaldiamondhn.com';

export function monolithMenuUrl(pacienteId: string): string {
  return `${MONOLITH_BASE}/menu-navegacion?id=${encodeURIComponent(pacienteId)}`;
}
