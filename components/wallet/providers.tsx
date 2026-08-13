"use client";

import * as React from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletError } from "@solana/wallet-adapter-base";
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from "@solana-mobile/wallet-standard-mobile";
import { SOLANA_CLUSTER, rpcEndpoint } from "@/lib/solana/cluster";
import { ConnectModalProvider } from "./connect-modal-context";

/** Our cluster in the `solana:` chain identifiers the Wallet Standard uses. */
const MWA_CHAIN = (
  {
    "mainnet-beta": "solana:mainnet",
    devnet: "solana:devnet",
    testnet: "solana:testnet",
  } as const
)[SOLANA_CLUSTER];

/**
 * Register Mobile Wallet Adapter so the *website* can reach wallets installed
 * as native Android apps.
 *
 * # The bug this fixes
 *
 * On a phone, the connect modal listed Phantom, Solflare, Backpack and Jupiter
 * as "Not installed" and offered Install links - on a device with all four
 * installed. Only Brave Wallet showed as detected.
 *
 * That was not a detection bug so much as a category error. The Wallet Standard
 * discovers wallets that inject themselves into the page, which on a phone means
 * only a browser-native wallet like Brave's. A native Android app cannot inject
 * into another app's web view, and no browser API will ever enumerate the user's
 * installed apps - so a page has no way to *see* Phantom-the-app, however many
 * times it is installed. The modal was reporting the truth about extensions and
 * the user was reading it as a claim about their phone.
 *
 * Mobile Wallet Adapter is the bridge: it hands off to the wallet app over an
 * Android intent instead of looking for an injected object. Registering it adds
 * one "Mobile Wallet Adapter" entry that resolves to whichever wallet app the
 * user picks, which is exactly the same mechanism the dApp uses - so the website
 * on a phone and the app now reach wallets the same way.
 *
 * `registerMwa` guards itself: it checks for Android and a secure context and
 * does nothing anywhere else, so desktop keeps using extensions untouched. It is
 * called at module scope because it must register before `WalletProvider` reads
 * the wallet list, and it is idempotent per page load.
 */
registerMwa({
  appIdentity: {
    name: "Eventerz",
    // Absolute, and the icon is resolved against it. A wallet shows both in its
    // approval sheet, so a relative or wrong URI is what the user is asked to
    // trust.
    uri:
      typeof window !== "undefined"
        ? window.location.origin
        : "https://www.eventerz.xyz",
    icon: "favicon.ico",
  },
  chains: [MWA_CHAIN],
  authorizationCache: createDefaultAuthorizationCache(),
  chainSelector: createDefaultChainSelector(),
  /*
   * Reached only when no MWA-capable wallet is installed *and* the browser
   * cannot hand off. The default handler explains that in a dialog, which is
   * the honest answer - the previous behaviour told a user with four wallets to
   * install a fifth.
   */
  onWalletNotFound: createDefaultWalletNotFoundHandler(),
});

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
