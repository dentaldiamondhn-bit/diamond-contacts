/**
 * Thin fetch wrapper over the server sync API routes.
 *
 * Each function mirrors the `{ data, error }` shape that supabase-js returns,
 * so the sync engine can swap `supabase.from(...)` calls for these with
 * minimal logic changes. All routes enforce Clerk auth server-side and use
 * the Supabase service role key, so no client JWT is needed.
 */

async function apiJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: string | null }> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { data: null, error: err?.error || `Request failed (${res.status})` };
  }
  return { data: (await res.json()) as T, error: null };
}

/** Row shapes returned by /api/contacts/sync/pull. */
export interface RemoteContactRow {
  id: string;
  user_id: string;
  patient_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  job_title?: string | null;
  notes?: string | null;
  avatar_url?: string | null;
  address?: string | null;
  dob?: string | null;
  gender?: string | null;
  emergency_contact?: string | null;
  insurance_provider?: string | null;
  policy_number?: string | null;
  blood_type?: string | null;
  is_favorite?: boolean;
  is_archived?: boolean;
  version?: number;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  contact_phones?: Array<{ id: string; type: string; phone_number: string; is_primary?: boolean }> | null;
  contact_emails?: Array<{ id: string; type: string; email: string; is_primary?: boolean }> | null;
}

export interface RemoteLabelRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
}

export interface RemoteHistoryRow {
  contact_id: string;
  allergies?: string[] | null;
  chronic_conditions?: string[] | null;
  current_medications?: string[] | null;
  odontogram_notes?: string | null;
  last_dental_visit?: string | null;
  blood_type?: string | null;
  updated_at?: string | null;
}

export interface RemoteJunctionRow {
  contact_id: string;
  label_id: string;
}

export interface RemotePull {
  contacts: RemoteContactRow[];
  labels: RemoteLabelRow[];
  junctions: RemoteJunctionRow[];
  medicalHistory: RemoteHistoryRow[];
}

export interface RemotePushPayload {
  contacts: Array<Record<string, unknown>>;
  labels: Array<{ id: string; user_id: string; name: string; color: string }>;
  phones: Array<Record<string, unknown>>;
  emails: Array<Record<string, unknown>>;
  junctions: Array<{ contact_id: string; label_id: string }>;
  medicalHistory: Array<Record<string, unknown>>;
  deletions: {
    contacts: Array<Record<string, unknown>>;
    labels: string[];
    medicalHistory: string[];
  };
}

export async function pullRemoteData(
  userId: string,
  limit?: number,
): Promise<{ data: RemotePull | null; error: string | null }> {
  const url = new URL('/api/contacts/sync/pull', window.location.origin);
  url.searchParams.set('user_id', userId);
  if (limit) url.searchParams.set('limit', String(limit));
  return apiJson<RemotePull>(url.toString());
}

export async function pushRemoteData(
  payload: RemotePushPayload,
): Promise<{ data: unknown; error: string | null }> {
  return apiJson('/api/contacts/sync/push', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
