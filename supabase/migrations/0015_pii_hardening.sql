-- ---------------------------------------------------------------------------
-- Eventerz - 0015: stop publishing email addresses, and let people leave
--
-- Run after 0014. Safe to re-run.
--
-- Two unrelated-looking changes that are really the same subject: what the
-- product knows about a person, and who else gets to see it.
-- ---------------------------------------------------------------------------

/* ===========================================================================
   1. `profiles.email` stops being world-readable
   ===========================================================================

   0001 made `profiles` readable by everyone:

     create policy "profiles are viewable by everyone"
       on public.profiles for select using (true);

   That is the right policy for the table. Attendee lists, host cards, Discover
   and the friend graph all need to read profiles belonging to other people, and
   every one of those surfaces is public.

   The mistake is that `email` lives in the same row. RLS is row-level - it has
   no opinion about columns - so "everyone may read this row" silently meant
   "everyone may read the email in it". The anon key is public by design, so the
   practical effect was:

     GET /rest/v1/profiles?select=email,wallet_address

   returning every address we hold, to anybody, without signing in.

   Two harms, and the second is the serious one:

     1. A harvestable mailing list of every user.
     2. An email -> wallet mapping for the entire user base. Wallet addresses
        are public and permanent, and so is every transaction they have ever
        made; the email is what turns that from a pseudonym into a person. This
        product's whole premise is that a wallet is an identity you carry, so
        publishing the join between the two is precisely the wrong leak.

   0012 already states the principle, for the newsletter table: "a list of email
   addresses belonging to people who did not agree to be published". The same
   sentence applies here.

   The fix is a column privilege, because that is the level the problem is at.
   RLS cannot express it; `revoke` can, and PostgREST honours it - the column
   becomes invisible to `anon` and `authenticated` no matter what a client asks
   for. That matters more than fixing the queries: a client-side allow-list is
   only as good as the next person who writes `select('*')`.
*/

revoke select (email) on public.profiles from anon, authenticated;

/*
 * Deliberately NOT revoked from `service_role`.
 *
 * The Edge Functions need it for the things an email is actually for - a
 * ticket receipt, a "your event was cancelled" notice - and service_role is
 * server-side only (see docs/SECURITY.md). It also keeps the column readable
 * from the SQL editor, which is where support questions get answered.
 *
 * `handle_new_user()` still writes the column on signup. It is SECURITY
 * DEFINER, so it runs as its owner and column grants on `authenticated` do not
 * apply to it.
 */

/*
 * The owner reading their own address is not a special case that needs a
 * policy: it is already in the session. `auth.users.email` is what the address
 * was mirrored *from*, and `supabase.auth.getUser()` returns it to the person
 * it belongs to and to nobody else. The client now reads it from there.
 *
 * Which raises the fair question of why the column exists at all. It is the
 * lookup that lets a returning Google user resolve to their existing wallet
 * account (0001), and that lookup runs inside SECURITY DEFINER functions, not
 * from a client. So: keep the column, keep the index, publish neither.
 */

comment on column public.profiles.email is
  'Mirrored from the OAuth identity so a returning Google user resolves to their '
  'existing wallet account. NOT readable by anon or authenticated - see 0015. '
  'The owner reads their own address from the session (auth.users.email); '
  'anything server-side uses service_role.';

/* ===========================================================================
   2. Account deletion
   ===========================================================================

   There was no way for a person to leave. That is a straightforward gap - and
   for anyone in the UK or EU it is also a legal one, since erasure is a right
   rather than a feature request.

   What makes this non-trivial is that deleting the `profiles` row is not an
   option. Three foreign keys cascade from it, and each one would destroy
   somebody else's records:

     - `events.host_id` -> cascade. Takes the event, and with it every RSVP and
       every ticket. A guest holding a cNFT would find the event it refers to
       simply gone.
     - `tickets.owner_id` -> cascade. Correct for the departing user's own
       tickets, which is why those are allowed to go.
     - `payments.from_profile` -> cascade. Takes the receipt for money that
       actually moved - including the *recipient's* copy of it. `to_profile` is
       `set null`, so the asymmetry is almost certainly an oversight, but the
       effect is real: deleting a sender erases the payee's evidence.

   So the profile row survives as an anonymised tombstone, and the rule is:
   erase the person, keep the artifacts, sever the link between them.

   Which leaves the part that actually ends the account. `profiles.id`
   references `auth.users` `on delete cascade`, so removing the auth user would
   drag the tombstone out from under all of the above. That FK is dropped
   below - it is the single thing standing between "anonymised" and "deleted".
*/

/*
 * `discoverable_people` has to be rebuilt, and would break if it were not.
 *
 * 0003 defines it as `select p.*, ...`. A view expands `*` once, at creation
 * time, and freezes the result - so the view has an `email` column baked into
 * its definition regardless of what `profiles` looks like later.
 *
 * It is `security_invoker = true` (correctly), which means column privileges are
 * checked against the caller. After the revoke above, every
 * `select * from discoverable_people` therefore fails outright with "permission
 * denied for column email" - the Discover page stops loading rather than
 * quietly leaking, which is the better failure but still a broken page.
 *
 * Naming the columns fixes both halves: the address is gone from the view, and
 * `*` is once again a set somebody chose.
 *
 * Dropped rather than replaced: `create or replace view` may append columns but
 * may not remove one, so replacing a definition that has `email` in the middle
 * fails with "cannot drop columns from view". Nothing else depends on it, so
 * the drop is uneventful - and `cascade` is deliberately not used, so that if
 * something ever does depend on it this errors instead of quietly taking it.
 */
drop view if exists public.discoverable_people;

create view public.discoverable_people
with (security_invoker = true) as
  select
    p.id,
    p.name,
    p.handle,
    p.avatar_url,
    p.bio,
    p.location,
    p.website,
    p.twitter,
    p.wallet_address,
    p.reputation,
    p.interests,
    p.created_at,
    p.updated_at,
    fr.status  as friend_status,
    fr.requester_id = auth.uid() as request_sent_by_me
  from public.profiles p
  left join public.friend_requests fr
    on (fr.requester_id = auth.uid() and fr.addressee_id = p.id)
    or (fr.addressee_id = auth.uid() and fr.requester_id = p.id)
  where p.id <> auth.uid();

/*
 * Decouple the tombstone from the auth user.
 *
 * The constraint enforced "a profile must have an auth user", which stops being
 * true the moment a deleted account has to leave a row behind. Dropping it lets
 * the Edge Function delete `auth.users` - the only thing that truly ends
 * sign-in - while the anonymised profile stays put holding other people's
 * events, tickets and receipts in place.
 *
 * `handle_new_user()` still creates the profile from the auth trigger, so
 * signup is unchanged; what is given up is the database's guarantee that every
 * profile has a live auth user, which is precisely the guarantee a tombstone
 * exists to violate.
 */
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'You must be signed in to delete your account.'
      using errcode = '42501';
  end if;

  /*
   * Private content, deleted outright. None of it is evidence to anyone else,
   * and all of it is plainly personal.
   */
  delete from public.notifications    where profile_id = me;
  delete from public.event_reminders  where profile_id = me;
  delete from public.friend_requests  where requester_id = me or addressee_id = me;
  delete from public.community_members where profile_id = me;
  delete from public.wallet_link_nonces where profile_id = me;

  /*
   * Messages. The body is the personal part; the row is half of somebody
   * else's conversation. Blanking the body leaves the thread legible as
   * "this person left" rather than silently rewriting history so the other
   * party appears to have talked to themselves.
   */
  update public.messages
     set body = '[deleted]'
   where sender_id = me
     and kind = 'text';

  /*
   * RSVPs to events that have not happened yet are withdrawn - the host should
   * not keep counting a departed account against capacity. Past RSVPs stay, as
   * anonymised attendance history the host is entitled to.
   */
  delete from public.rsvps r
   using public.events e
   where r.profile_id = me
     and r.event_id = e.id
     and e.starts_at > now();

  /*
   * Hosted events keep running. Ownership moves to nothing rather than to
   * somebody who did not consent to inherit it; `host_id` is not nullable, so
   * the profile row has to survive as a tombstone. That is what section 3 is.
   */

  /*
   * Anonymise the profile in place. Every identifying column is cleared, the
   * wallet link is severed, and the handle is randomised so it cannot be used
   * to re-identify anyone or squatted by someone else.
   */
  update public.profiles
     set name           = 'Deleted account',
         handle         = 'deleted' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
         email          = null,
         wallet_address = null,
         avatar_url     = null,
         bio            = null,
         location       = null,
         website        = null,
         twitter        = null,
         interests      = '{}',
         reputation     = 0
   where id = me;

  /*
   * The `auth.users` row is what actually ends the ability to sign in, and it
   * is deliberately not touched here: removing it needs the Admin API, which a
   * plpgsql function has no business calling. The `delete-account` Edge
   * Function runs this and then deletes the auth user with the service-role
   * key - see supabase/functions/delete-account/.
   *
   * Ordering matters. This function is safe to run on its own (the account is
   * anonymised, just still signable-into); the reverse is not, because a
   * deleted auth user can no longer call an `auth.uid()`-scoped function.
   */
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Erase the calling user: private rows deleted, message bodies blanked, future '
  'RSVPs withdrawn, profile anonymised in place. Hosted events and payment '
  'receipts survive - they are other people''s records. Does not remove the '
  'auth.users row; the delete-account Edge Function does that afterwards.';
