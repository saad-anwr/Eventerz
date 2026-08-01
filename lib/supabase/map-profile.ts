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
   * The wallet is the primary credential, so a profile that has one is a
   * wallet account regardless of how the person happened to sign in this time.
   */
  const authMethod: AuthMethod = profile.wallet_address ? 'wallet' : 'google';

  return {
    id: profile.id,
    name: profile.name,
    handle: profile.handle ?? fallbackHandle(profile),
    email,
    bio: profile.bio ?? undefined,
    location: profile.location ?? undefined,
    website: profile.website ?? undefined,
    twitter: profile.twitter ?? undefined,
    walletAddress: profile.wallet_address ?? undefined,
    avatarUrl: profile.avatar_url ?? undefined,
    authMethod,
    reputation: profile.reputation,
    interests: profile.interests ?? [],
    createdAt: Date.parse(profile.created_at) || Date.now(),
  };
}
