"use client";

import * as React from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletError } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";
import { ConnectModalProvider } from "./connect-modal-context";
import { WalletModal } from "./wallet-modal";

/**
 * Root wallet providers for the whole app.
 *
 * - Connects to Helius RPC when `NEXT_PUBLIC_HELIUS_RPC_URL` is set, otherwise
 *   falls back to public Solana mainnet-beta.
 * - Passes an empty adapter list: modern wallets (Phantom, Solflare, Backpack,
 *   Coinbase, Trust, Jupiter, …) auto-register via the Wallet Standard, so any
 *   installed wallet appears automatically.
 * - `autoConnect` silently reconnects a previously-authorized wallet on load.
 */
export function WalletProviders({ children }: { children: React.ReactNode }) {
  const endpoint = React.useMemo(() => {
    const rpc = process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
    if (rpc && rpc.startsWith("http")) return rpc;
    return clusterApiUrl(
      (process.env.NEXT_PUBLIC_SOLANA_NETWORK as "mainnet-beta") ??
        "mainnet-beta"
    );
  }, []);

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
        <ConnectModalProvider>
          {children}
          <WalletModal />
        </ConnectModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
