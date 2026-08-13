/**
 * `issue_wallet_link_nonce` referenced a column that does not exist, so no
 * wallet could ever be linked. Also lowers the per-account wallet cap to 3.
 *
 * # The bug
 *
 * 0022 renamed every local in these functions to a `v_` prefix, deliberately.
 * The reason is written out at length in `link_wallet_verified`: the natural
 * name for the local is `address`, `wallet_links` has a column of exactly that
 * name, and PL/pgSQL resolves an unqualified identifier to the *variable* - so
 * `where address = address` is `variable = variable`, true for every row, and a
 * delete guarded that way removes every wallet on the account.
 *
 * The rename was applied to every reference but one. The last statement of
 * `issue_wallet_link_nonce` built the challenge text with:
 *
 *     format(E'... links %s to your Eventerz account ...', address, ...)
 *                                                          ^^^^^^^
 *
 * where the local is `v_address`. With no variable of that name, PL/pgSQL falls
 * through to resolving `address` as a column - and there is no table in scope
 * at that point, so the function fails at runtime with:
 *
 *     column "address" does not exist
 *
 * # What it broke
 *
 * Everything, silently and completely. This is the *first* call the link flow
 * makes - the challenge is issued before the wallet is ever asked to sign - so
 * linking failed before the signature prompt, every time, for every user. The
 * app surfaced it as:
 *
 *     Could not verify that wallet
 *     column "address" does not exist
 *
 * and, because no `wallet_links` row was ever written, "Linked wallets" stayed
 * empty even though the wallet was connected and shown in the header. The two
 * looked like separate bugs and were this one.
 *
 * It could not have been caught by anything that did not execute the function:
 * PL/pgSQL bodies are not name-resolved until they run, so the migration
 * applied cleanly and the mistake waited in the database for a caller.
 *
 * # The cap
 *
 * `max_wallets_per_profile()` drops from 10 to 3, per product decision. Only
 * the ceiling for *new* links changes: the check is `v_held >= cap` at link
 * time, so an account already holding more than three keeps them all and simply
 * cannot add another until it is back under the limit. Nothing is unlinked
 * automatically - taking somebody's proven wallet away to satisfy a new policy
 * is not a thing a migration should do quietly.
 */

create or replace function public.max_wallets_per_profile()
returns int language sql immutable as $$ select 3 $$;

/*
 * Body reproduced from 0022 with the single-word fix, rather than patched in
 * place, because `create or replace function` has no way to edit a body - the
 * whole definition is the unit of replacement.
 */
create or replace function public.issue_wallet_link_nonce(p_wallet_address text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  v_address text := trim(p_wallet_address);
  v_owner   uuid;
  v_held    int;
  fresh     uuid;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  if p_wallet_address is null or length(v_address) < 32 then
    raise exception 'That does not look like a Solana address.'
      using errcode = '22023';
  end if;

  -- Fail before the wallet popup rather than after. Being told "already linked"
  -- before approving a signature is a better experience than after.
  select wl.profile_id into v_owner
  from public.wallet_links wl where wl.address = v_address;

  if v_owner is not null and v_owner <> me then
    raise exception 'That wallet is already linked to another Eventerz account.'
      using errcode = '23505';
  end if;

  if v_owner is null then
    select count(*) into v_held from public.wallet_links where profile_id = me;
    if v_held >= public.max_wallets_per_profile() then
      raise exception 'You have reached the limit of % linked wallets. Remove one first.',
        public.max_wallets_per_profile()
        using errcode = '23514';
    end if;
  end if;

  delete from public.wallet_link_nonces where profile_id = me;
  delete from public.wallet_link_nonces where expires_at < now();

  insert into public.wallet_link_nonces (profile_id, wallet_address)
  values (me, v_address)
  returning nonce into fresh;

  return format(
    E'Eventerz - verify wallet ownership\n\n'
    || E'Signing this message links %s to your Eventerz account.\n'
    || E'It is free, does not touch the blockchain, and cannot move any funds.\n\n'
    || E'Nonce: %s\n'
    || E'Expires: %s',
    v_address,   -- was `address`: no such variable, and no such column here
    fresh,
    to_char(
      (now() + interval '5 minutes') at time zone 'UTC',
      'YYYY-MM-DD HH24:MI:SS'
    ) || ' UTC'
  );
end;
$$;

revoke all on function public.issue_wallet_link_nonce(text) from public;
grant execute on function public.issue_wallet_link_nonce(text) to authenticated;
