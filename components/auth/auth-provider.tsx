"use client";

import * as React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAppStore } from "@/lib/store/use-app-store";
import type { User } from "@/lib/store/types";
import { AuthModal } from "./auth-modal";

type SocialMethod = "google" | "apple" | "email";

interface AuthContextValue {
  authOpen: boolean;
  openAuth: () => void;
  closeAuth: () => void;
  signIn: (method: SocialMethod, data: { name: string; email: string }) => User;
  signOut: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { connected, publicKey, disconnect } = useWallet();
  const [authOpen, setAuthOpen] = React.useState(false);
  const prevConnected = React.useRef(false);

  const hasHydrated = useAppStore((s) => s.hasHydrated);

  // Seed demo data once the persisted store has hydrated.
  React.useEffect(() => {
    if (hasHydrated) useAppStore.getState().seedIfEmpty();
  }, [hasHydrated]);

  // Sync wallet connection ⇄ app session.
  React.useEffect(() => {
    if (!hasHydrated) return;
    const store = useAppStore.getState();
    const addr = publicKey?.toBase58();

    if (connected && addr) {
      if (!store.currentUserId) {
        store.ensureWalletUser(addr);
      } else {
        store.linkWallet(addr);
      }
      setAuthOpen(false);
    } else if (!connected && prevConnected.current) {
      // Wallet just disconnected — sign out only if it was a wallet session.
      const me = store.currentUserId ? store.users[store.currentUserId] : null;
      if (me?.authMethod === "wallet") store.signOut();
    }
    prevConnected.current = connected;
  }, [connected, publicKey, hasHydrated]);

  const signIn = React.useCallback<AuthContextValue["signIn"]>(
    (method, data) => {
      const store = useAppStore.getState();
      const user = store.signInLocal(method, data);
      const addr = publicKey?.toBase58();
      if (connected && addr) store.linkWallet(addr);
      setAuthOpen(false);
      return user;
    },
    [connected, publicKey]
  );

  const signOut = React.useCallback(() => {
    useAppStore.getState().signOut();
    if (connected) void disconnect();
  }, [connected, disconnect]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      authOpen,
      openAuth: () => setAuthOpen(true),
      closeAuth: () => setAuthOpen(false),
      signIn,
      signOut,
    }),
    [authOpen, signIn, signOut]
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
