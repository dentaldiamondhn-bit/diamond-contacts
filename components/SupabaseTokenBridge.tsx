'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { registerSupabaseTokenGetter } from '@/lib/supabase';

/**
 * Hands the Supabase singleton a real Clerk token getter.
 *
 * Supabase third-party auth trusts Clerk-signed session tokens: it verifies them
 * against Clerk's JWKS (the issuer you register in the dashboard) and reads the
 * `sub` claim for the `auth.jwt() ->> 'sub'` RLS policies. That flow uses the
 * DEFAULT session token, not a custom JWT template — the `supabase` template is
 * the deprecated shared-secret path and its tokens are rejected (PGRST301:
 * "No suitable key"). So request the session token with no template argument.
 *
 * Mounted in the root layout so the getter is registered before any page queries
 * Supabase — registering it from the contacts page alone would leave other
 * routes on the anon key, which RLS now filters to zero rows.
 *
 * Preconditions handled outside this file: Supabase must be configured to trust
 * Clerk (Authentication -> Sign In / Providers -> Add provider -> Clerk), and the
 * Clerk instance must add the `role: authenticated` claim to session tokens.
 */
export default function SupabaseTokenBridge() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      registerSupabaseTokenGetter(null);
      return;
    }
    registerSupabaseTokenGetter(() => getToken());
    return () => registerSupabaseTokenGetter(null);
  }, [getToken, isSignedIn]);

  return null;
}