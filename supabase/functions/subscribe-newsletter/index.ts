/**
 * subscribe-newsletter - the footer form, behind an IP rate limit.
 *
 *   POST /functions/v1/subscribe-newsletter
 *   { "email": "...", "source": "website" }
 *
 * No Authorization header: the form lives in the marketing footer, where
 * nobody is signed in. That is the whole problem this function exists to
 * solve.
 *
 * # Why this is not just an RPC call any more
 *
 * `subscribe_newsletter` (migration 0012) is callable by `anon` and is written
 * to be safe as an unauthenticated write - fixed column list, shape validation,
 * same answer whether or not the address was already there, so it cannot be
 * used to test who is subscribed. Migration 0018 then added a limit of three
 * attempts per hour **per address**.
 *
 * Per address is the wrong subject, and `docs/SECURITY.md` has said so under
 * *Known gaps* since it landed: it stops one address retried in a loop and does
 * nothing at all against a flood that varies the address each time, which is
 * the shape every real signup-spam wave takes. The subject that matters is the
 * caller's **IP**, and Postgres cannot see it - PostgREST terminates the
 * connection, so the database only ever sees its own client.
 *
 * An Edge Function can see it. `x-forwarded-for` arrives here, `rateLimit`
 * already knows how to key on it, and the per-address limit in the database
 * stays exactly where it is - the two catch different attacks and neither
 * replaces the other.
 *
 * # Why the address is still not trusted
 *
 * Validation is duplicated rather than delegated. The database function keeps
 * its own checks because it remains directly callable by `anon`, and removing
 * them would move a security property into a caller. What is added here is the
 * cheap rejection: a malformed address should not cost a database round trip,
 * and it should not consume the quota that protects one.
 */

import { json, logError, preflight, rateLimit, serviceClient } from '../_shared/http.ts';

/**
 * Deliberately loose.
 *
 * Email syntax is famously not a regex, and a strict pattern here would reject
 * real addresses - the failure nobody reports, because a person who cannot sign
 * up simply leaves. This rejects what is obviously not an address and lets the
 * database function and, eventually, a confirmation round-trip settle the rest.
 */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Matches the column's own bound; longer is a paste, not an address. */
const MAX_EMAIL_LENGTH = 254;

/** Where the signup came from. An allowlist, so the column cannot be scribbled in. */
const SOURCES = new Set(['website', 'app', 'event-page']);

Deno.serve(async (request: Request) => {
  const options = preflight(request);
  if (options) return options;

  if (request.method !== 'POST') {
    return json(request, { error: 'Use POST.' }, 405);
  }

  /*
   * `null` subject, so `rateLimit` falls back to x-forwarded-for. This is the
   * one endpoint in the codebase where that fallback is the point rather than a
   * degraded case - there is no profile id to key on, and there never will be.
   *
   * Five an hour. A person subscribes once; a person who mistypes and retries
   * does it two or three times. Anything past five from one address in an hour
   * is not someone signing up for a newsletter.
   */
  const limited = await rateLimit(request, 'subscribe-newsletter', null, 5, 3600);
  if (limited) return limited;

  let body: { email?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: 'Send a JSON body.' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const source = typeof body.source === 'string' ? body.source : 'website';

  if (!email || email.length > MAX_EMAIL_LENGTH || !LOOKS_LIKE_EMAIL.test(email)) {
    return json(request, { error: 'That does not look like an email address.' }, 400);
  }

  if (!SOURCES.has(source)) {
    return json(request, { error: 'Unknown source.' }, 400);
  }

  const { error } = await serviceClient().rpc('subscribe_newsletter', {
    p_email: email,
    p_source: source,
  });

  if (error) {
    /*
     * The per-address limit from 0018 surfaces here. It is a real refusal, not
     * a fault, so it gets a 429 like the IP limit above rather than a 500 - and
     * the same wording, because from the outside they are the same event.
     */
    if (/rate|too many/i.test(error.message)) {
      return json(
        request,
        { error: 'Too many requests. Wait a moment and try again.' },
        429,
      );
    }

    logError('[subscribe-newsletter] rpc failed', error);
    return json(request, { error: 'Could not subscribe you. Try again.' }, 500);
  }

  /*
   * Same answer whether the address was new or already present - the property
   * migration 0012 was written to have, preserved here. Reporting "already
   * subscribed" would turn this into an oracle for who is on the list.
   */
  return json(request, { subscribed: true });
});
