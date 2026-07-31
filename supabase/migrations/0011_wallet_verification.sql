-- ---------------------------------------------------------------------------
-- Eventerz - 0011: proving you own the wallet you are linking
--
-- Run after 0010. Safe to re-run.
--
-- What was wrong
-- --------------
-- `link_wallet(text)` (0001) took an address and wrote it to the caller's
-- profile. It checked that no *other* profile had already claimed that address
-- and nothing else. So any signed-in user could link any wallet they could
-- read off the explorer, as long as nobody had claimed it first.
--
-- That is not a theoretical hole once anything on-chain is attached to an
-- identity. Claiming a well-known address grants its reputation, its ticket
-- history and - the moment payments exist (0009) - a receipt trail saying
-- money went to a person it did not go to. The check the function skipped is
-- the only one that matters: *does this caller hold the private key?*
--
-- The fix
-- -------
-- Ed25519 signature verification, in three steps:
--
--   1. `issue_wallet_link_nonce()` mints a single-use challenge bound to the
--      caller and the address, valid for five minutes.
--   2. The client asks the wallet to sign that challenge text. Every Solana
--      wallet exposes message signing; it costs nothing and touches no chain.
--   3. The `link-wallet` Edge Function verifies the signature against the
--      address, then calls `link_wallet_verified()` with the service-role key.
--
-- Why the verification is not in Postgres: `pgcrypto` has no Ed25519. The
-- signature check needs a real crypto library, which means a function runtime.
-- Deno has `crypto.subtle` with Ed25519 built in, so the Edge Function needs
-- no dependencies at all - see `supabase/functions/link-wallet/`.
--
-- Why the nonce is stored server-side rather than signed-and-stateless: a
-- stateless challenge can be replayed for as long as it is valid, and "valid
-- for five minutes" is five minutes in which a leaked signature relinks the
-- wallet. A row that is deleted on use can be replayed exactly zero times.
-- ---------------------------------------------------------------------------

/* ===========================================================================
   1. Challenges
   =========================================================================== */

create table if not exists public.wallet_link_nonces (
  nonce      uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  /** The address this challenge is for. A signature for one wallet must not
      unlock another. */
  wallet_address text not null,
  expires_at timestamptz not null default now() + interval '5 minutes',
  created_at timestamptz not null default now()
);

create index if not exists wallet_link_nonces_profile_idx
  on public.wallet_link_nonces (profile_id);
create index if not exists wallet_link_nonces_expiry_idx
  on public.wallet_link_nonces (expires_at);

alter table public.wallet_link_nonces enable row level security;

/*
 * No policies. The client never reads this table - it receives its nonce as
 * the return value of the function that mints it, and the Edge Function reads
 * it with the service-role key. With RLS on and no policy, a client that goes
 * looking finds an empty table, so one user cannot enumerate another's
 * outstanding challenges.
 */

/**
 * Mint a challenge for the caller to sign.
 *
 * Returns the full message text rather than a bare nonce. The message says, in
 * words the wallet will display, what signing it authorises - a wallet popup
 * showing an opaque UUID teaches users to approve opaque UUIDs, which is the
 * habit every signature-phishing attack depends on.
 *
 * Previous outstanding challenges for this caller are dropped. A user who
 * starts the flow three times should not leave two live challenges behind
 * them.
 */
create or replace function public.issue_wallet_link_nonce(p_wallet_address text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  claimed uuid;
  fresh   uuid;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  if p_wallet_address is null or length(trim(p_wallet_address)) < 32 then
    raise exception 'That does not look like a Solana address.'
      using errcode = '22023';
  end if;

  -- Fail here rather than after the user has approved a signature. Being told
  -- "already linked" before the wallet popup is a better experience than after.
  select id into claimed from public.profiles
  where wallet_address = trim(p_wallet_address);
  if claimed is not null and claimed <> me then
    raise exception 'That wallet is already linked to another account.'
      using errcode = '23505';
  end if;

  delete from public.wallet_link_nonces where profile_id = me;
  -- Opportunistic sweep; the table is small and this keeps it that way without
  -- a scheduled job.
  delete from public.wallet_link_nonces where expires_at < now();

  insert into public.wallet_link_nonces (profile_id, wallet_address)
  values (me, trim(p_wallet_address))
  returning nonce into fresh;

  /*
   * Every literal carries its own `E` prefix.
   *
   * Adjacent string constants are concatenated by the parser, but each is
   * *escaped* independently - so `E'a\n' 'b\n'` yields a real newline followed by
   * a literal backslash-n. The wallet would have displayed "...funds.\n\nNonce:"
   * verbatim, which is exactly the kind of malformed prompt that teaches users to
   * approve signatures without reading them.
   *
   * The parenthesised `(now() + interval '5 minutes')` matters for the same
   * reason: `AT TIME ZONE` binds tighter than `+`, so without them Postgres
   * parses `interval AT TIME ZONE 'UTC'` and the expression does not mean what
   * it reads as.
   */
  return format(
    E'Eventerz - verify wallet ownership\n\n'
    E'Signing this message links %s to your Eventerz account.\n'
    E'It is free, does not touch the blockchain, and cannot move any funds.\n\n'
    E'Nonce: %s\n'
    E'Expires: %s',
    trim(p_wallet_address),
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

/* ===========================================================================
   2. Linking, after the signature has been checked
   =========================================================================== */

/**
 * Bind a wallet to a profile. Service-role only.
 *
 * Takes the nonce, not just the address: the Edge Function verified a
 * signature over a specific challenge, and passing that challenge back is what
 * ties the verification it performed to the row this writes. Handing it only
 * an address would let a bug in the caller link a wallet whose signature was
 * never checked.
 *
 * The nonce is consumed - deleted, not flagged - so the same signature cannot
 * be presented twice.
 */
create or replace function public.link_wallet_verified(
  p_profile_id uuid,
  p_wallet_address text,
  p_nonce uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge public.wallet_link_nonces;
  claimed   uuid;
  result    public.profiles;
begin
  delete from public.wallet_link_nonces
  where nonce = p_nonce
  returning * into challenge;

  if not found then
    raise exception 'That verification has already been used or has expired.'
      using errcode = 'P0002';
  end if;
  if challenge.expires_at < now() then
    raise exception 'That verification expired. Try again.' using errcode = '22023';
  end if;
  if challenge.profile_id <> p_profile_id
     or challenge.wallet_address <> trim(p_wallet_address) then
    raise exception 'That verification does not match this request.'
      using errcode = '22023';
  end if;

  select id into claimed from public.profiles
  where wallet_address = trim(p_wallet_address);
  if claimed is not null and claimed <> p_profile_id then
    raise exception 'That wallet is already linked to another account.'
      using errcode = '23505';
  end if;

  update public.profiles
  set wallet_address = trim(p_wallet_address)
  where id = p_profile_id
  returning * into result;

  if not found then
    raise exception 'No such profile.' using errcode = 'P0002';
  end if;

  insert into public.notifications (profile_id, kind, title, body)
  values (
    p_profile_id, 'security', 'Wallet linked',
    format('%s...%s is now linked to your account. If this was not you, disconnect it in Settings.',
           left(trim(p_wallet_address), 4), right(trim(p_wallet_address), 4))
  );

  return result;
end;
$$;

revoke all on function public.link_wallet_verified(uuid, text, uuid)
  from public, anon, authenticated;

/* ===========================================================================
   3. Close the unverified path
   ---------------------------------------------------------------------------
   `link_wallet` stays defined - dropping it would break installed mobile
   builds with a confusing "function does not exist" - but it is no longer
   callable by a client. It now raises a message that tells the developer where
   to go, which is the only useful thing an obsolete entry point can do.
   =========================================================================== */

create or replace function public.link_wallet(p_wallet_address text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception
    'Wallet linking now requires a signature. Call the link-wallet Edge Function instead.'
    using errcode = '42501';
end;
$$;

revoke all on function public.link_wallet(text) from public, anon, authenticated;

/**
 * Unlink. The caller's own wallet, and only their own.
 *
 * Needed because linking is now a deliberate act with a signature behind it:
 * a user who links the wrong wallet, or loses the key, must have a way back
 * that does not involve deleting their account and their attendance history
 * with it.
 */
create or replace function public.unlink_wallet()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  result public.profiles;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  update public.profiles set wallet_address = null
  where id = me
  returning * into result;

  return result;
end;
$$;

revoke all on function public.unlink_wallet() from public;
grant execute on function public.unlink_wallet() to authenticated;
