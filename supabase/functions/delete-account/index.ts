/**
 * delete-account - erase the calling user, and end their ability to sign in.
 *
 *   POST /functions/v1/delete-account
 *   Authorization: Bearer <the user's Supabase JWT>
 *   (no body)
 *
 * Two steps, in this order and only this order:
 *
 *   1. `delete_my_account()` (migration 0015) clears the private rows, blanks
 *      the user's message bodies, withdraws their future RSVPs and anonymises
 *      the profile in place. It reads `auth.uid()`, so it has to run while the
 *      caller still exists.
 *   2. The `auth.users` row is deleted with the service-role key. This is the
 *      part that cannot be done from SQL, and the part that actually ends the
 *      account: until it happens the person can still sign in and find a blank
 *      profile waiting for them.
 *
 * Reversing the order strands the account halfway: the auth user is gone, so
 * nothing can call an `auth.uid()`-scoped function again, and the profile keeps
 * its name, avatar and email forever.
 *
 * # Why the profile row survives
 *
 * Deleting it would cascade into `events`, `tickets` and `payments` and destroy
 * other people's records - a guest's ticket, a payee's receipt. The tombstone is
 * what holds those in place. 0015 has the full reasoning.
 *
 * # Why this takes no body
 *
 * There is nothing to name. The subject is the bearer of the token, always. An
 * endpoint that accepted a profile id would be an endpoint for deleting other
 * people's accounts, one missing check away.
 */

import {
  json,
  logError,
  preflight,
  requireUser,
  serviceClient,
  userClient,
} from '../_shared/http.ts';

Deno.serve(async (request: Request) => {
  const options = preflight(request);
  if (options) return options;

  if (request.method !== 'POST') {
    return json(request, { error: 'Method not allowed.' }, 405);
  }

  const user = await requireUser(request);
  if (!user) {
    return json(request, { error: 'Sign in first.' }, 401);
  }

  const admin = serviceClient();

  /*
   * Step 1, as the user.
   *
   * `delete_my_account` is scoped by `auth.uid()`, so it runs on a client
   * carrying the caller's own JWT - the service-role client has no `auth.uid()`
   * and the function would refuse it. That scoping is also the authorisation
   * check: the database decides whose account this is, so there is no id for a
   * caller to tamper with.
   */
  const { error: scrubError } = await userClient(request).rpc('delete_my_account');
  if (scrubError) {
    logError('[delete-account] scrub failed', scrubError);
    return json(
      request,
      { error: 'Could not delete your account. Nothing was changed.' },
      500,
    );
  }

  /*
   * Step 2, as the service role.
   *
   * If this fails the account is already anonymised - there is no personal data
   * left in it - but the person can still sign in. Say so rather than reporting
   * success, because "delete my account" that half-worked is exactly the thing
   * someone needs to know about.
   */
  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError) {
    logError('[delete-account] auth user delete failed', authError);
    return json(
      request,
      {
        error:
          'Your personal data was erased, but the sign-in could not be removed. '
          + 'Contact support@eventerz.xyz so we can finish it.',
        partial: true,
      },
      500,
    );
  }

  return json(request, { deleted: true });
});
