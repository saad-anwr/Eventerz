/**
 * Translate a Supabase `profiles` row into the app's `User` shape.
 *
 * Every screen already reads `User` via `useSession()`. Mapping here - rather
 * than changing forty call sites - means a real backend account flows straight
 * into the existing UI with no other edits.
 */

import type { AuthMethod, User } from '@/lib/store/types';
import type { ProfileRow } from './types';

/**
 * Derive a stable handle when the server has not set one yet.
 *
 * This used to fall back to the email local-part. It no longer can - the client
 * cannot read `email` (see `types.ts`) - and it should not have: a handle is
 * displayed publicly, so deriving it from an address published the local-part
 * of that address to everyone who saw the profile. `handle_new_user()` does the
 * same derivation server-side at signup, where it is the user's own address and
 * they can change the result; this is only the "server has not set one" case.
 */
function fallbackHandle(profile: ProfileRow): string {
  const slug = profile.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  return slug || `member${profile.id.slice(0, 6)}`;
}

/**
 * @param email - the signed-in user's own address, from the session. Passed
 *   only when mapping *yourself*: it is never available for anyone else, which
 *   is the point. Omitted for every other profile.
 */
export function profileToUser(profile: ProfileRow, email?: string): User {
  /*
   * How this account is rooted.
   *
   * The rule here used to be "a profile with a wallet is a wallet account,
   * regardless of how the person signed in this time", on the reasoning that
   * the wallet was the primary credential. Migration 0022 inverted exactly
   * that: the Google account is the root and wallets attach to it 1:N, because
   * a keypair costs nothing to mass-produce and a Google account carries both
   * a per-account cost and a recovery path. Under the new model a linked
   * wallet is evidence *for* a Google-rooted account, not against one - so the
   * old derivation reported "via wallet" for precisely the users who had done
   * the thing the model wants.
   *
   * A session email is the one unambiguous signal available: the client cannot
   * read `email` for anybody else (0015), so its presence means this is the
   * signed-in user and they hold a Google session. Without it - other people's
   * profiles, and wallet-only accounts predating 0022 - the wallet column is
   * still the only evidence there is.
   */
  const authMethod: AuthMethod = email
    ? 'google'
    : profile.wallet_address
      ? 'wallet'
      : 'google';

  return {
    id: profile.id,
    name: profile.name,
    handle: profile.handle ?? fallbackHandle(profile),
    email,
    bio: profile.bio ?? undefined,
    location: profile.location ?? undefined,
    website: profile.website ?? undefined,
    twitter: profile.twitter ?? undefined,
    twitterVerified: profile.twitter_verified ?? false,
    walletAddress: profile.wallet_address ?? undefined,
    avatarUrl: profile.avatar_url ?? undefined,
    authMethod,
    reputation: profile.reputation,
    interests: profile.interests ?? [],
    createdAt: Date.parse(profile.created_at) || Date.now(),
  };
}
