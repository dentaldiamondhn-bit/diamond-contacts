/**
 * Diamond Link monolith base URL.
 *
 * Links to patient/EHR and menu-navegacion routes resolve on the monolith
 * (app.dentaldiamondhn.com), matching the pattern used in diamond-calendar.
 *
 * NEXT_PUBLIC_MONOLITH_BASE must be set for cross-origin navigation.
 * When unset:
 *  - production builds keep the production URL (existing deployments keep working).
 *  - non-production builds default to '' so links never silently redirect to production.
 */
export const MONOLITH_BASE =
  process.env.NEXT_PUBLIC_MONOLITH_BASE ??
  (process.env.NODE_ENV === 'production' ? 'https://app.dentaldiamondhn.com' : '');

export function monolithMenuUrl(pacienteId: string): string {
  return `${MONOLITH_BASE}/menu-navegacion?id=${encodeURIComponent(pacienteId)}`;
}
