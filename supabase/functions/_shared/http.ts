/**
 * Shared HTTP plumbing for the Edge Functions.
 *
 * Both functions are called from a browser, so both need CORS; both are called
 * by a signed-in user, so both need to resolve that user from the request's own
 * Authorization header rather than trusting a profile id in the body.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Allowed origins.
 *
 * `ALLOWED_ORIGINS` is a comma-separated list set with
 * `supabase secrets set ALLOWED_ORIGINS=...`. It falls back to the production
 * hosts. Echoing back whatever `Origin` the caller sent - the usual shortcut -
 * would make the allowlist decorative.
 *
 * Native clients send no `Origin` at all and are unaffected either way: CORS is
 * a browser rule, not a server-side authorisation check. The real gate on both
 * platforms is the JWT below.
 */
const DEFAULT_ORIGINS = [
  'https://www.eventerz.xyz',
  'https://eventerz.xyz',
  'http://localhost:3000',
];

function allowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS');
  if (!configured) return DEFAULT_ORIGINS;
  return configured
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = allowedOrigins();
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

export function preflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  return new Response('ok', { headers: corsHeaders(request) });
}

/**
 * The service-role client.
 *
 * This key bypasses RLS entirely. It is only ever used to call the two
 * functions that are explicitly revoked from `authenticated` - the ones whose
 * whole purpose is to do something the caller must not be able to do for
 * themselves.
 */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the function.',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolve the caller from their own JWT.
 *
 * The user id comes from the token, never from the request body. A body field
 * is a claim the caller writes; the token is a claim Supabase signed. Reading
 * the profile id from the body is how "verify the wallet" quietly becomes
 * "verify a wallet, then attach it to whoever you like".
 */
export async function requireUser(
  request: Request,
): Promise<{ id: string } | null> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}
