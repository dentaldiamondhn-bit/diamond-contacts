'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { registerSupabaseTokenGetter } from '@/lib/supabase';

/**
 * Hands the Supabase singleton a real Clerk token getter.
 *
 * RLS compares `auth.jwt() ->> 'sub'` against `user_id`, so every PostgREST call
 * AND every Realtime `postgres_changes` subscription must carry the Clerk-signed
 * `supabase` template JWT. Mounted in the root layout so the getter is registered
 * before any page queries Supabase — registering it from the contacts page alone
 * would leave other routes on the anon key.
 */
export default function SupabaseTokenBridge() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      registerSupabaseTokenGetter(null);
      return;
    }
    registerSupabaseTokenGetter(() => getToken({ template: 'supabase' }));
    return () => registerSupabaseTokenGetter(null);
  }, [getToken, isSignedIn]);

  return null;
}