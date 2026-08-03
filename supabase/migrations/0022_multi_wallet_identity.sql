-- ---------------------------------------------------------------------------
-- Eventerz - 0022: one account, many wallets
--
-- Run after 0021. Safe to re-run.
--
-- What was wrong
-- --------------
-- `profiles.wallet_address` is a single `text unique` column, so the model it
-- encodes is "one account owns exactly one wallet". Real users do not hold one
-- wallet. They hold a Seeker wallet, a browser wallet, a hardware wallet and a
-- burner, and every one of those is *them*. With a 1:1 column the only way to
-- use a second wallet was to make a second account - so the schema that was
-- meant to stop duplicate identities was the thing manufacturing them.
--
-- The same column produced the confusion between sign-ins. Connecting a wallet
-- that was not the one column's value resolved to no profile at all, which the
-- app represented as a provisional `wallet:<address>` identity - and then every
-- write carrying that id failed against a uuid column:
--
--     invalid input syntax for type uuid: "wallet:CiM2ZRkc..."
--
-- The model this migration settles on
-- -----------------------------------
-- **The Google account is the account. Wallets attach to it, many to one.**
--
--   profiles (1) ─── (N) wallet_links
--
-- Which way round this goes is the whole decision, so it is worth stating why
-- it is not the other way:
--
--   * **Bot resistance.** A keypair costs nothing and takes a millisecond to
--     generate; ten thousand of them is a `for` loop. A Google account costs a
--     phone number and real friction. Rooting identity in the wallet means
--     rooting it in the cheapest thing to mass-produce on the internet, which
--     is the opposite of a gate. Rooting it in Google puts a per-account cost
--     on sybils while costing a genuine user one tap they were going to make
--     anyway.
--   * **Recovery.** A lost key must not be a lost account. If the wallet is the
--     root, losing it loses the reputation, the ticket history and the friend
--     graph with it. If it is a link, losing it means removing a row.
--   * **It matches how the product already reads.** Profile, discovery,
--     friends and messages are account features and always were; RSVP and
--     publishing are the wallet's, because they sign. Nothing about that needs
--     the wallet to *be* the account.
--
-- Rather than one wallet, a profile now has a set, each proven by an Ed25519
-- signature exactly as 0011 requires, and exactly one of them marked primary.
--
-- Why `profiles.wallet_address` survives
-- --------------------------------------
-- It is kept, and maintained by trigger as a mirror of the primary link. Both
-- clients, four RPCs and the payment receipts read that column; migrating them
-- in the same change as the schema would mean a schema whose correctness could
-- only be established by reviewing every reader. Instead the column keeps
-- meaning precisely what it always meant - "this account's main wallet" - and
-- keeps being true, so every existing reader stays correct with no edit. New
-- code reads `wallet_links`.
--
-- Privacy: why secondary wallets are not world-readable
-- ----------------------------------------------------
-- `profiles` is world-readable by design (event cards must render for signed-out
-- visitors), and `wallet_address` rides along in it. That is one address per
-- account and it is the one the user publishes by hosting an event.
--
-- Publishing the *set* is a different thing entirely. A burner wallet linked to
-- the same profile as a main wallet is, the moment both are readable, a public
-- statement that the same person owns both - which is exactly the linkage a
-- burner exists to avoid. So `wallet_links` is readable only by its owner, and
-- the public address -> account lookup keeps resolving primaries only. The
-- public surface is therefore identical to what 0001 already exposed; the new
-- rows add nothing to it.
-- ---------------------------------------------------------------------------

/* ===========================================================================
   1. The link table
   =========================================================================== */

create table if not exists public.wallet_links (
  /** The address is the key: a wallet belongs to at most one account, ever.
      This is what stops two profiles claiming the same wallet, and it is the
      same guarantee `profiles.wallet_address unique` used to give. */
  address    text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,

  /** Mirrored into `profiles.wallet_address` by trigger. Exactly one per
      profile - see the partial unique index below. */
  is_primary boolean not null default false,

  /** User-supplied, e.g. "Seeker" or "Ledger". Null until they name it. */
  label      text,

  linked_at  timestamptz not null default now(),

  constraint wallet_links_address_length check (length(trim(address)) >= 32)
);

create index if not exists wallet_links_profile_idx
  on public.wallet_links (profile_id);

/*
 * One primary per profile. A partial unique index rather than a constraint:
 * the uniqueness only applies to rows where `is_primary`, and there is no way
 * to say that in a table constraint.
 */
create unique index if not exists wallet_links_one_primary_per_profile
  on public.wallet_links (profile_id)
  where is_primary;

comment on table public.wallet_links is
  'Wallets proven to belong to a profile. Many per profile; one primary, mirrored to profiles.wallet_address.';

/* ---------------------------------------------------------------------------
   Backfill from the column this table replaces.

   Runs before the trigger exists, so it cannot fight with it. Every existing
   `profiles.wallet_address` becomes that profile's primary link, which means
   no user has to re-sign anything they already proved.
   --------------------------------------------------------------------------- */

insert into public.wallet_links (address, profile_id, is_primary)
select trim(p.wallet_address), p.id, true
from public.profiles p
where p.wallet_address is not null
  and length(trim(p.wallet_address)) >= 32
on conflict (address) do nothing;

/* ===========================================================================
   2. Keeping profiles.wallet_address true
   ---------------------------------------------------------------------------
   The mirror is maintained here rather than by every caller, because a mirror
   only helps if it cannot drift. Any path that touches `wallet_links` - the
   RPCs below, a future one, or a hand-run statement during an incident - lands
   the column in the same state.
   =========================================================================== */

create or replace function public.sync_primary_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.profile_id, old.profile_id);
  primary_address text;
begin
  select wl.address into primary_address
  from public.wallet_links wl
  where wl.profile_id = target and wl.is_primary
  limit 1;

  /*
   * No primary left because the user unlinked it. Promote the oldest remaining
   * wallet rather than leaving the account holding wallets it cannot be reached
   * by. Only when the set is genuinely empty does the column go null.
   *
   * # Why this is restricted to DELETE
   *
   * It used to run on any operation, and that made changing your main wallet
   * impossible. `set_primary_wallet` demotes the old primary and then promotes
   * the new one, which it has to do in that order - the partial unique index
   * means two primaries is not a representable state, so promoting first
   * raises. But the demote fired this trigger, which saw "no primary" and
   * helpfully promoted the *oldest* wallet - usually the one just demoted. The
   * promote that followed then made a second row primary and hit the unique
   * violation.
   *
   * A row being updated is always somebody deliberately managing the set, and
   * that somebody is mid-transition. A row being deleted is the only case where
   * an account can be left with no primary and nothing on its way to fix that,
   * which is exactly when a repair is wanted.
   */
  if primary_address is null and tg_op = 'DELETE' then
    select wl.address into primary_address
    from public.wallet_links wl
    where wl.profile_id = target
    order by wl.linked_at
    limit 1;

    if primary_address is not null then
      update public.wallet_links
      set is_primary = true
      where address = primary_address;
    end if;
  end if;

  update public.profiles
  set wallet_address = primary_address
  where id = target
    and wallet_address is distinct from primary_address;

  return null;
end;
$$;

drop trigger if exists wallet_links_sync_primary on public.wallet_links;
create trigger wallet_links_sync_primary
  after insert or update or delete on public.wallet_links
  for each row execute function public.sync_primary_wallet();

/* ===========================================================================
   3. RLS - your own links, and nobody else's
   =========================================================================== */

alter table public.wallet_links enable row level security;

drop policy if exists "owners read their wallet links" on public.wallet_links;
create policy "owners read their wallet links" on public.wallet_links
  for select using (profile_id = (select auth.uid()));

/*
 * No insert/update/delete policies. Every write goes through a SECURITY
 * DEFINER function below, because linking requires a verified signature and a
 * policy cannot check one. With RLS on and no write policy, there is no path
 * from a client to a row in this table that skips the proof.
 */

revoke all on public.wallet_links from anon, authenticated;
grant select on public.wallet_links to authenticated;

/* ===========================================================================
   4. How many wallets is "many"
   ---------------------------------------------------------------------------
   Unbounded would make one account an unbounded number of on-chain identities,
   which hands back most of what rooting identity in Google was meant to take
   away. Ten is far above what a real user has and far below what is useful to
   anyone farming.
   =========================================================================== */

create or replace function public.max_wallets_per_profile()
returns int language sql immutable as $$ select 10 $$;

/* ===========================================================================
   5. Linking, after the signature has been checked

   Replaces the 0011 body. Same contract - the Edge Function verifies Ed25519
   and passes the nonce it verified against - and the same consumption of that
   nonce. What changes is where the address lands.
   =========================================================================== */

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
/*
 * A note on the local names below, which is the reason every one of them
 * carries a `v_` prefix.
 *
 * The obvious name for "the address we are working on" is `address`, and
 * `wallet_links` has a column called exactly that. PL/pgSQL resolves an
 * unqualified identifier to the variable, so `where address = address` is
 * `variable = variable` - true for every row - and `delete ... where address =
 * address and profile_id = me` silently removes every wallet on the account
 * instead of one. (`variable_conflict = error` catches the ambiguous cases at
 * runtime, but only the ones it can see as ambiguous; the self-comparison above
 * is unambiguous and wrong.) Prefixing the variables makes the collision
 * impossible rather than merely detected.
 */
declare
  challenge   public.wallet_link_nonces;
  v_address   text := trim(p_wallet_address);
  v_owner     uuid;
  v_held      int;
  result      public.profiles;
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
     or challenge.wallet_address <> v_address then
    raise exception 'That verification does not match this request.'
      using errcode = '22023';
  end if;

  select wl.profile_id into v_owner
  from public.wallet_links wl where wl.address = v_address;

  /*
   * Already linked to this same account. Not an error: the user tapped Connect
   * twice, or reinstalled and reconnected. Return the profile rather than
   * telling someone their own wallet belongs to someone else.
   */
  if v_owner = p_profile_id then
    select * into result from public.profiles where id = p_profile_id;
    return result;
  end if;

  if v_owner is not null then
    raise exception 'That wallet is already linked to another Eventerz account.'
      using errcode = '23505';
  end if;

  select count(*) into v_held
  from public.wallet_links where profile_id = p_profile_id;

  if v_held >= public.max_wallets_per_profile() then
    raise exception 'You have reached the limit of % linked wallets. Remove one first.',
      public.max_wallets_per_profile()
      using errcode = '23514';
  end if;

  -- The first wallet on an account is its primary; later ones are not, unless
  -- the user promotes them.
  insert into public.wallet_links (address, profile_id, is_primary)
  values (v_address, p_profile_id, v_held = 0);

  select * into result from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'No such profile.' using errcode = 'P0002';
  end if;

  insert into public.notifications (profile_id, kind, title, body)
  values (
    p_profile_id, 'security', 'Wallet linked',
    format('%s...%s is now linked to your account. If this was not you, remove it in Settings.',
           left(v_address, 4), right(v_address, 4))
  );

  return result;
end;
$$;

revoke all on function public.link_wallet_verified(uuid, text, uuid)
  from public, anon, authenticated;

/* ===========================================================================
   6. Issuing the challenge
   ---------------------------------------------------------------------------
   Same as 0011 except the "already claimed" pre-check reads `wallet_links`,
   and re-linking a wallet you already hold is allowed through so the client
   can use the link flow as an idempotent "make sure this is linked".
   =========================================================================== */

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
    address,
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
   7. Reading and managing your own set
   =========================================================================== */

/**
 * The caller's wallets, primary first.
 *
 * A plain `select` against the table would do the same thing under the RLS
 * policy above; this exists so the client has one stable name to call and so
 * the ordering is decided once, here, rather than in two clients that can
 * disagree about it.
 */
create or replace function public.my_wallets()
returns setof public.wallet_links
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.wallet_links
  where profile_id = auth.uid()
  order by is_primary desc, linked_at;
$$;

revoke all on function public.my_wallets() from public;
grant execute on function public.my_wallets() to authenticated;

/**
 * Promote one of your wallets to primary.
 *
 * Demote-then-promote in one statement pair inside one transaction: the
 * partial unique index means a moment with two primaries is not representable,
 * so promoting before demoting would raise rather than briefly misbehave.
 */
create or replace function public.set_primary_wallet(p_wallet_address text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  v_address text := trim(p_wallet_address);
  v_owner   uuid;
  result    public.profiles;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select wl.profile_id into v_owner
  from public.wallet_links wl where wl.address = v_address;

  if v_owner is null or v_owner <> me then
    raise exception 'That wallet is not linked to your account.'
      using errcode = 'P0002';
  end if;

  update public.wallet_links wl set is_primary = false
  where wl.profile_id = me and wl.is_primary and wl.address <> v_address;

  update public.wallet_links wl set is_primary = true
  where wl.address = v_address and wl.profile_id = me;

  select * into result from public.profiles where id = me;
  return result;
end;
$$;

revoke all on function public.set_primary_wallet(text) from public;
grant execute on function public.set_primary_wallet(text) to authenticated;

/**
 * Remove one wallet from your account.
 *
 * The no-argument `unlink_wallet()` from 0011 is redefined below in terms of
 * this one, so installed builds that still call it keep working and mean the
 * obvious thing: remove my primary.
 */
create or replace function public.unlink_wallet_address(p_wallet_address text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  v_address text := trim(p_wallet_address);
  removed   int;
  result    public.profiles;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  delete from public.wallet_links wl
  where wl.address = v_address and wl.profile_id = me;

  get diagnostics removed = row_count;
  if removed = 0 then
    raise exception 'That wallet is not linked to your account.'
      using errcode = 'P0002';
  end if;

  -- The trigger has already promoted a replacement primary and re-pointed
  -- profiles.wallet_address, so this read is of the settled state.
  select * into result from public.profiles where id = me;
  return result;
end;
$$;

revoke all on function public.unlink_wallet_address(text) from public;
grant execute on function public.unlink_wallet_address(text) to authenticated;

create or replace function public.unlink_wallet()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  v_current text;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select p.wallet_address into v_current from public.profiles p where p.id = me;
  if v_current is null then
    raise exception 'There is no wallet linked to your account.'
      using errcode = 'P0002';
  end if;

  return public.unlink_wallet_address(v_current);
end;
$$;

revoke all on function public.unlink_wallet() from public;
grant execute on function public.unlink_wallet() to authenticated;

/* ===========================================================================
   8. The public address -> account lookup
   ---------------------------------------------------------------------------
   Resolves primaries only, which is exactly the surface `profiles` already
   publishes through its own `wallet_address` column. Secondary wallets stay
   private (see the header).

   This is what lets a returning user who connects their wallet on a fresh
   install be told *which* account it belongs to, instead of being handed a
   provisional identity and a uuid error the first time they try to do
   anything.
   =========================================================================== */

/**
 * The account id behind a primary wallet, and nothing else.
 *
 * SECURITY DEFINER, because `wallet_links` is readable only by its owner and
 * this lookup has to work for a signed-out visitor.
 *
 * It returns a uuid rather than the profile row, and `profile_for_wallet`
 * below stays SECURITY INVOKER and joins on it. That split is the point: a
 * definer function returning `public.profiles` would hand out every column of
 * that table regardless of the column-level grants 0015 and 0017 rely on, so
 * the day somebody adds a sensitive column to `profiles` it would be published
 * to `anon` by a function nobody thought to re-read. Keeping the definer's
 * output to one opaque id means the widest thing it can ever leak is the fact
 * that an address is claimed - which `wallet_link_status` states outright
 * anyway.
 */
create or replace function public.wallet_owner_id(p_wallet_address text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select wl.profile_id
  from public.wallet_links wl
  where wl.address = trim(p_wallet_address)
    and wl.is_primary
  limit 1;
$$;

grant execute on function public.wallet_owner_id(text) to anon, authenticated;

create or replace function public.profile_for_wallet(p_wallet_address text)
returns public.profiles
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

/**
 * Is this wallet spoken for, and is it mine?
 *
 * Returns a verdict, never a profile id, so it can be called by anyone without
 * turning the address space into a directory of accounts. The app uses it to
 * decide which of three things to say when a wallet connects: link it, sign in
 * to the account that holds it, or nothing.
 */
create or replace function public.wallet_link_status(p_wallet_address text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me    uuid := auth.uid();
  owner uuid;
begin
  select wl.profile_id into owner
  from public.wallet_links wl where wl.address = trim(p_wallet_address);

  if owner is null then return 'unlinked'; end if;
  if me is not null and owner = me then return 'mine'; end if;
  return 'taken';
end;
$$;

grant execute on function public.wallet_link_status(text) to anon, authenticated;

/* ===========================================================================
   9. Deletion
   ---------------------------------------------------------------------------
   `delete_my_account()` (0015) anonymises the profile and clears the wallet
   link. `wallet_links` cascades on `profile_id`, so the rows go with the
   profile - but the cascade only fires when the *profile row* is deleted, and
   0015 deliberately keeps it. Clear them explicitly so a deleted account does
   not leave its wallets claimed and unreachable.
   =========================================================================== */

create or replace function public.release_wallets_on_anonymise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 0015 blanks the name to 'Deleted account' as its marker for an anonymised
  -- row. When that happens, the wallets stop belonging to anyone.
  if new.name = 'Deleted account' and old.name is distinct from new.name then
    delete from public.wallet_links where profile_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_release_wallets on public.profiles;
create trigger profiles_release_wallets
  after update of name on public.profiles
  for each row execute function public.release_wallets_on_anonymise();
