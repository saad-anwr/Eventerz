/**
 * Supabase configuration and the "is this wired up yet?" guard.
 *
 * Eventerz ships with a working demo that needs no backend. Real auth turns on
 * only when both env vars are present, so a fresh clone still runs — it just
 * falls back to the simulated session. Every auth entry point checks
 * `isSupabaseConfigured` before assuming a client exists.
 */

export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const;

/** True once a Supabase project is configured. */
export const isSupabaseConfigured =
  supabaseConfig.url.length > 0 && supabaseConfig.anonKey.length > 0;

/**
 * Where Google returns the user after consent. Must exactly match an entry in
 * Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export function authCallbackUrl(origin: string, next = '/'): string {
  const url = new URL('/auth/callback', origin);
  if (next && next !== '/') url.searchParams.set('next', next);
  return url.toString();
}
