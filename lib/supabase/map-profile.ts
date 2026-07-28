/**
 * Translate a Supabase `profiles` row into the app's `User` shape.
 *
 * Every screen already reads `User` via `useSession()`. Mapping here — rather
 * than changing forty call sites — means a real backend account flows straight
 * into the existing UI with no other edits.
 */

import type { AuthMethod, User } from '@/lib/store/types';
import type { ProfileRow } from './types';

/** Derive a stable handle when the server has not set one yet. */
function fallbackHandle(profile: ProfileRow): string {
  const source = profile.email?.split('@')[0] ?? profile.name;
  const slug = source.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  return slug || `member${profile.id.slice(0, 6)}`;
}

export function profileToUser(profile: ProfileRow): User {
  /*
   * The wallet is the primary credential, so a profile that has one is a
   * wallet account regardless of how the person happened to sign in this time.
   */
  const authMethod: AuthMethod = profile.wallet_address ? 'wallet' : 'google';

  return {
    id: profile.id,
    name: profile.name,
    handle: profile.handle ?? fallbackHandle(profile),
    email: profile.email ?? undefined,
    bio: profile.bio ?? undefined,
    location: profile.location ?? undefined,
    website: profile.website ?? undefined,
    twitter: profile.twitter ?? undefined,
    walletAddress: profile.wallet_address ?? undefined,
    authMethod,
    reputation: profile.reputation,
    interests: profile.interests ?? [],
    createdAt: Date.parse(profile.created_at) || Date.now(),
  };
}
