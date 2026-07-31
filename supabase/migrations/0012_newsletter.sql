-- ---------------------------------------------------------------------------
-- Newsletter subscriptions
--
-- The footer form used to set a "Joined" state and throw the address away. That
-- is worse than having no form: it tells someone they will hear from you and
-- guarantees they will not, and it collects a personal detail with no basis for
-- doing so. This gives the form somewhere real to write.
-- ---------------------------------------------------------------------------

create table if not exists public.newsletter_subscribers (
  id          uuid primary key default gen_random_uuid(),
  -- Stored lower-cased and trimmed by the function, so the unique index below
  -- is a real "one row per person" and not "one row per capitalisation".
  email       text        not null,
  -- Where it came from, so a future unsubscribe page can explain the origin and
  -- so a spam wave is attributable to a surface rather than to the whole site.
  source      text        not null default 'website',
  created_at  timestamptz not null default now(),
  -- Set when the address is confirmed by a round-trip email. Nothing does that
  -- yet; the column exists so double opt-in does not need a table rewrite, and
  -- so an export can tell confirmed from merely typed.
  confirmed_at timestamptz
);

create unique index if not exists newsletter_subscribers_email_key
  on public.newsletter_subscribers (email);

alter table public.newsletter_subscribers enable row level security;

-- No policies, deliberately. With RLS on and none present, every direct client
-- read and write is refused. A subscriber list is exactly the kind of table
-- that must not be enumerable: it is a list of email addresses belonging to
-- people who did not agree to be published.

/**
 * Subscribe an address.
 *
 * Callable by `anon` - the footer form is on the marketing site, where nobody is
 * signed in. That makes it an unauthenticated write endpoint, so it is written
 * to be safe as one:
 *
 *   - it returns the same thing whether or not the address was already present,
 *     so it cannot be used to test whether someone is subscribed;
 *   - it writes a fixed column list, so a caller cannot set `confirmed_at`;
 *   - it validates shape and length, so the table cannot be filled with
 *     arbitrary text.
 *
 * What it does NOT have is rate limiting - Postgres is the wrong layer for it.
 * See docs/SECURITY.md.
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

  -- Deliberately loose. Strict RFC 5322 in a regex rejects addresses that are
  -- valid, and the only real test of an address is sending to it. This rules
  -- out the shapes that are certainly not addresses.
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That does not look like an email address.'
      using errcode = '22023';
  end if;

  if length(v_email) > 254 then
    raise exception 'That email address is too long.' using errcode = '22023';
  end if;

  insert into public.newsletter_subscribers (email, source)
  values (v_email, coalesce(nullif(trim(p_source), ''), 'website'))
  on conflict (email) do nothing;
end;
$$;

comment on function public.subscribe_newsletter(text, text) is
  'Add an address to the newsletter list. Idempotent, and silent about whether '
  'the address was already present.';

grant execute on function public.subscribe_newsletter(text, text)
  to anon, authenticated;
