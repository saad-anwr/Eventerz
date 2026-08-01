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
import { PROFILE_COLUMNS } from './types';
import type { ProfileRow, ProfileUpdate } from './types';

export type AuthResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const NOT_CONFIGURED =
  'Sign-in is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY - see docs/AUTH_SETUP.md.';

/**
 * Start the Google OAuth flow.
 *
 * On success the browser navigates away to Google, so this does not resolve
 * with a session - the callback route completes the exchange.
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
    .select(PROFILE_COLUMNS)
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
    .select(PROFILE_COLUMNS)
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/**
 * Bind a wallet to the signed-in account, after proving it is theirs.
 *
 * Three steps, and none of them can be skipped:
 *
 *   1. `issue_wallet_link_nonce` mints a single-use challenge, bound to this
 *      account and this address and valid for five minutes.
 *   2. The wallet signs that exact text. This is what the old implementation
 *      never did - it took an address on trust, so any signed-in user could
 *      claim any unclaimed wallet they could read off the explorer, along with
 *      its reputation and ticket history.
 *   3. The `link-wallet` Edge Function verifies the signature (Postgres has no
 *      Ed25519) and calls a function that is revoked from `authenticated`, so
 *      there is no path to a linked wallet that bypasses the check.
 *
 * `signMessage` is injected rather than imported: the wallet adapter's version
 * is a React hook value, and reaching for it from a plain module would either
 * duplicate the adapter or force this file to become a component.
 */
export async function linkWallet(
  walletAddress: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<AuthResult<ProfileRow>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { data: challenge, error: challengeError } = await supabase.rpc(
    'issue_wallet_link_nonce',
    { p_wallet_address: walletAddress },
  );

  if (challengeError) {
    const friendly =
      challengeError.code === '23505'
        ? 'That wallet is already linked to another Eventerz account.'
        : challengeError.message;
    return { ok: false, error: friendly };
  }

  let signature: string;
  try {
    const message = challenge as string;
    const signed = await signMessage(new TextEncoder().encode(message));

    // Base64 rather than base58: `btoa` is built in, and the Edge Function
    // accepts either encoding precisely so neither client needs a base58
    // implementation just to send a signature.
    signature = btoa(String.fromCharCode(...signed));

    const { data, error } = await supabase.functions.invoke('link-wallet', {
      body: { walletAddress, message, signature },
    });

    if (error) {
      /*
       * `FunctionsHttpError.message` is always "Edge Function returned a
       * non-2xx status code". The message worth showing is in the response
       * body, which the function writes for exactly this purpose.
       */
      const response = (error as { context?: Response }).context;
      let detail: string | null = null;
      if (response && typeof response.json === 'function') {
        try {
          const body = await response.json();
          if (typeof body?.error === 'string') detail = body.error;
        } catch {
          /* not JSON - fall through to the generic message */
        }
      }
      return { ok: false, error: detail ?? 'Could not verify that wallet.' };
    }

    const profile = (data as { profile?: ProfileRow } | null)?.profile;
    if (!profile) return { ok: false, error: 'Could not verify that wallet.' };
    return { ok: true, data: profile };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Wallet verification failed.';
    // Declining the signature is a choice, not a fault. Say what happened
    // without dressing it as an error the user has to fix.
    if (/user rejected|denied|declined/i.test(message)) {
      return { ok: false, error: 'Wallet verification was cancelled.' };
    }
    return { ok: false, error: message };
  }
}

/** Find the account that already owns a wallet, if any. */
export async function profileForWallet(
  walletAddress: string,
): Promise<ProfileRow | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  return data;
}

export { isSupabaseConfigured };
