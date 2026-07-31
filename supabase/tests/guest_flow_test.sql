-- ---------------------------------------------------------------------------
-- Eventerz - guest-flow integration tests
--
--   supabase db reset                            # apply every migration
--   psql "$DATABASE_URL" -f supabase/tests/guest_flow_test.sql
--
-- Or, against a local stack in one line:
--   supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/guest_flow_test.sql
--
-- Why this suite is SQL rather than TypeScript
-- -------------------------------------------
-- Everything worth testing about the guest flow lives in Postgres, not in the
-- clients. The five RSVP states, capacity at its boundary, waitlist promotion,
-- approval gating, and the RLS that decides who may read a roster are all
-- enforced by `SECURITY DEFINER` functions and policies. A TypeScript test can
-- only check that the client *called* them, which is the part that has never
-- been wrong.
--
-- It also has to run as several different users, because half the assertions are
-- about what one user *cannot* see or do. `set local role` plus a forged
-- `request.jwt.claims` is how `auth.uid()` is impersonated - the same mechanism
-- PostgREST uses, so the policies see exactly what they see in production.
--
-- Everything runs inside one transaction and rolls back, so a run leaves the
-- database exactly as it found it.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
\timing off

begin;

/* ===========================================================================
   Harness
   =========================================================================== */

create schema if not exists eventerz_test;

/** Become a given user, as PostgREST would. */
create or replace function eventerz_test.act_as(p_profile_id uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_profile_id::text, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end $$;

/** Drop back to the owner, so fixtures can be written without RLS in the way. */
create or replace function eventerz_test.act_as_owner()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end $$;

create or replace function eventerz_test.ok(p_condition boolean, p_what text)
returns void language plpgsql as $$
begin
  if p_condition then
    raise notice '  ok   - %', p_what;
  else
    raise exception 'FAILED - %', p_what;
  end if;
end $$;

create or replace function eventerz_test.eq(
  p_actual anyelement, p_expected anyelement, p_what text
) returns void language plpgsql as $$
begin
  if p_actual is not distinct from p_expected then
    raise notice '  ok   - % (%)', p_what, p_actual;
  else
    raise exception 'FAILED - %: expected %, got %', p_what, p_expected, p_actual;
  end if;
end $$;

/** Assert that a statement raises. Anything that succeeds is the failure. */
create or replace function eventerz_test.raises(p_sql text, p_what text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAILED - % : expected an error, none raised', p_what;
exception
  when others then
    if sqlerrm like 'FAILED%' then raise; end if;
    raise notice '  ok   - % (%)', p_what, left(sqlerrm, 60);
end $$;

/**
 * Create an auth user and let the 0001 trigger provision the profile.
 *
 * Going through `auth.users` rather than inserting a profile directly is
 * deliberate: it exercises `handle_new_user`, including the handle
 * de-duplication loop, which is the only place that logic runs.
 */
create or replace function eventerz_test.make_user(p_name text)
returns uuid language plpgsql as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (
    new_id,
    replace(lower(p_name), ' ', '.') || '@example.test',
    jsonb_build_object('full_name', p_name)
  );
  return new_id;
end $$;

/** Give a profile a wallet without going through the signature flow. */
create or replace function eventerz_test.give_wallet(p_profile_id uuid, p_address text)
returns void language sql as $$
  update public.profiles set wallet_address = p_address where id = p_profile_id;
$$;

/* ===========================================================================
   Fixtures
   =========================================================================== */

do $$
declare
  host_id  uuid;
  a_id     uuid;
  b_id     uuid;
  c_id     uuid;
  open_ev  uuid;
  appr_ev  uuid;
  tiny_ev  uuid;
begin
  raise notice '';
  raise notice '=== fixtures ===';

  host_id := eventerz_test.make_user('Test Host');
  a_id    := eventerz_test.make_user('Guest A');
  b_id    := eventerz_test.make_user('Guest B');
  c_id    := eventerz_test.make_user('Guest C');

  perform eventerz_test.give_wallet(host_id, 'HostWa11etAddressPaddedTo32Chars0001');
  perform eventerz_test.give_wallet(a_id,    'GuestAWa11etAddressPaddedTo32Chars01');
  perform eventerz_test.give_wallet(b_id,    'GuestBWa11etAddressPaddedTo32Chars01');

  insert into public.events
    (id, title, host_id, starts_at, ends_at, capacity, requires_approval, location)
  values
    (gen_random_uuid(), 'Open Meetup', host_id,
     now() + interval '7 days', now() + interval '7 days 3 hours', 2, false, 'Delhi'),
    (gen_random_uuid(), 'Vetted Summit', host_id,
     now() + interval '9 days', null, 1, true, 'Delhi'),
    (gen_random_uuid(), 'Tiny Workshop', host_id,
     now() + interval '11 days', null, 1, false, 'Delhi');

  select id into open_ev from public.events where title = 'Open Meetup';
  select id into appr_ev from public.events where title = 'Vetted Summit';
  select id into tiny_ev from public.events where title = 'Tiny Workshop';

  -- Stash the ids so the later blocks can find them without re-querying by
  -- title, which would break the moment two tests wanted the same name.
  perform set_config('eventerz_test.host', host_id::text, true);
  perform set_config('eventerz_test.a', a_id::text, true);
  perform set_config('eventerz_test.b', b_id::text, true);
  perform set_config('eventerz_test.c', c_id::text, true);
  perform set_config('eventerz_test.open', open_ev::text, true);
  perform set_config('eventerz_test.appr', appr_ev::text, true);
  perform set_config('eventerz_test.tiny', tiny_ev::text, true);

  perform eventerz_test.ok(true, 'four users and three events created');
end $$;

/* ===========================================================================
   1. Requesting to join
   =========================================================================== */

do $$
declare
  a_id    uuid := current_setting('eventerz_test.a')::uuid;
  c_id    uuid := current_setting('eventerz_test.c')::uuid;
  host_id uuid := current_setting('eventerz_test.host')::uuid;
  open_ev uuid := current_setting('eventerz_test.open')::uuid;
  appr_ev uuid := current_setting('eventerz_test.appr')::uuid;
  result  public.rsvps;
begin
  raise notice '';
  raise notice '=== 1. request_to_join ===';

  perform eventerz_test.act_as(a_id);

  select * into result from public.request_to_join(open_ev);
  perform eventerz_test.eq(result.status::text, 'confirmed',
    'an open event confirms immediately');

  perform eventerz_test.eq(
    (select count(*)::int from public.tickets where event_id = open_ev and owner_id = a_id),
    1, 'a ticket is issued with the seat');

  -- Idempotence: a double-tap must not produce a second row or a second ticket.
  select * into result from public.request_to_join(open_ev);
  perform eventerz_test.eq(result.status::text, 'confirmed',
    'a second request returns the same status');
  perform eventerz_test.eq(
    (select count(*)::int from public.tickets where event_id = open_ev),
    1, 'a double-tap issues no second ticket');

  -- Approval-gated events hold the request.
  select * into result from public.request_to_join(appr_ev);
  perform eventerz_test.eq(result.status::text, 'pending',
    'an approval-gated event queues a pending request');

  perform eventerz_test.eq(
    (select count(*)::int from public.tickets where event_id = appr_ev),
    0, 'no ticket is spent on an unapproved request');

  -- Pending holds no seat, so capacity is untouched. This is what stops anyone
  -- filling an event by requesting and never being approved.
  perform eventerz_test.eq(
    (select confirmed_count from public.events where id = appr_ev),
    0, 'a pending request holds no seat');
  perform eventerz_test.eq(
    (select pending_count from public.events where id = appr_ev),
    1, 'the pending counter moves instead');

  -- The host is told.
  perform eventerz_test.act_as_owner();
  perform eventerz_test.ok(
    exists (
      select 1 from public.notifications
      where profile_id = host_id and title = 'New request to join'
    ),
    'the host is notified of a request needing a decision');

  -- A wallet is not required to ask to attend. Guest C has none.
  perform eventerz_test.act_as(c_id);
  select * into result from public.request_to_join(open_ev);
  perform eventerz_test.eq(result.status::text, 'confirmed',
    'a wallet-less account can still RSVP');
  perform eventerz_test.ok(result.wallet_address is null,
    'the RSVP records no wallet when there is none');

  -- The host cannot attend their own event.
  perform eventerz_test.act_as(host_id);
  perform eventerz_test.raises(
    format('select public.request_to_join(%L)', open_ev),
    'the host cannot RSVP to their own event');
end $$;

/* ===========================================================================
   2. Capacity and the waitlist
   =========================================================================== */

do $$
declare
  b_id    uuid := current_setting('eventerz_test.b')::uuid;
  open_ev uuid := current_setting('eventerz_test.open')::uuid;
  result  public.rsvps;
begin
  raise notice '';
  raise notice '=== 2. capacity -> waitlist ===';

  -- Capacity is 2 and A + C are already in.
  perform eventerz_test.act_as_owner();
  perform eventerz_test.eq(
    (select confirmed_count from public.events where id = open_ev),
    2, 'the event is at capacity');

  perform eventerz_test.act_as(b_id);
  select * into result from public.request_to_join(open_ev);

  -- 0005 fixed this: the old version inserted the row and *then* raised, which
  -- rolled back the very insert it had just made.
  perform eventerz_test.eq(result.status::text, 'waitlist',
    'a full event returns a waitlist row rather than raising');

  perform eventerz_test.act_as_owner();
  perform eventerz_test.eq(
    (select count(*)::int from public.rsvps
     where event_id = open_ev and profile_id = b_id and status = 'waitlist'),
    1, 'the waitlist row survives the call');

  perform eventerz_test.eq(
    (select waitlist_count from public.events where id = open_ev),
    1, 'the waitlist counter moves');

  -- The guest can see their own place in the queue, and only their own.
  perform eventerz_test.act_as(b_id);
  perform eventerz_test.eq(public.my_waitlist_position(open_ev), 1,
    'a waitlisted guest sees their own position');
end $$;

/* ===========================================================================
   3. Waitlist promotion on a freed seat
   =========================================================================== */

do $$
declare
  a_id    uuid := current_setting('eventerz_test.a')::uuid;
  b_id    uuid := current_setting('eventerz_test.b')::uuid;
  open_ev uuid := current_setting('eventerz_test.open')::uuid;
begin
  raise notice '';
  raise notice '=== 3. promotion ===';

  perform eventerz_test.act_as(a_id);
  perform public.cancel_rsvp(open_ev);

  perform eventerz_test.act_as_owner();
  perform eventerz_test.eq(
    (select status::text from public.rsvps
     where event_id = open_ev and profile_id = b_id),
    'confirmed', 'the longest-waiting guest is promoted into the freed seat');

  perform eventerz_test.eq(
    (select count(*)::int from public.tickets
     where event_id = open_ev and owner_id = b_id),
    1, 'the promoted guest gets a ticket');

  perform eventerz_test.eq(
    (select count(*)::int from public.tickets
     where event_id = open_ev and owner_id = a_id),
    0, 'the cancelling guest loses theirs');

  perform eventerz_test.eq(
    (select confirmed_count from public.events where id = open_ev),
    2, 'the headcount is unchanged by the swap');

  perform eventerz_test.ok(
    exists (
      select 1 from public.notifications
      where profile_id = b_id and title = 'A spot opened up'
    ),
    'the promoted guest is told');
end $$;

/* ===========================================================================
   4. Approval-gated promotion goes to the host, not the guest
   =========================================================================== */

do $$
declare
  host_id uuid := current_setting('eventerz_test.host')::uuid;
  a_id    uuid := current_setting('eventerz_test.a')::uuid;
  b_id    uuid := current_setting('eventerz_test.b')::uuid;
  appr_ev uuid := current_setting('eventerz_test.appr')::uuid;
begin
  raise notice '';
  raise notice '=== 4. approval-gated promotion ===';

  -- A is pending on the gated event (capacity 1). Approve them, then add B,
  -- who lands on the waitlist because the single seat is taken.
  perform eventerz_test.act_as(host_id);
  perform public.approve_guest(appr_ev, a_id);

  perform eventerz_test.act_as(b_id);
  perform eventerz_test.eq(
    (select status::text from public.request_to_join(appr_ev)),
    'waitlist', 'a gated event at capacity still waitlists');

  -- Free the seat. On a gated event the freed seat must become an approvable
  -- request, not a silent admission - the host asked to vet every guest.
  perform eventerz_test.act_as(a_id);
  perform public.cancel_rsvp(appr_ev);

  perform eventerz_test.act_as_owner();
  perform eventerz_test.eq(
    (select status::text from public.rsvps
     where event_id = appr_ev and profile_id = b_id),
    'pending', 'promotion on a gated event yields pending, not confirmed');

  perform eventerz_test.eq(
    (select count(*)::int from public.tickets where event_id = appr_ev),
    0, 'no ticket is issued without the host''s decision');

  perform eventerz_test.ok(
    exists (
      select 1 from public.notifications
      where profile_id = host_id
        and title = 'A waitlisted guest needs a decision'
    ),
    'the host is asked to decide');
end $$;

/* ===========================================================================
   5. Host decisions, and who may make them
   =========================================================================== */

do $$
declare
  host_id uuid := current_setting('eventerz_test.host')::uuid;
  a_id    uuid := current_setting('eventerz_test.a')::uuid;
  b_id    uuid := current_setting('eventerz_test.b')::uuid;
  appr_ev uuid := current_setting('eventerz_test.appr')::uuid;
begin
  raise notice '';
  raise notice '=== 5. host decisions ===';

  -- A guest cannot approve themselves.
  perform eventerz_test.act_as(b_id);
  perform eventerz_test.raises(
    format('select public.approve_guest(%L, %L)', appr_ev, b_id),
    'a guest cannot approve themselves');
  perform eventerz_test.raises(
    format('select public.decline_guest(%L, %L)', appr_ev, a_id),
    'a guest cannot decline anyone');

  -- The host can.
  perform eventerz_test.act_as(host_id);
  perform eventerz_test.eq(
    (select status::text from public.approve_guest(appr_ev, b_id)),
    'confirmed', 'the host can approve a pending guest');

  perform eventerz_test.act_as_owner();
  perform eventerz_test.eq(
    (select count(*)::int from public.tickets
     where event_id = appr_ev and owner_id = b_id),
    1, 'approval is when the ticket is issued');

  perform eventerz_test.ok(
    exists (
      select 1 from public.notifications
      where profile_id = b_id and title = 'Request approved'
    ),
    'the guest is told they are in');

  -- Removing a confirmed guest reads differently from declining a request.
  perform eventerz_test.act_as(host_id);
  perform public.decline_guest(appr_ev, b_id);

  perform eventerz_test.act_as_owner();
  perform eventerz_test.eq(
    (select status::text from public.rsvps
     where event_id = appr_ev and profile_id = b_id),
    'declined', 'a removed guest is marked declined, not cancelled');
  perform eventerz_test.eq(
    (select count(*)::int from public.tickets
     where event_id = appr_ev and owner_id = b_id),
    0, 'the ticket goes with the seat');
  perform eventerz_test.ok(
    exists (
      select 1 from public.notifications
      where profile_id = b_id and title = 'Removed from an event'
    ),
    'removal reads as removal, not as a declined request');
end $$;

/* ===========================================================================
   6. No client may write to `rsvps` directly
   =========================================================================== */

do $$
declare
  a_id    uuid := current_setting('eventerz_test.a')::uuid;
  tiny_ev uuid := current_setting('eventerz_test.tiny')::uuid;
begin
  raise notice '';
  raise notice '=== 6. rsvps is function-only ===';

  perform eventerz_test.act_as(a_id);

  -- The whole point of dropping the self-write policy in 0005: with no INSERT
  -- or UPDATE policy present, a direct write is refused outright. A cancel-only
  -- UPDATE policy would have the same hole, because RLS restricts which *rows*
  -- you may touch and never which *values* you may set.
  perform eventerz_test.raises(
    format(
      'insert into public.rsvps (event_id, profile_id, status) values (%L, %L, ''confirmed'')',
      tiny_ev, a_id),
    'a client cannot insert its own RSVP');

  perform public.request_to_join(tiny_ev);

  perform eventerz_test.raises(
    format(
      'update public.rsvps set status = ''confirmed'' where event_id = %L and profile_id = %L',
      tiny_ev, a_id),
    'a client cannot update its own RSVP status');
end $$;

/* ===========================================================================
   7. Guest-list visibility
   =========================================================================== */

do $$
declare
  host_id uuid := current_setting('eventerz_test.host')::uuid;
  a_id    uuid := current_setting('eventerz_test.a')::uuid;
  b_id    uuid := current_setting('eventerz_test.b')::uuid;
  c_id    uuid := current_setting('eventerz_test.c')::uuid;
  open_ev uuid := current_setting('eventerz_test.open')::uuid;
begin
  raise notice '';
  raise notice '=== 7. roster visibility ===';

  -- The host sees everything, including who they declined.
  perform eventerz_test.act_as(host_id);
  perform eventerz_test.ok(
    (select count(*) from public.rsvps where event_id = open_ev) >= 3,
    'the host sees every RSVP');

  -- A confirmed guest sees the other confirmed guests, and nothing else. A
  -- declined request is between that person and the host; letting peers
  -- enumerate rejections would publish the host''s moderation.
  perform eventerz_test.act_as(c_id);
  perform eventerz_test.eq(
    (select count(*)::int from public.rsvps
     where event_id = open_ev and status <> 'confirmed' and profile_id <> c_id),
    0, 'a confirmed guest sees no non-confirmed rows');

  -- A stranger sees their own row only - but the counts are still public.
  perform eventerz_test.act_as(a_id);  -- A cancelled earlier, so is not a guest.
  perform eventerz_test.eq(
    (select count(*)::int from public.rsvps
     where event_id = open_ev and profile_id <> a_id),
    0, 'a non-guest sees nobody else''s RSVP');
  perform eventerz_test.eq(
    (select confirmed_count from public.events where id = open_ev),
    2, 'the counts stay visible to everyone');

  -- The bounded preview samples rows the caller cannot select, and cannot be
  -- widened into a full roster dump.
  perform eventerz_test.ok(
    jsonb_array_length(public.event_guest_preview(open_ev, 3)) <= 3,
    'the preview honours its limit');
  perform eventerz_test.ok(
    jsonb_array_length(public.event_guest_preview(open_ev, 9999)) <= 12,
    'an oversized limit is clamped server-side');
end $$;

/* ===========================================================================
   8. Editing and cancelling  (0007)
   =========================================================================== */

do $$
declare
  host_id uuid := current_setting('eventerz_test.host')::uuid;
  b_id    uuid := current_setting('eventerz_test.b')::uuid;
  open_ev uuid := current_setting('eventerz_test.open')::uuid;
  updated public.events;
begin
  raise notice '';
  raise notice '=== 8. edit and cancel ===';

  -- A guest cannot edit.
  perform eventerz_test.act_as(b_id);
  perform eventerz_test.raises(
    format('select public.update_event(%L, p_title => ''Hijacked'')', open_ev),
    'a guest cannot edit the event');

  perform eventerz_test.act_as(host_id);

  -- Omitted fields are left alone. That is what makes two devices editing the
  -- same event safe.
  select * into updated from public.update_event(open_ev, p_title => 'Open Meetup v2');
  perform eventerz_test.eq(updated.title, 'Open Meetup v2', 'the title changes');
  perform eventerz_test.eq(updated.location, 'Delhi', 'an omitted field is untouched');
  perform eventerz_test.eq(updated.capacity, 2, 'capacity is untouched');

  -- Capacity may not drop below the headcount.
  perform eventerz_test.raises(
    format('select public.update_event(%L, p_capacity => 1)', open_ev),
    'capacity cannot go below the confirmed headcount');

  -- Moving the event notifies every live guest.
  perform public.update_event(open_ev, p_location => 'Okhla Phase I, New Delhi');
  perform eventerz_test.act_as_owner();
  perform eventerz_test.ok(
    exists (
      select 1 from public.notifications
      where profile_id = b_id and title = 'Event location changed'
    ),
    'a move notifies live guests');

  -- Cancelling closes every live RSVP and tells everyone.
  perform eventerz_test.act_as(host_id);
  select * into updated from public.cancel_event(open_ev, 'Venue fell through.');
  perform eventerz_test.ok(updated.cancelled_at is not null, 'the event is cancelled');

  perform eventerz_test.act_as_owner();
  perform eventerz_test.eq(
    (select count(*)::int from public.rsvps
     where event_id = open_ev and status in ('confirmed','pending','waitlist')),
    0, 'every live RSVP is closed');
  perform eventerz_test.ok(
    exists (
      select 1 from public.notifications
      where profile_id = b_id and title = 'Event cancelled'
    ),
    'guests are told, with the reason');
  perform eventerz_test.ok(
    exists (select 1 from public.events where id = open_ev),
    'the event row survives so ticket holders keep the record');

  -- A cancelled event takes no more guests and cannot be edited.
  perform eventerz_test.act_as(b_id);
  perform eventerz_test.raises(
    format('select public.request_to_join(%L)', open_ev),
    'a cancelled event refuses new guests');

  perform eventerz_test.act_as(host_id);
  perform eventerz_test.raises(
    format('select public.update_event(%L, p_title => ''Nope'')', open_ev),
    'a cancelled event cannot be edited');

  -- Cancelling twice is not an error.
  perform public.cancel_event(open_ev);
  perform eventerz_test.ok(true, 'cancelling twice is idempotent');
end $$;

/* ===========================================================================
   9. Payments  (0009)
   =========================================================================== */

do $$
declare
  a_id    uuid := current_setting('eventerz_test.a')::uuid;
  b_id    uuid := current_setting('eventerz_test.b')::uuid;
  c_id    uuid := current_setting('eventerz_test.c')::uuid;
  channel text;
  result  public.payments;
begin
  raise notice '';
  raise notice '=== 9. payments ===';

  channel := public.dm_channel_id(a_id, b_id);

  perform eventerz_test.act_as(a_id);

  select * into result from public.record_payment(
    p_signature  => 'SigAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    p_to_wallet  => 'GuestBWa11etAddressPaddedTo32Chars01',
    p_amount     => 400000000,
    p_channel_id => channel,
    p_to_profile => b_id,
    p_memo       => 'Ticket split'
  );

  perform eventerz_test.eq(result.amount, 400000000::bigint, 'the amount is recorded exactly');
  perform eventerz_test.ok(not result.verified,
    'a fresh receipt is unverified until something checks the cluster');

  -- The receipt posts itself into the thread, and only the function may do so.
  perform eventerz_test.eq(
    (select count(*)::int from public.messages
     where channel_id = channel and kind = 'payment'),
    1, 'a receipt message is posted into the thread');

  perform eventerz_test.raises(
    format(
      'insert into public.messages (scope, channel_id, sender_id, body, kind) '
      'values (''dm'', %L, %L, ''Sent 999 SOL'', ''payment'')', channel, a_id),
    'a client cannot forge a payment message');

  -- Idempotent on the signature: the retry case, because the transfer confirms
  -- and the app is backgrounded before the insert lands.
  select * into result from public.record_payment(
    p_signature  => 'SigAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    p_to_wallet  => 'GuestBWa11etAddressPaddedTo32Chars01',
    p_amount     => 400000000,
    p_channel_id => channel,
    p_to_profile => b_id
  );
  perform eventerz_test.eq(
    (select count(*)::int from public.payments
     where signature = 'SigAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
    1, 'the same signature records once');

  -- The named recipient must actually hold the wallet that was paid, or anyone
  -- could take a real signature off the explorer and record it as "I paid you".
  perform eventerz_test.raises(
    format(
      'select public.record_payment(%L, %L, 1000, null, %L)',
      'SigBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'GuestBWa11etAddressPaddedTo32Chars01', c_id),
    'a payment cannot be attributed to the wrong profile');

  -- `verified` is not the caller's to set.
  perform eventerz_test.raises(
    'select public.mark_payment_verified(''SigAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'')',
    'a client cannot mark its own payment verified');

  -- Only the two parties may read it.
  perform eventerz_test.act_as(c_id);
  perform eventerz_test.eq(
    (select count(*)::int from public.payments), 0,
    'a third party sees no payments');

  perform eventerz_test.act_as(b_id);
  perform eventerz_test.eq(
    (select count(*)::int from public.payments), 1,
    'the recipient sees the receipt');
end $$;

/* ===========================================================================
   10. Wallet linking  (0011)
   =========================================================================== */

do $$
declare
  c_id      uuid := current_setting('eventerz_test.c')::uuid;
  a_id      uuid := current_setting('eventerz_test.a')::uuid;
  challenge text;
begin
  raise notice '';
  raise notice '=== 10. wallet verification ===';

  perform eventerz_test.act_as(c_id);

  -- The unverified path is closed.
  perform eventerz_test.raises(
    'select public.link_wallet(''GuestCWa11etAddressPaddedTo32Chars01'')',
    'the old unverified link_wallet is refused');

  challenge := public.issue_wallet_link_nonce('GuestCWa11etAddressPaddedTo32Chars01');
  perform eventerz_test.ok(challenge like '%Nonce: %',
    'the challenge carries a nonce');
  perform eventerz_test.ok(
    challenge like '%GuestCWa11etAddressPaddedTo32Chars01%',
    'the challenge names the wallet being linked');
  perform eventerz_test.ok(
    challenge like '%cannot move any funds%',
    'the challenge says in words what signing it does');

  -- A wallet already claimed by someone else is refused before the user is ever
  -- asked to sign.
  perform eventerz_test.raises(
    'select public.issue_wallet_link_nonce(''GuestAWa11etAddressPaddedTo32Chars01'')',
    'a wallet claimed by another account is refused up front');

  -- Only the Edge Function can complete the link.
  perform eventerz_test.raises(
    format(
      'select public.link_wallet_verified(%L, ''GuestCWa11etAddressPaddedTo32Chars01'', gen_random_uuid())',
      c_id),
    'a client cannot call link_wallet_verified');

  -- The challenge table is invisible to clients, so one user cannot enumerate
  -- another's outstanding challenges.
  perform eventerz_test.eq(
    (select count(*)::int from public.wallet_link_nonces), 0,
    'the nonce table is invisible to clients');

  -- Unlinking is the caller's own, and available.
  perform eventerz_test.act_as(a_id);
  perform public.unlink_wallet();
  perform eventerz_test.act_as_owner();
  perform eventerz_test.ok(
    (select wallet_address is null from public.profiles where id = a_id),
    'a user can unlink their own wallet');
end $$;

/* ===========================================================================
   11. Reminders  (0010)
   =========================================================================== */

do $$
declare
  host_id uuid := current_setting('eventerz_test.host')::uuid;
  b_id    uuid := current_setting('eventerz_test.b')::uuid;
  soon_ev uuid;
  written int;
begin
  raise notice '';
  raise notice '=== 11. reminders ===';

  perform eventerz_test.act_as_owner();

  insert into public.events (title, host_id, starts_at, capacity, location, created_at)
  values ('Tomorrow Talk', host_id, now() + interval '24 hours', 10, 'Delhi',
          now() - interval '2 days')
  returning id into soon_ev;

  perform eventerz_test.act_as(b_id);
  perform public.request_to_join(soon_ev);

  perform eventerz_test.act_as_owner();

  -- Backdate the RSVP past the one-hour grace period. The job deliberately
  -- skips guests who joined minutes ago, so a freshly-created fixture would
  -- otherwise be correctly ignored and this test would be asserting the guard
  -- rather than the reminder.
  update public.rsvps set created_at = now() - interval '2 hours'
  where event_id = soon_ev and profile_id = b_id;

  written := public.send_event_reminders();
  perform eventerz_test.ok(written >= 1, 'a due reminder is sent');
  perform eventerz_test.ok(
    exists (
      select 1 from public.notifications
      where profile_id = b_id and kind = 'reminder'
    ),
    'the guest receives it');

  -- Idempotent: the claim row is what stops a second send, which is why the job
  -- can run every fifteen minutes without duplicating anything.
  perform eventerz_test.eq(public.send_event_reminders(), 0,
    'running the job again sends nothing');

  -- A cancelled event stops reminding.
  perform eventerz_test.act_as(host_id);
  perform public.cancel_event(soon_ev);
  perform eventerz_test.act_as_owner();
  delete from public.event_reminders where event_id = soon_ev;
  perform eventerz_test.eq(public.send_event_reminders(), 0,
    'a cancelled event sends no reminders');
end $$;

/* ===========================================================================
   Done
   =========================================================================== */

do $$
begin
  raise notice '';
  raise notice '=== all guest-flow assertions passed ===';
  raise notice '';
end $$;

-- Nothing is kept. A test run must leave the database as it found it.
rollback;
