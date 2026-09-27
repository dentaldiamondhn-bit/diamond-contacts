import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Env is read INSIDE the factory, never at module scope: `next build` evaluates
 * route modules while collecting page data, and a module-scope `createClient()`
 * throws "supabaseUrl is required." there, failing the whole build.
 */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to the deployment environment (Vercel project settings) and redeploy.`
    )
  }
  return value
}

export const createClient = () => {
  return createSupabaseClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          'X-Client-Info': 'calendar-app-server'
        }
      },
      db: {
        schema: 'public'
      }
    }
  )
}

/**
 * Service-role client for calendar API routes.
 *
 * Identity/authz is enforced in code via Clerk `auth()` (see
 * `src/lib/calendarAuth.ts`); the service role bypasses RLS, and RLS on the
 * live tables then only ever sees non-service-role clients — any direct
 * anon/authenticated access via the public anon key is blocked by the
 * ownership predicates (Migration 20260908_calendario_phase0_security.sql).
 */
export const createServerServiceClient = () => {
  return createSupabaseClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          'X-Client-Info': 'calendar-app-server-service'
        }
      },
      db: {
        schema: 'public'
      }
    }
  )
}
