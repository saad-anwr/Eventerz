/**
 * `profile_for_wallet` returned a row of NULLs for a wallet nobody has linked.
 *
 * # The bug
 *
 * 0022 declared it as:
 *
 *     create or replace function public.profile_for_wallet(p_wallet_address text)
 *     returns public.profiles          -- a composite type, not a set
 *
 * A PL/pgSQL or SQL function whose return type is a bare composite **always
 * returns exactly one row**. When the inner select matches nothing, the row is
 * not absent - every column comes back NULL. `limit 1` does not change that;
 * there was never a second row to limit.
 *
 * So the two cases the caller has to tell apart - "this wallet belongs to an
 * account" and "this wallet belongs to nobody" - arrive as a populated row and
 * a row of NULLs, and PostgREST reports both as a JSON object. `maybeSingle()`
 * hands back an object either way, `if (data)` is true either way, and the
 * client maps a profile that does not exist:
 *
 *     handle: row.handle ?? row.id.slice(0, 8)
 *             -- row.id is null  ->  TypeError: Cannot read property 'slice' of null
 *
 * # Why this mattered so much
 *
 * That TypeError is the one shown to the Solana dApp Store reviewer, under the
 * heading "Connection failed", at the moment they connected a wallet. It was
 * cited in the rejection: "We could not complete the account access or
 * onboarding flow needed to review the app."
 *
 * It reproduces on any wallet that has never been linked - which is every
 * wallet a reviewer owns. It does *not* reproduce on a wallet already attached
 * to an account, which is why it survived local testing: the developer's own
 * wallet was linked on the first run and never took this path again.
 *
 * # The fix
 *
 * `returns setof public.profiles` returns zero rows when nothing matches, which
 * is what "no such account" means and what every caller already assumed. The
 * body is unchanged.
 *
 * The client is being hardened alongside this - a row is only a profile if it
 * has an id - because a client that trusts the shape of a server response is
 * one schema change away from this same crash.
 */

create or replace function public.profile_for_wallet(p_wallet_address text)
returns setof public.profiles
language sql
stable
set search_path = public
as $$
  select p.*
  from public.profiles p
  where p.id = public.wallet_owner_id(p_wallet_address)
  limit 1;
$$;

grant execute on function public.profile_for_wallet(text) to anon, authenticated;
