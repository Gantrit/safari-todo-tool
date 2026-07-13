import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

// A TRUE service-role client — no cookies, no session. This MUST NOT read the
// request cookies: @supabase/ssr's createServerClient prefers a logged-in user's
// session JWT from the cookie over the key it was given, so passing cookies here
// made every "admin" query silently run as whoever was logged in. That RLS-blocked
// the public shift-report submit for any logged-in member (only admin/manager pass
// the shift_reports policy), while logged-out chatters worked. Use the plain
// supabase-js client with the service-role key so it always has full access.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
