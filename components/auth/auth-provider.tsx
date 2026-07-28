"use client";

/**
 * Auth provider.
 *
 * Identity model — the wallet is primary:
 *   • Connecting a wallet creates or resumes the account. This is the main path.
 *   • Google is a secondary credential: it authenticates a real person and is
 *     used for recovery and cross-device profile sync. A Google-only account is
 *     "wallet pending" — it can browse, but on-chain actions need a wallet.
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

  /** Real Google OAuth. Navigates away on success. */
  signInWithGoogle: () => Promise<{ ok: boolean; error?: string }>;
  /** Real passwordless email — sends a one-time link. */
  signInWithEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  /** Demo-only local sign-in, used when Supabase is absent. */
  signIn: (method: SocialMethod, data: { name: string; email: string }) => User;
  signOut: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { connected, publicKey, disconnect } = useWallet();
  const [authOpen, setAuthOpen] = React.useState(false);
  const prevConnected = React.useRef(false);

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

  const loadProfile = React.useCallback(async (userId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    setProfile(data ?? null);

    // Mirror the real account into the app store so `useSession()` — and
    // therefore the navbar, dashboard and every screen — reflects the actual
    // signed-in person rather than a demo record.
    if (data) useAppStore.getState().syncRemoteUser(profileToUser(data));
  }, []);

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
      if (session?.user) void loadProfile(session.user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        if (!active) return;
        setSupabaseUser(session?.user ?? null);
        if (session?.user) {
          void loadProfile(session.user.id);
          setAuthOpen(false);
        } else {
          setProfile(null);
          // Signed out of the real backend — drop the mirrored session too.
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
            // Signed in via Google — bind this wallet to that account.
            const result = await linkWalletRemote(address);
            if (result.ok) {
              setProfile(result.data);
              useAppStore.getState().syncRemoteUser(profileToUser(result.data));
            }
          } else {
            /*
             * No session yet. The wallet is the primary credential, so adopt
             * the account it already owns — that is a real sign-in, not a
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
        setProfile((current) =>
          current ? { ...current, wallet_address: null } : current
        );
        // A wallet-only session ends when the wallet disconnects.
        if (!supabaseUser) useAppStore.getState().signOut();
      }
      prevConnected.current = connected;
      return;
    }

    // Demo fallback — the original local-store behaviour.
    const store = useAppStore.getState();
    if (connected && address) {
      if (!store.currentUserId) store.ensureWalletUser(address);
      else store.linkWallet(address);
      setAuthOpen(false);
    } else if (!connected && prevConnected.current) {
      const me = store.currentUserId ? store.users[store.currentUserId] : null;
      if (me?.authMethod === "wallet") store.signOut();
    }
    prevConnected.current = connected;
  }, [connected, publicKey, hasHydrated, supabaseUser]);

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
    // Clear the mirrored session either way — live or demo, the app store is
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
