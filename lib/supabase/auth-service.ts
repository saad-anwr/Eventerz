'use client';

/**
 * Browser-side auth operations.
 *
 * Every function returns a discriminated result rather than throwing, because
 * each one has a user-facing failure mode the UI must render (consent denied,
 * wallet already claimed, project not configured).
 */

import { getSupabaseBrowserClient } from './client';
import { authCallbackUrl, isSupabaseConfigured } from './config';
import type { ProfileRow, ProfileUpdate } from './types';

export type AuthResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const NOT_CONFIGURED =
  'Sign-in is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY — see docs/AUTH_SETUP.md.';

/**
 * Start the Google OAuth flow.
 *
 * On success the browser navigates away to Google, so this does not resolve
 * with a session — the callback route completes the exchange.
 */
export async function signInWithGoogle(next = '/'): Promise<AuthResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: authCallbackUrl(window.location.origin, next),
      queryParams: {
        // Ask for a refresh token and let the user pick an account rather than
        // silently reusing the one Google already has signed in.
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

/**
 * Passwordless email sign-in.
 *
 * Supabase mails a one-time link that lands on the same OAuth callback route.
 * No password is ever stored, which suits a product whose pitch is that you
 * should not need one.
 */
export async function signInWithEmail(
  email: string,
  next = '/',
): Promise<AuthResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authCallbackUrl(window.location.origin, next) },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function signOut(): Promise<AuthResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function fetchProfile(
  userId: string,
): Promise<AuthResult<ProfileRow>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function updateProfile(
  userId: string,
  patch: ProfileUpdate,
): Promise<AuthResult<ProfileRow>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/**
 * Bind a wallet to the signed-in account.
 *
 * Delegates to the `link_wallet` SQL function so the "is this wallet already
 * claimed?" check and the write happen atomically.
 */
export async function linkWallet(
  walletAddress: string,
): Promise<AuthResult<ProfileRow>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { data, error } = await supabase.rpc('link_wallet', {
    p_wallet_address: walletAddress,
  });

  if (error) {
    const friendly =
      error.code === '23505'
        ? 'That wallet is already linked to another Eventerz account.'
        : error.message;
    return { ok: false, error: friendly };
  }

  return { ok: true, data: data as ProfileRow };
}

/** Find the account that already owns a wallet, if any. */
export async function profileForWallet(
  walletAddress: string,
): Promise<ProfileRow | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  return data;
}

export { isSupabaseConfigured };
