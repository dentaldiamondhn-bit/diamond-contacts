import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to the deployment environment (Vercel project settings) and redeploy.`
    )
  }
  return value
}

/**
 * ONE GoTrueClient per browser context.
 *
 * Next.js bundles `src/lib/supabase.ts` into every route chunk that imports it,
 * and each module copy would otherwise create its own Supabase/goTrue client
 * under the same `sb-<url>-auth-token` storage key — Supabase warns loudly about
 * this ("Multiple GoTrueClient instances detected"). Caching on `globalThis`
 * makes every copy of the module agree on a single shared instance, so exactly
 * one client exists per page, and realtime channels run through it too
 * (`realtimeSupabase === supabase`).
 */
const shared = globalThis as {
  __diamondSupabaseClient?: SupabaseClient
}

function getSupabaseClient(): SupabaseClient {
  if (!shared.__diamondSupabaseClient) {
    shared.__diamondSupabaseClient = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      {
        auth: {
          persistSession: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
        global: {
          headers: {
            'X-Client-Info': 'calendar-app'
          }
        },
        db: {
          schema: 'public'
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      }
    )
  }
  return shared.__diamondSupabaseClient
}

let lazyClient: SupabaseClient | undefined

/**
 * `supabase` is a stable handle that builds the real client on FIRST USE.
 *
 * This module is pulled into the client page bundle, so it is also evaluated
 * while `next build` collects page data and prerenders `/` — a module-scope
 * `createClient()` (or an eager `getSupabaseClient()`) threw "supabaseUrl is
 * required." there whenever the env vars were not present at build time, failing
 * the whole build. Deferring creation keeps the singleton and browser-only cost,
 * and the missing-var error now surfaces with an actionable message.
 */
function getLazySupabaseClient(): SupabaseClient {
  if (!lazyClient) {
    lazyClient = new Proxy({} as SupabaseClient, {
      get(_target, prop) {
        const client = getSupabaseClient() as unknown as Record<PropertyKey, unknown>
        const value = client[prop]
        return typeof value === 'function' ? value.bind(client) : value
      },
    })
  }
  return lazyClient
}

export const supabase = getLazySupabaseClient()
// Realtime channels use the SAME client/goTrue instance — no second GoTrueClient.
export const realtimeSupabase = supabase

export { createClient, getSupabaseClient }

export function createServiceClient(): SupabaseClient {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        persistSession: false,
        detectSessionInUrl: false,
      },
      db: {
        schema: 'public'
      }
    }
  )
}
