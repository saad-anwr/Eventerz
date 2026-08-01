"use client";

/**
 * Auth provider.
 *
 * Identity model - the wallet is primary:
 *   • Connecting a wallet creates or resumes the account. This is the main path.
 *   • Google is a secondary credential: it authenticates a real person and is
 *     used for recovery and cross-device profile sync. A Google-only account is
 *     "wallet pending" - it can browse, but on-chain actions need a wallet.
 *
 * When Supabase is configured, Google runs a real OAuth flow and the session
 * comes back from the auth server. When it is not, the provider falls back to
 * the local demo store so the marketing site still works from a fresh clone.
 */

import * as React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

import { useAppStore } from "@/lib/store/use-app-store";
import type { User } from "@/lib/store/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  linkWallet as linkWalletRemote,
  profileForWallet,
  signInWithEmail as startEmailOtp,
  signInWithGoogle as startGoogleOAuth,
  signOut as signOutRemote,
} from "@/lib/supabase/auth-service";
import { profileToUser } from "@/lib/supabase/map-profile";
import { PROFILE_COLUMNS } from "@/lib/supabase/types";
import type { ProfileRow } from "@/lib/supabase/types";
import { AuthModal } from "./auth-modal";

type SocialMethod = "google" | "apple" | "email";

interface AuthContextValue {
  /** True when a real Supabase project is wired up. */
  isLive: boolean;
  authOpen: boolean;
  openAuth: () => void;
  closeAuth: () => void;

  /** The authenticated Supabase user, when running live. */
  supabaseUser: SupabaseUser | null;
  /** The profile row backing the session, when running live. */
  profile: ProfileRow | null;
  /** True while the initial session is being restored. */
  loading: boolean;
  /** Signed in via Google but no wallet linked yet. */
  walletPending: boolean;
  /**
   * Why the last wallet-verification attempt failed, or null.
   *
   * Linking now needs a signature, so it is a step the user can decline. A
   * connected-but-unlinked wallet with no explanation looks like a bug.
   */
  walletLinkError: string | null;

  /** Real Google OAuth. Navigates away on success. */
  signInWithGoogle: () => Promise<{ ok: boolean; error?: string }>;
  /** Real passwordless email - sends a one-time link. */
  signInWithEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  /** Demo-only local sign-in, used when Supabase is absent. */
  signIn: (method: SocialMethod, data: { name: string; email: string }) => User;
  signOut: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { connected, publicKey, disconnect, signMessage } = useWallet();
  const [authOpen, setAuthOpen] = React.useState(false);
  const prevConnected = React.useRef(false);
  /**
   * Why the last wallet-link attempt failed, when it did.
   *
   * Exposed on the context so a screen can render it. Wallet linking is now a
   * step that can be declined, and a user who cancels the signature needs to be
   * told the wallet is connected but not linked - otherwise the account looks
   * broken for a reason they cannot see.
   */
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const [supabaseUser, setSupabaseUser] = React.useState<SupabaseUser | null>(
    null
  );
  const [profile, setProfile] = React.useState<ProfileRow | null>(null);
  const [loading, setLoading] = React.useState(isSupabaseConfigured);

  const hasHydrated = useAppStore((s) => s.hasHydrated);

  // Seed demo data once the persisted store has hydrated.
  React.useEffect(() => {
    if (hasHydrated) useAppStore.getState().seedIfEmpty();
  }, [hasHydrated]);

  /* --------------------------------------------------------------------- */
  /*  Live session                                                          */
  /* --------------------------------------------------------------------- */

  /**
   * @param email - the session's own address. `profiles.email` is not readable
   *   by clients (see `lib/supabase/types.ts`), so the only place the signed-in
   *   user's address can come from is their own session - which is also the
   *   only place it should, since nobody else's is available there.
   */
  const loadProfile = React.useCallback(
    async (userId: string, email?: string) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", userId)
        .single();

      setProfile(data ?? null);

      // Mirror the real account into the app store so `useSession()` - and
      // therefore the navbar, dashboard and every screen - reflects the actual
      // signed-in person rather than a demo record.
      if (data) {
        useAppStore.getState().syncRemoteUser(profileToUser(data, email));
      }
    },
    [],
  );

  React.useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    // Restore an existing session on mount.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setSupabaseUser(session?.user ?? null);
      if (session?.user) void loadProfile(session.user.id, session.user.email);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: string, session: Session | null) => {
        if (!active) return;
        setSupabaseUser(session?.user ?? null);

        if (session?.user) {
          void loadProfile(session.user.id, session.user.email);
          setAuthOpen(false);
          return;
        }

        setProfile(null);

        /*
         * Only a real sign-out clears the local session.
         *
         * This used to clear it whenever `session` was null, which is not the
         * same thing. Supabase fires `INITIAL_SESSION` on every page load, and
         * for a wallet-only account that session is *always* null - connecting a
         * wallet resolves a profile row, it does not mint a Supabase JWT. So
         * every reload ran `signOut()` against the persisted store and wiped the
         * account the user had just been using.
         *
         * That is the "why am I signed out after closing the browser?" bug: the
         * cookie and the store were both fine, and the app deleted the session
         * itself, one millisecond after restoring it.
         *
         * `SIGNED_OUT` is the only event that means the user is no longer
         * signed in. `TOKEN_REFRESHED` and `USER_UPDATED` never carry a null
         * session, and `INITIAL_SESSION` with null means "there was never one
         * here" - which is not something to act on.
         */
        if (event === 'SIGNED_OUT') {
          useAppStore.getState().signOut();
        }
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  /* --------------------------------------------------------------------- */
  /*  Wallet ⇄ session                                                      */
  /* --------------------------------------------------------------------- */

  React.useEffect(() => {
    if (!hasHydrated) return;
    const address = publicKey?.toBase58();

    // Live: the wallet is the primary credential.
    if (isSupabaseConfigured) {
      if (connected && address) {
        void (async () => {
          if (supabaseUser) {
            /*
             * Signed in via Google - bind this wallet to that account, which
             * now requires a signature (migration 0011). Two guards before
             * asking for one:
             *
             *   • Skip if this exact wallet is already linked. Re-prompting on
             *     every page load for a binding that already exists would
             *     train the user to approve signature requests without
             *     reading them, which is the habit every phishing attack
             *     needs.
             *   • Skip if the adapter cannot sign messages at all. A few
             *     wallets omit `signMessage`; there is nothing to fall back
             *     to, and failing loudly is better than linking unverified.
             */
            if (profile?.wallet_address === address) return;
            if (!signMessage) {
              setLinkError(
                "This wallet cannot sign messages, so ownership cannot be verified. Try Phantom, Solflare or Backpack.",
              );
              return;
            }

            setLinkError(null);
            const result = await linkWalletRemote(address, signMessage);
            if (result.ok) {
              setProfile(result.data);
              useAppStore.getState().syncRemoteUser(profileToUser(result.data));
            } else {
              // Surfaced rather than swallowed: the old code ignored failures,
              // which is how "the wallet silently did not link" became a bug
              // nobody could see.
              setLinkError(result.error ?? "Could not verify that wallet.");
            }
          } else {
            /*
             * No session yet. The wallet is the primary credential, so adopt
             * the account it already owns - that is a real sign-in, not a
             * prompt. Unknown wallets fall through to the demo store below.
             */
            const owner = await profileForWallet(address);
            if (owner) {
              setProfile(owner);
              useAppStore.getState().syncRemoteUser(profileToUser(owner));
            } else {
              useAppStore.getState().ensureWalletUser(address);
            }
          }
          setAuthOpen(false);
        })();
      } else if (!connected && prevConnected.current) {
        /*
         * Disconnecting a wallet is not signing out, and it does not unlink.
         *
         * Two things used to happen here and both were wrong. The profile's
         * `wallet_address` was blanked locally, which is a lie - the link lives
         * in Postgres and survives; the only effect was to defeat the
         * "already linked" guard above, so the next connect asked the user to
         * sign again for a binding that already existed. And a wallet-only
         * session was ended outright, which meant a browser restart with a
         * locked extension logged the person out of an account they never left.
         *
         * A wallet extension locking itself is routine. Identity persists;
         * anything that actually needs the wallet asks for it at the point of
         * use, which is where a connection prompt belongs.
         */
      }
      prevConnected.current = connected;
      return;
    }

    // Demo fallback - the original local-store behaviour.
    const store = useAppStore.getState();
    if (connected && address) {
      if (!store.currentUserId) store.ensureWalletUser(address);
      else store.linkWallet(address);
      setAuthOpen(false);
    }
    // Demo mode follows the same rule: a disconnect is not a sign-out.
    prevConnected.current = connected;
    // `profile` and `signMessage` are read inside: without them the effect
    // re-checks a stale linked address and re-prompts for a signature that has
    // already been given.
  }, [connected, publicKey, hasHydrated, supabaseUser, profile, signMessage]);

  /* --------------------------------------------------------------------- */
  /*  Actions                                                               */
  /* --------------------------------------------------------------------- */

  const signInWithGoogle = React.useCallback(async () => {
    const result = await startGoogleOAuth(window.location.pathname);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }, []);

  const signInWithEmail = React.useCallback(async (email: string) => {
    const result = await startEmailOtp(email, window.location.pathname);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }, []);

  const signIn = React.useCallback<AuthContextValue["signIn"]>(
    (method, data) => {
      const store = useAppStore.getState();
      const user = store.signInLocal(method, data);
      const address = publicKey?.toBase58();
      if (connected && address) store.linkWallet(address);
      setAuthOpen(false);
      return user;
    },
    [connected, publicKey]
  );

  const signOut = React.useCallback(() => {
    if (isSupabaseConfigured) {
      void signOutRemote();
      setSupabaseUser(null);
      setProfile(null);
    }
    // Clear the mirrored session either way - live or demo, the app store is
    // what `useSession()` reads.
    useAppStore.getState().signOut();
    if (connected) void disconnect();
  }, [connected, disconnect]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      isLive: isSupabaseConfigured,
      authOpen,
      openAuth: () => setAuthOpen(true),
      closeAuth: () => setAuthOpen(false),
      supabaseUser,
      profile,
      loading,
      walletPending: Boolean(supabaseUser) && !profile?.wallet_address,
      walletLinkError: linkError,
      signInWithGoogle,
      signInWithEmail,
      signIn,
      signOut,
    }),
    [
      authOpen,
      supabaseUser,
      profile,
      loading,
      linkError,
      signInWithGoogle,
      signInWithEmail,
      signIn,
      signOut,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
