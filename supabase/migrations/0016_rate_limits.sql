-- ---------------------------------------------------------------------------
-- Eventerz - 0016: rate limiting for the Edge Functions
--
-- Run after 0015. Safe to re-run.
--
-- docs/SECURITY.md has listed "no rate limiting" as a known gap since 0012.
-- This closes the half of it that is ours to close.
--
-- # What this does and does not cover
--
-- Sign-in is **not** here, and cannot be: Google OAuth and the email one-time
-- link are served by `<ref>.supabase.co/auth/v1/*`, which is Supabase's
-- endpoint, not ours. Nothing in this repository sits in front of it. Those
-- limits are set in the dashboard (Authentication -> Rate Limits) and are
-- listed in docs/SECURITY.md so they are configured rather than assumed.
--
-- What is ours is the Edge Functions - wallet linking, payment verification,
-- account deletion, cNFT minting - and those had nothing at all. Each is a
-- POST that does real work: verifying an Ed25519 signature, calling an RPC
-- provider we pay per request, or deleting an account.
--
-- # Why Postgres and not an in-memory counter
--
-- Edge Functions are horizontally scaled and cold-start constantly, so a module
-- -level `Map` is per-instance and effectively resets whenever the platform
-- feels like it - a limiter that mostly does not limit. A table is shared by
-- every instance, and this is a database that is already on the request path.
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limits (
  /*
   * Who is being limited, and for what. Composite so one subject can hit
   * several endpoints independently - being throttled on `link-wallet` should
   * not lock someone out of `verify-payment`.
   *
   * `subject` is a profile id where the caller is authenticated, and an IP
   * otherwise. Deliberately `text` rather than `uuid` or `inet`: it holds both,
   * and the column is an opaque bucket key, never something to join on.
   */
  bucket      text        not null,
  subject     text        not null,

  window_start timestamptz not null default now(),
  hits         int         not null default 0,

  primary key (bucket, subject)
);

alter table public.rate_limits enable row level security;

-- No policies, deliberately - as with `newsletter_subscribers` (0012). RLS on
-- with none present refuses every direct client read and write. The counters
-- are reachable only through the function below, which is the whole point: a
-- client that could read this table could see how close it is to a limit, and
-- one that could write it could reset its own.

comment on table public.rate_limits is
  'Fixed-window counters for the Edge Functions. Not client-accessible; see '
  'public.check_rate_limit(). Rows are self-expiring - a stale window is reset '
  'on next use rather than deleted on a schedule.';

/**
 * Consume one unit of quota. Returns true when the caller may proceed.
 *
 * Fixed window rather than sliding: a sliding window needs the timestamps kept,
 * which for this purpose means storing a row per request against an identifier
 * that is often an IP address. A counter that resets is less precise and holds
 * markedly less about people, which is the right trade for abuse prevention on
 * endpoints that are already authenticated.
 *
 * The cost of a fixed window is a burst at the boundary - up to 2x the limit
 * across two adjacent windows. For "stop someone hammering this endpoint" that
 * is immaterial.
 *
 * SECURITY DEFINER because the table denies everything to `authenticated`; the
 * grant is on this function alone, so the only thing a caller can do is spend
 * their own quota.
 */
create or replace function public.check_rate_limit(
  p_bucket   text,
  p_subject  text,
  p_limit    int,
  p_window   interval default interval '1 minute'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_hits int;
begin
  if p_subject is null or trim(p_subject) = '' then
    -- No identifiable subject means no basis to limit. Fail closed: an
    -- unidentifiable caller is exactly the one worth refusing.
    return false;
  end if;

  /*
   * One statement, so concurrent calls cannot interleave a read and a write and
   * both conclude they were under the limit. The conflict path resets the
   * window when it has expired and otherwise increments, and `returning` hands
   * back the post-increment value - so the decision below is made on the row
   * this call actually wrote.
   */
  insert into public.rate_limits as rl (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, now(), 1)
  on conflict (bucket, subject) do update
    set hits = case
                 when rl.window_start < now() - p_window then 1
                 else rl.hits + 1
               end,
        window_start = case
                         when rl.window_start < now() - p_window then now()
                         else rl.window_start
                       end
  returning hits into current_hits;

  return current_hits <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, text, int, interval)
  from public, anon;
grant execute on function public.check_rate_limit(text, text, int, interval)
  to authenticated, service_role;

comment on function public.check_rate_limit is
  'Consume one unit of quota for (bucket, subject). True when the caller may '
  'proceed. Fixed window; a subject that is null or blank is refused.';
