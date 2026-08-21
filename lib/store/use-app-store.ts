"use client";

/**
 * The session store: who is signed in, as far as the UI is concerned.
 *
 * Everything else - events, guests, messages, friendships - is read from
 * Supabase through `lib/hooks/use-eventerz-data.ts` and cached by React Query.
 * This holds only the identity that `useSession()` reads, so that every screen
 * can ask "who am I?" without knowing whether the answer came from a real
 * Supabase account or from the local demo fallback.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { shortenAddress, uid } from "@/lib/format";
import type { AuthMethod, User } from "./types";
import { seedUsers } from "./seed";

interface AppState {
  hasHydrated: boolean;
  users: Record<string, User>;
  currentUserId: string | null;

  // lifecycle
  setHasHydrated: (v: boolean) => void;
  seedIfEmpty: () => void;

  // auth / identity
  signInLocal: (
    method: Exclude<AuthMethod, "wallet">,
    data: { name: string; email: string }
  ) => User;
  /**
   * Adopt a user authenticated by the real backend as the current session.
   * Lets every existing screen keep reading `useSession()` unchanged while the
   * identity behind it is a genuine Supabase account.
   */
  syncRemoteUser: (user: User) => void;
  ensureWalletUser: (address: string) => User;
  linkWallet: (address: string) => void;
  signOut: () => void;
}

function makeHandle(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "user";
  return `${base}${Math.floor(Math.random() * 90 + 10)}`;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      users: {},
      currentUserId: null,

      setHasHydrated: (v) => set({ hasHydrated: v }),

      seedIfEmpty: () => {
        if (Object.keys(get().users).length > 0) return;
        const users: Record<string, User> = {};
        seedUsers.forEach((u) => (users[u.id] = u));
        set({ users });
      },

      signInLocal: (method, data) => {
        const existing = Object.values(get().users).find(
          (u) => u.email && u.email.toLowerCase() === data.email.toLowerCase()
        );
        if (existing) {
          set({ currentUserId: existing.id });
          return existing;
        }
        const id = uid("u");
        const user: User = {
          id,
          name: data.name || data.email.split("@")[0],
          handle: makeHandle(data.name || data.email),
          email: data.email,
          authMethod: method,
          reputation: 120,
          interests: [],
          createdAt: Date.now(),
        };
        set((s) => ({
          users: { ...s.users, [id]: user },
          currentUserId: id,
        }));
        return user;
      },

      syncRemoteUser: (user) => {
        set((s) => ({
          users: {
            ...s.users,
            // Keep any locally-known extras (interests picked in the demo)
            // but let the server's copy win on every field it owns.
            [user.id]: { ...s.users[user.id], ...user },
          },
          currentUserId: user.id,
        }));
      },

      ensureWalletUser: (address) => {
        const existing = Object.values(get().users).find(
          (u) => u.walletAddress === address
        );
        if (existing) {
          if (!get().currentUserId) set({ currentUserId: existing.id });
          return existing;
        }
        const id = uid("u");
        const user: User = {
          id,
          name: shortenAddress(address),
          handle: `sol${address.slice(0, 6).toLowerCase()}`,
          walletAddress: address,
          authMethod: "wallet",
          reputation: 100,
          interests: [],
          createdAt: Date.now(),
        };
        set((s) => ({
          users: { ...s.users, [id]: user },
          currentUserId: s.currentUserId ?? id,
        }));
        return user;
      },

      linkWallet: (address) => {
        const { currentUserId, users } = get();
        if (!currentUserId) return;
        const me = users[currentUserId];
        if (!me || me.walletAddress) return;
        set({
          users: {
            ...users,
            [currentUserId]: { ...me, walletAddress: address },
          },
        });
      },

      signOut: () => set({ currentUserId: null }),
    }),
    {
      name: "eventerz-store",
      version: 3,
      /**
       * What survives a reload - and, just as importantly, what does not.
       *
       * This writes to `localStorage`, which is readable by any JavaScript on
       * the page. That is the whole threat model: one XSS, one malicious
       * dependency, one bad browser extension, and everything here is
       * exfiltrated in a single `JSON.parse`. Persisting something is therefore
       * a decision about what is acceptable to lose, not a caching detail.
       *
       * `email` is stripped from every persisted user below. It is the one
       * directly identifying field on the record, and losing the
       * email -> wallet_address pair is the exact deanonymisation that
       * migration 0015 exists to prevent. It is still held in memory for the
       * current session, where the session cookie already implies it; it just
       * stops being written to disk, and comes back from the session on the
       * next load anyway.
       *
       * Cached events, messages and friend requests used to be persisted here
       * too. They are gone - not merely unpersisted - because the store no
       * longer holds them: private conversations are the most sensitive thing
       * the app has and the least valuable to cache, and Supabase is the only
       * source any of it is read from now.
       *
       * `version: 3` discards an older blob rather than migrating it, which is
       * what clears the emails, messages and stale event copies already sitting
       * in browsers today.
       */
      partialize: (s) => ({
        users: Object.fromEntries(
          Object.entries(s.users).map(([id, u]) => [
            id,
            { ...u, email: undefined },
          ]),
        ),
        currentUserId: s.currentUserId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
