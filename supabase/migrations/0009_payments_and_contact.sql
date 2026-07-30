-- ---------------------------------------------------------------------------
-- Eventerz — 0009: in-chat payments, and contacting a host
--
-- Run after 0008. Safe to re-run.
--
-- Two things live here because they are the same surface: the DM thread.
--
--  1. **Sending crypto in a message.** A transfer already works — both clients
--     have a wallet and Solana does not need our permission. What is missing
--     is the *receipt*: without a record, "did you get the 0.4 SOL?" is a
--     conversation neither person can settle, and the signature lives only in
--     whichever wallet app happened to send it.
--
--     So the money moves on-chain and the receipt lands in the thread. The
--     chain is the source of truth for whether it happened; this table is the
--     source of truth for *what it was for* and *who it was between*, which
--     the chain does not know — it sees two base58 strings, not two people.
--
--  2. **Contacting a host.** A guest deciding whether to attend often has one
--     question, and requiring a friend request first turns a thirty-second
--     exchange into a two-step negotiation. DMs were already open to any two
--     profiles under `can_access_channel` (0003) — a party to the channel is
--     the only requirement — so nothing needs loosening. What was missing is
--     the *inbox*: it listed friends, so a message from a non-friend arrived
--     in a thread nobody would ever open. `my_dm_partners()` fixes that.
--
-- The trust boundary, stated plainly
-- ----------------------------------
-- `record_payment` does not verify the signature against the cluster. Postgres
-- cannot make an outbound RPC call, and a client that lies gets a receipt row
-- whose `signature` resolves to nothing — every surface renders it as an
-- explorer link, so the lie is one click from being caught, and the row is
-- marked `verified = false` until something checks. Verification belongs in an
-- Edge Function (see `supabase/functions/verify-payment/`), which is where the
-- wallet-ownership check lives too.
--
-- What the function *does* enforce is the part a lie would actually profit
-- from: you may only record a payment as yourself, and the recipient wallet
-- has to be the wallet that profile actually holds. Without that check, anyone
-- could paste a real signature from someone else's transfer and have it
-- rendered as "you were paid".
-- ---------------------------------------------------------------------------

/* ===========================================================================
   1. Messages carry a kind
   =========================================================================== */

alter table public.messages
  add column if not exists kind text not null default 'text',
  add column if not exists payment_id uuid;

do $$ begin
  alter table public.messages
    add constraint messages_kind_known
    check (kind in ('text', 'payment'));
exception when duplicate_object then null; end $$;

/*
 * A payment message's body is generated, not typed, so the 1..2000 length
 * check from 0003 is the wrong rule for it — but relaxing that check for text
 * would remove the only guard against empty messages. Instead the body is
 * always written by the function for payments, and the existing check still
 * holds because the generated body is never empty.
 */

/* ===========================================================================
   2. Payments
   =========================================================================== */

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),

  /*
   * The transaction signature, unique. This is what makes the table
   * idempotent: a client that retries after a timeout — the common case,
   * because the transfer confirms and the app is backgrounded before the
   * insert lands — records the same payment once rather than twice.
   */
  signature text unique not null,
  cluster   text not null default 'mainnet-beta',

  from_profile uuid not null references public.profiles (id) on delete cascade,
  /*
   * Nullable: paying a raw address that belongs to nobody on Eventerz is a
   * legitimate thing to do, and refusing it would make the feature useless for
   * exactly the case where a receipt matters most.
   */
  to_profile   uuid references public.profiles (id) on delete set null,

  from_wallet text not null,
  to_wallet   text not null,

  /*
   * Integer base units, never a float. 0.1 + 0.2 is not 0.3 in binary floating
   * point, and a ledger that cannot add up is not a ledger. Lamports for SOL,
   * the mint's own base units for anything else.
   */
  amount bigint not null check (amount > 0),
  /** Null for native SOL; an SPL mint address otherwise. */
  mint     text,
  symbol   text not null default 'SOL',
  decimals int  not null default 9 check (decimals between 0 and 18),

  memo text check (memo is null or length(memo) <= 200),

  /** The thread this receipt belongs to, when it was sent from one. */
  channel_id text,

  /**
   * False until something has actually looked at the cluster. Every client
   * renders an unverified receipt with its explorer link and no green tick —
   * an unchecked claim must not look like a checked one.
   */
  verified boolean not null default false,

  created_at timestamptz not null default now(),

  constraint payments_not_self check (from_wallet <> to_wallet)
);

create index if not exists payments_from_idx on public.payments (from_profile, created_at desc);
create index if not exists payments_to_idx   on public.payments (to_profile, created_at desc);
create index if not exists payments_channel_idx on public.payments (channel_id, created_at desc);

alter table public.payments enable row level security;

/*
 * Visible to the two people involved and nobody else. A payment is not public
 * information even though the transaction is: the chain shows two addresses,
 * and joining those addresses to two named profiles is precisely the privacy
 * the addresses were protecting.
 */
drop policy if exists "payments visible to parties" on public.payments;
create policy "payments visible to parties" on public.payments
  for select using (
    from_profile = (select auth.uid())
    or to_profile = (select auth.uid())
  );

/*
 * No INSERT or UPDATE policy — writes go through `record_payment` below.
 * A direct insert policy would let a client set `verified = true`, or record a
 * payment *from* someone else. RLS restricts which rows you may write, never
 * which values you may put in them.
 */
drop policy if exists "payments self write" on public.payments;

/* ===========================================================================
   3. Recording a payment
   =========================================================================== */

/**
 * Record a completed transfer and drop a receipt into the thread.
 *
 * Called after the transaction confirms on the cluster. Both halves — the
 * payment row and the message — land in one transaction, because a receipt
 * with no message is invisible and a message with no receipt has nothing to
 * render.
 *
 * Idempotent on `signature`: retrying returns the existing row instead of
 * raising, so a client that loses its connection between confirmation and
 * this call can simply call again.
 */
create or replace function public.record_payment(
  p_signature  text,
  p_to_wallet  text,
  p_amount     bigint,
  p_channel_id text default null,
  p_to_profile uuid default null,
  p_memo       text default null,
  p_mint       text default null,
  p_symbol     text default 'SOL',
  p_decimals   int  default 9,
  p_cluster    text default 'mainnet-beta'
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  me          uuid := auth.uid();
  my_wallet   text;
  my_name     text;
  their_wallet text;
  existing    public.payments;
  result      public.payments;
  pretty      text;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  if p_signature is null or length(trim(p_signature)) < 32 then
    raise exception 'A transaction signature is required.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = '22023';
  end if;

  -- Same signature twice is the retry case, not an error.
  select * into existing from public.payments where signature = p_signature;
  if found then
    return existing;
  end if;

  select wallet_address, coalesce(name, 'Someone')
    into my_wallet, my_name
  from public.profiles where id = me;

  if my_wallet is null then
    raise exception 'Connect a wallet before sending.' using errcode = '42501';
  end if;

  /*
   * If the caller names a recipient profile, that profile's wallet must be the
   * one that was actually paid. Otherwise anyone could take a real signature
   * off the explorer and record it as "I paid you" against a stranger.
   */
  if p_to_profile is not null then
    select wallet_address into their_wallet
    from public.profiles where id = p_to_profile;

    if their_wallet is null or their_wallet <> p_to_wallet then
      raise exception 'That wallet does not belong to the person you selected.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.payments (
    signature, cluster, from_profile, to_profile, from_wallet, to_wallet,
    amount, mint, symbol, decimals, memo, channel_id
  )
  values (
    trim(p_signature), p_cluster, me, p_to_profile, my_wallet, p_to_wallet,
    p_amount, p_mint, coalesce(nullif(trim(p_symbol), ''), 'SOL'),
    coalesce(p_decimals, 9), nullif(trim(coalesce(p_memo, '')), ''), p_channel_id
  )
  returning * into result;

  /*
   * Human-readable amount, trailing zeros trimmed: "0.4 SOL", not
   * "0.400000000".
   *
   * The divisor is `10::numeric ^ decimals`, not `power()`. `power()` returns
   * double precision, which would drag the whole expression into binary floating
   * point — and a receipt that says 0.30000000000000004 SOL is worse than no
   * receipt. Staying in `numeric` keeps it exact.
   */
  pretty := trim(trailing '.' from
              trim(trailing '0' from
                to_char(result.amount::numeric / (10::numeric ^ result.decimals),
                        'FM9999999990.999999999')))
            || ' ' || result.symbol;

  /*
   * The receipt is posted by the *function*, not the client, which is why
   * `messages` has no insert policy permitting `kind = 'payment'`. A client
   * that could write its own payment message could claim any amount it liked
   * without a transfer behind it.
   */
  if p_channel_id is not null and public.can_access_channel(p_channel_id, me) then
    insert into public.messages (scope, channel_id, sender_id, body, kind, payment_id)
    values (
      case when p_channel_id like 'dm:%' then 'dm' else 'event' end,
      p_channel_id, me, format('Sent %s', pretty), 'payment', result.id
    );
  end if;

  if p_to_profile is not null then
    insert into public.notifications (profile_id, kind, title, body, href)
    values (
      p_to_profile, 'payment', format('%s sent you %s', my_name, pretty),
      coalesce(result.memo, 'Tap to view the transaction.'),
      case when p_channel_id like 'dm:%' then '/messages/' || me else null end
    );
  end if;

  return result;
end;
$$;

revoke all on function public.record_payment(
  text, text, bigint, text, uuid, text, text, text, int, text
) from public;
grant execute on function public.record_payment(
  text, text, bigint, text, uuid, text, text, text, int, text
) to authenticated;

/**
 * Flip a receipt to verified. Service-role only.
 *
 * Deliberately not granted to `authenticated`: the whole value of the flag is
 * that the party who benefits from it cannot set it. The Edge Function in
 * `supabase/functions/verify-payment/` holds the service-role key, checks the
 * signature against the cluster, and calls this.
 */
create or replace function public.mark_payment_verified(p_signature text)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.payments;
begin
  update public.payments set verified = true
  where signature = p_signature
  returning * into result;

  if not found then
    raise exception 'No payment with that signature.' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke all on function public.mark_payment_verified(text) from public, authenticated, anon;

/* ===========================================================================
   4. Messages: keep `kind` honest
   ---------------------------------------------------------------------------
   The insert policy from 0003 checked the sender and the channel. It now also
   pins `kind` to 'text' and `payment_id` to null, so a payment receipt can
   only ever originate from `record_payment` above.
   =========================================================================== */

drop policy if exists "send message to own channels" on public.messages;
create policy "send message to own channels" on public.messages
  for insert with check (
    sender_id = (select auth.uid())
    and public.can_access_channel(channel_id, (select auth.uid()))
    and kind = 'text'
    and payment_id is null
  );

/* ===========================================================================
   5. The inbox
   ---------------------------------------------------------------------------
   Conversations were derived from the friend list, which is a different set
   from "people who have messaged me". A host contacted by a guest they have
   never met had the message delivered to a thread that appeared nowhere.
   =========================================================================== */

/**
 * Everyone the caller has an actual DM thread with, most recent first.
 *
 * `security_invoker` is unnecessary and would be wrong to fight: this reads
 * `messages` under the caller's own RLS, which already restricts them to their
 * own channels. The function exists to do the channel-key arithmetic in SQL
 * rather than shipping every row to the client to parse.
 */
create or replace function public.my_dm_partners()
returns table (profile_id uuid, last_message_at timestamptz)
language sql
stable
set search_path = public
as $$
  select
    (case
       when split_part(substring(channel_id from 4), '__', 1) = (select auth.uid())::text
         then split_part(substring(channel_id from 4), '__', 2)
       else split_part(substring(channel_id from 4), '__', 1)
     end)::uuid as profile_id,
    max(created_at) as last_message_at
  from public.messages
  where channel_id like 'dm:%'
  group by 1
  order by 2 desc;
$$;

grant execute on function public.my_dm_partners() to authenticated;

/* ===========================================================================
   6. Realtime
   =========================================================================== */

do $$
begin
  begin
    execute 'alter table public.payments replica identity full';
    execute 'alter publication supabase_realtime add table public.payments';
  exception when duplicate_object then null;
  end;
end $$;
