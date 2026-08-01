/**
 * Shared HTTP plumbing for the Edge Functions.
 *
 * Both functions are called from a browser, so both need CORS; both are called
 * by a signed-in user, so both need to resolve that user from the request's own
 * Authorization header rather than trusting a profile id in the body.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Patterns that must never reach a log line.
 *
 * The RPC URL is the one that actually bites. `HELIUS_RPC_URL` carries its API
 * key in the query string, and when `fetch` fails at the network layer Deno
 * builds the message out of the URL it was given - so
 * `console.error('rpc failed', error)` writes the key verbatim into the
 * function logs, where it outlives the request and is readable by anyone with
 * dashboard access. Nothing in the code passes the key to a logger; the runtime
 * does it on our behalf, which is why redaction has to happen at the log call
 * rather than at the call sites we control.
 */
const REDACTIONS: readonly RegExp[] = [
  // ?api-key=..., &access-token=..., ?apikey=...
  //
  // The value stops at the first delimiter rather than the first space: Deno
  // wraps the URL in `(...)` in its fetch errors, so `[^&\s]+` would swallow
  // the closing paren and the `: connection refused` that follows it, hiding
  // the part of the message that says what actually went wrong.
  /([?&](?:api[-_]?key|access[-_]?token|token|secret)=)[^&\s'")\],;]+/gi,
  // Bare JWTs (Supabase keys, user access tokens). The empty group keeps the
  // replacer's argument shape identical to the pattern above - see below.
  /\b()eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g,
];

/**
 * An error rendered safe to log.
 *
 * Keeps the message and the stack - the parts that say what broke - and blanks
 * only the credential-shaped substrings inside them.
 */
export function redact(value: unknown): string {
  const text =
    value instanceof Error
      ? `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`
      : typeof value === 'string'
        ? value
        : (() => {
            try {
              return JSON.stringify(value) ?? String(value);
            } catch {
              return String(value);
            }
          })();

  // Every pattern captures exactly one group - the bit to keep, which may be
  // empty. Without a group `replace` passes the match *offset* as the second
  // argument, and a truthy number would be spliced into the output as though
  // it were the kept prefix.
  return REDACTIONS.reduce(
    (acc, pattern) =>
      acc.replace(pattern, (_match, keep: string) => `${keep}[REDACTED]`),
    text,
  );
}

/** `console.error`, with credentials stripped out of the payload. */
export function logError(tag: string, error: unknown): void {
  console.error(tag, redact(error));
}

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
 * A client that acts **as the caller**, not as the service role.
 *
 * The anon key plus the caller's own `Authorization` header, which is the
 * combination PostgREST reads to resolve `auth.uid()` and apply RLS exactly as
 * it would for a request straight from the app.
 *
 * This exists for functions that need to run something scoped to the signed-in
 * user - `delete_my_account()` being the obvious one, since a service-role
 * client has no `auth.uid()` at all and the function would refuse it.
 *
 * Reaching for `serviceClient()` instead, and passing the user id along, is the
 * tempting shortcut and the wrong one: it turns an operation the caller is
 * entitled to perform on themselves into one the function performs on whoever
 * it is told to, with the authorisation check now living in our code rather
 * than in the database.
 */
export function userClient(request: Request): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY must be set on the function.',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: request.headers.get('Authorization') ?? '' },
    },
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
