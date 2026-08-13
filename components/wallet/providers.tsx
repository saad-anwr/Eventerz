"use client";

import * as React from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletError } from "@solana/wallet-adapter-base";
import { rpcEndpoint } from "@/lib/solana/cluster";
import { ConnectModalProvider } from "./connect-modal-context";

/**
 * Root wallet providers for the whole app.
 *
 * - Connects to Helius RPC when `NEXT_PUBLIC_HELIUS_RPC_URL` is set, otherwise
 *   falls back to public Solana mainnet-beta.
 * - Passes an empty adapter list: modern wallets (Phantom, Solflare, Backpack,
 *   Coinbase, Trust, Jupiter, ...) auto-register via the Wallet Standard, so any
 *   installed wallet appears automatically.
 * - `autoConnect` silently reconnects a previously-authorized wallet on load.
 */
export function WalletProviders({ children }: { children: React.ReactNode }) {
  // Validated in `lib/solana/cluster`, because this runs during module init of
  // a provider that wraps every route - an unrecognised cluster string here is
  // a blank page, not a failed request.
  const endpoint = React.useMemo(() => rpcEndpoint(), []);

  const onError = React.useCallback((error: WalletError) => {
    // User-rejected/expected errors are silent; log the rest for debugging.
    if (
      error.name === "WalletConnectionError" ||
      error.name === "WalletNotSelectedError"
    ) {
      return;
    }
    // eslint-disable-next-line no-console
    console.warn("[wallet]", error.name, error.message);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect onError={onError}>
        {/*
          `<WalletModal />` is deliberately *not* rendered here.

          It offers "Continue with Google" alongside the wallet list - the same
          shape as the app's connect sheet - which means it reads auth context.
          This provider sits above `<AuthProvider>` in the tree, so a modal
          mounted at this level would call `useAuth()` outside its provider and
          throw on first render of every page.

          It is mounted inside `<AuthProvider>` in `app/layout.tsx` instead,
          which is still within `ConnectModalProvider` below, so `open()` from
          anywhere in the app continues to reach it.
        */}
        <ConnectModalProvider>{children}</ConnectModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
