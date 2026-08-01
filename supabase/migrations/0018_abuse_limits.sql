-- ---------------------------------------------------------------------------
-- Eventerz - 0018: abuse limits on the two open write paths
--
-- Run after 0017. Safe to re-run.
--
-- 0016 put rate limits on the Edge Functions. Two write paths do not go through
-- one, and both are reachable in a loop:
--
--   1. `messages` INSERT - direct, RLS-gated, authenticated. Nothing bounds how
--      fast. A DM channel is open between any two profiles by design (0009), so
--      any account can flood any other account's inbox as fast as it can POST.
--   2. `subscribe_newsletter()` - callable by `anon`, by design, because the
--      footer form is on the marketing site where nobody is signed in.
-- ---------------------------------------------------------------------------

/* ===========================================================================
   1. Message flood control
   =========================================================================== */

/*
 * A trigger rather than moving sends through a function.
 *
 * Both apps insert into `messages` directly and the RLS policy is already the
 * right shape - it pins `sender_id` to `auth.uid()` and requires channel
 * access. Replacing that with an RPC would be a larger change to both clients
 * for no security gain; the only missing piece is a ceiling, and a BEFORE
 * INSERT trigger is where a ceiling belongs.
 *
 * 30 a minute is deliberately well above conversational pace - it is a flood
 * ceiling, not a typing limit. Someone in a fast back-and-forth will never see
 * it; a script will hit it immediately.
 */
create or replace function public.messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_rate_limit('messages', new.sender_id::text, 30, interval '1 minute') then
    raise exception 'You are sending messages too quickly. Wait a moment.'
      using errcode = '53400';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.messages_rate_limit();

/* ===========================================================================
   2. Newsletter
   =========================================================================== */

/*
 * This one cannot be fully solved here, and it is worth being precise about why
 * rather than adding a limit that reads like protection.
 *
 * The subject that matters for an anonymous form is the caller's IP, and
 * Postgres cannot see it - PostgREST terminates the connection and the database
 * sees only its own client. 0012 says as much: "Postgres is the wrong layer for
 * it." That is still true.
 *
 * What Postgres *can* see is the address being submitted, so that is what this
 * limits: the same address cannot be resubmitted more than 3 times an hour.
 * That closes the trivial case - a form retried in a loop with one address -
 * and it does nothing against a flood that varies the address each time.
 *
 * The remaining half needs an IP-keyed limit in front of the database. The
 * cheapest correct fix is to move the footer form behind an Edge Function and
 * call `rateLimit()` (0016) with the `x-forwarded-for` address, exactly as the
 * other functions do. Recorded in docs/SECURITY.md as the open item rather than
 * left implied by a half-measure here.
 */
create or replace function public.subscribe_newsletter(
  p_email  text,
  p_source text default 'website'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email = '' then
    raise exception 'An email address is required.' using errcode = '22023';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That does not look like an email address.'
      using errcode = '22023';
  end if;

  if length(v_email) > 254 then
    raise exception 'That email address is too long.' using errcode = '22023';
  end if;

  /*
   * After validation, so a malformed address cannot burn quota, and before the
   * insert. The limit is keyed on the address, which is the only subject
   * available here - see the note above.
   */
  if not public.check_rate_limit('newsletter', v_email, 3, interval '1 hour') then
    raise exception 'Too many attempts for that address. Try again later.'
      using errcode = '53400';
  end if;

  insert into public.newsletter_subscribers (email, source)
  values (v_email, coalesce(nullif(trim(p_source), ''), 'website'))
  on conflict (email) do nothing;
end;
$$;

/*
 * Re-granted because `create or replace` on a function keeps its grants, but
 * being explicit means this migration is complete on its own if the function is
 * ever recreated from scratch.
 */
revoke all on function public.subscribe_newsletter(text, text) from public;
grant execute on function public.subscribe_newsletter(text, text)
  to anon, authenticated;

/*
 * `check_rate_limit` is granted to `authenticated` and `service_role` (0016),
 * not `anon`. It does not need to be: `subscribe_newsletter` and
 * `messages_rate_limit` are both SECURITY DEFINER, so they call it as their
 * owner. Granting it to `anon` directly would let an anonymous caller burn
 * anybody's quota by naming them as the subject.
 */
