/**
 * Supabase configuration and the "is this wired up yet?" guard.
 *
 * Eventerz ships with a working demo that needs no backend. Real auth turns on
 * only when both env vars are present, so a fresh clone still runs - it just
 * falls back to the simulated session. Every auth entry point checks
 * `isSupabaseConfigured` before assuming a client exists.
 */

export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const;

/**
 * Cookie flags for the auth session, applied on both the server and browser
 * clients so a token cannot be written one way in middleware and another way
 * after a client-side refresh.
 *
 * `@supabase/ssr` defaults to `{ path: '/', sameSite: 'lax', httpOnly: false }`
 * and sets no `secure` flag at all, so the session cookie is offered over plain
 * HTTP. In practice Vercel redirects to HTTPS, but the cookie is sent on the
 * request that gets redirected - which is the one moment it is in the clear.
 *
 * `httpOnly` is deliberately absent rather than forgotten. The browser client
 * reads this cookie from JavaScript to restore a session, so `httpOnly: true`
 * does not harden it - it breaks sign-in. That is inherent to `@supabase/ssr`,
 * and it is why nothing else PII-shaped goes in `localStorage` either (see
 * `lib/store/use-app-store.ts`): with a JS-readable session cookie, XSS is
 * already game over, so the mitigation is not adding to what it can steal.
 *
 * `sameSite: 'lax'` is kept, not tightened. `'strict'` would drop the cookie on
 * the cross-site return leg of Google OAuth, so sign-in would land on a page
 * that believes nobody is signed in.
 */
export const authCookieOptions = {
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

/** True once a Supabase project is configured. */
export const isSupabaseConfigured =
  supabaseConfig.url.length > 0 && supabaseConfig.anonKey.length > 0;

/**
 * Where Google returns the user after consent. Must exactly match an entry in
 * Supabase -> Authentication -> URL Configuration -> Redirect URLs.
 */
export function authCallbackUrl(origin: string, next = '/'): string {
  const url = new URL('/auth/callback', origin);
  if (next && next !== '/') url.searchParams.set('next', next);
  return url.toString();
}
