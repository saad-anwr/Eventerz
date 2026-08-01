-- ---------------------------------------------------------------------------
-- Eventerz - 0017: stop clients writing columns they do not own
--
-- Run after 0016. Safe to re-run.
--
-- # The gap
--
-- Every business rule in this schema is enforced inside a SECURITY DEFINER
-- function: `rsvp()` checks capacity, `request_to_join_verified()` checks the
-- token gate, `link_wallet_verified()` checks an Ed25519 signature,
-- `recompute_reputation()` derives reputation from attendance. The functions are
-- careful and the reasoning behind them is written down.
--
-- None of that binds a client, because none of it is the only way in.
--
-- Supabase grants `ALL` on every table in `public` to `anon` and `authenticated`
-- at project setup. Until this migration, not one table-level or column-level
-- grant existed anywhere in these migrations - every `grant`/`revoke` was `on
-- function`. RLS was therefore the only control on direct writes, and RLS is
-- row-level: a policy can say *which rows* you may write, never *which columns*.
--
-- So policies like
--
--   create policy "users update their own profile" on public.profiles
--     for update using (auth.uid() = id) with check (auth.uid() = id);
--   create policy "rsvps self write" on public.rsvps
--     for all using (auth.uid() = profile_id) with check (...);
--
-- mean "you may rewrite any column of your own row", and PostgREST exposes that
-- as a plain HTTP request. The TypeScript `ProfileUpdate` type restricts the
-- editable fields, but a type is a client-side courtesy; `curl` does not import
-- it.
--
-- # What that allowed, concretely
--
-- All of these are a single authenticated PATCH/POST, no exploit required:
--
--   1. `profiles.wallet_address` - claim any wallet not already linked. This
--      voids 0011 entirely. 0011 exists because "any signed-in user could claim
--      any unclaimed wallet they could read off the explorer, along with its
--      reputation and ticket history", and it fixed that with a nonce, a
--      signature and an Edge Function - none of which are on this path.
--   2. `profiles.reputation` - set to any number. 0013 states "there is no grant
--      that lets `authenticated` write the column, so it cannot be inflated by
--      anyone - including the profile's owner." That grant was never written, so
--      the sentence describes an intention rather than the schema.
--   3. `rsvps.status = 'confirmed'` - self-approve into an event. Skips
--      `approve_guest`, the capacity check, the waitlist, and the token gate.
--      Free entry to a sold-out or gated event. The table's own comment says
--      "Writes go through the `rsvp()` function"; the policy is `for all`.
--   4. `events.featured = true` - put your own event on the home page.
--   5. `communities.verified = true` - award yourself the verified badge.
--
-- # The fix
--
-- Grant writes per column, and only where a client legitimately writes today.
-- 0009 already does this for `messages` (its insert policy pins `kind = 'text'`
-- and `payment_id is null`), which is the same idea expressed in a policy; this
-- applies it everywhere the column list is the thing that matters.
--
-- The column lists below are the union of what both apps actually write - the
-- web `createEvent`/profile editor and the dApp equivalents. Anything absent is
-- either server-derived or privilege-bearing.
-- ---------------------------------------------------------------------------

/* ===========================================================================
   profiles - the editable fields, and nothing else
   =========================================================================== */

revoke insert, update, delete on public.profiles from anon, authenticated;

/*
 * Exactly the columns the profile editor sends (`ProfileUpdate` in both apps).
 *
 * Absent, and each for its own reason:
 *   id             - identity, set by the signup trigger
 *   email          - not client-readable either (0015)
 *   wallet_address - only `link_wallet_verified()`, after a verified signature
 *   reputation     - derived by trigger from check-ins and hosted events
 *   created_at / updated_at - clock, not input
 */
grant update (
  name, handle, bio, location, website, twitter, interests, avatar_url
) on public.profiles to authenticated;

/*
 * No INSERT: `handle_new_user()` creates the row from the auth trigger, as
 * SECURITY DEFINER, so it is unaffected. The "users insert their own profile"
 * policy from 0001 is now unreachable for clients, which is correct - a second
 * way to create a profile was only ever a way to create one the trigger did not
 * shape.
 *
 * No DELETE: leaving is `delete_my_account()` (0015), which anonymises the row
 * rather than removing it, because events, tickets and payment receipts cascade
 * off it.
 */

/* ===========================================================================
   rsvps - no direct writes at all
   =========================================================================== */

/*
 * Every write goes through a definer function that enforces something:
 * `rsvp()` (capacity), `request_to_join()` / `request_to_join_verified()`
 * (approval and token gate), `approve_guest()` / `decline_guest()` (host
 * authority), `cancel_rsvp()`, `promote_from_waitlist()`.
 *
 * Neither app writes this table directly, so revoking costs nothing and closes
 * the self-confirm path. The `rsvps self write` policy stays in place and is
 * simply never reached without a grant behind it.
 */
revoke insert, update, delete on public.rsvps from anon, authenticated;

/* ===========================================================================
   events - create yours, edit through the function, never feature yourself
   =========================================================================== */

revoke insert, update, delete on public.events from anon, authenticated;

/*
 * INSERT only, and only the columns the two create forms send. `featured` is
 * the one that matters: it drives home-page placement, so a self-set boolean is
 * free promotion. `onchain_signature` is written by `record_ticket_mint`, and
 * `cancelled_at` by `cancel_event`.
 *
 * The `with check (auth.uid() = host_id)` half of the "events host writes"
 * policy still applies, so this cannot be used to create an event owned by
 * somebody else.
 */
grant insert (
  title, description, host_id, community_id, category,
  starts_at, ends_at, location, is_online, capacity, price, visibility,
  requires_approval, token_gated, gate_requirement,
  gate_mint, gate_min_amount, gate_decimals, gate_symbol,
  tags, schedule, cover_gradient, cover_image,
  latitude, longitude, place_id, address
) on public.events to authenticated;

/*
 * No UPDATE grant. Editing goes through `update_event()`, which is already
 * written, already granted to `authenticated`, and already re-checks host
 * ownership - so this removes a second path rather than a capability.
 */

/* ===========================================================================
   communities, tickets, payments - server-side only
   =========================================================================== */

/*
 * Neither app writes any of these directly.
 *
 *   communities - `verified` and `token_gated` are the badge and the gate;
 *                 self-setting either is the whole problem.
 *   tickets     - holds `qr_secret`, which is the check-in credential, and
 *                 `serial`. Issued by `approve_guest` / `rsvp`, checked in by
 *                 `check_in_ticket`.
 *   payments    - written by `record_payment` and marked verified only by
 *                 `mark_payment_verified`, which the verify-payment Edge
 *                 Function calls after reading the transaction from the cluster.
 *                 A client-writable `verified` column would make that check
 *                 decorative.
 */
revoke insert, update, delete on public.communities from anon, authenticated;
revoke insert, update, delete on public.tickets     from anon, authenticated;
revoke insert, update, delete on public.payments    from anon, authenticated;

/* ===========================================================================
   notifications - mark as read, nothing more
   =========================================================================== */

revoke insert, update, delete on public.notifications from anon, authenticated;

/*
 * `read` is the only column a client sets, and DELETE stays so a notification
 * can be dismissed. Without the column list, "mark as read" also permitted
 * rewriting `title`, `body` and `href` - self-inflicted, but a notification
 * whose text can be edited after the fact is not a record of anything.
 */
grant update (read) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

/* ===========================================================================
   Left alone, deliberately
   ===========================================================================

   community_members and friend_requests keep their full grants. Both are
   self-scoped join tables whose RLS policies already pin every row to
   `auth.uid()`, and both have columns a client legitimately sets end to end
   (joining, leaving, accepting). There is no privilege-bearing column in
   either, so a column list would add ceremony and no protection.

   messages keeps its grants because 0009 already constrains the dangerous part
   in the policy itself: `kind = 'text'` and `payment_id is null`, so a forged
   payment receipt cannot be inserted into a thread.
*/
