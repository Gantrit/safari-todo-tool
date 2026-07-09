import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Invite / password-reset links are opened in a fresh browser that never
        // started a PKCE handshake, so there is no code_verifier to exchange the
        // ?code= against — the exchange fails and the user sees "Link expired or
        // invalid". The implicit flow delivers the session directly in the URL
        // hash (#access_token=…), which is what /set-password and /callback
        // already wait for. Correct flow for an email-link, invite-only tool.
        flowType: 'implicit',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  )
}
