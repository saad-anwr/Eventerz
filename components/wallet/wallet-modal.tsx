"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWallet, type Wallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { SolanaMobileWalletAdapterWalletName } from "@solana-mobile/wallet-standard-mobile";
import {
  ArrowUpRight,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Wallet as WalletIcon,
  X,
} from "lucide-react";
import { useConnectModal } from "./connect-modal-context";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useAuth } from "@/components/auth/auth-provider";
import { GoogleMark } from "@/components/auth/google-gate";
import { describeWalletError } from "@/lib/wallet-errors";
import { cn } from "@/lib/utils";

/**
 * Popular wallets, and how to reach each one on a phone.
 *
 * # Why `browse` exists
 *
 * A mobile web page cannot connect to a wallet *app*. Nothing injects into the
 * tab, and no browser API enumerates installed apps - so these rows previously
 * said "Not installed" and offered an extension download, on a phone that had
 * every one of them.
 *
 * There are exactly two mechanisms that work, and this is the reliable one:
 * hand the page off to the wallet's own in-app browser, where the wallet does
 * inject and connects normally. The other is Mobile Wallet Adapter, which on
 * web has to reach the wallet over a localhost socket and depends on a Chrome
 * permission prompt that does not always appear - so it is offered alongside
 * these rather than instead of them.
 *
 * Formats are per-wallet and taken from each vendor's deeplink docs; both the
 * target URL and the referrer are percent-encoded.
 *
 * Jupiter deliberately has no `browse`. Jupiter Mobile ships an in-app browser
 * but publishes no `ul/browse` universal link, and inventing a URL shape would
 * produce exactly the dead row this is meant to remove. It stays reachable
 * through Mobile Wallet Adapter, which Jupiter Mobile supports on Android.
 */
const CURATED = [
  {
    name: "Phantom",
    url: "https://phantom.app/download",
    color: "#AB9FF2",
    browse: (target: string, ref: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(
        target
      )}?ref=${encodeURIComponent(ref)}`,
  },
  {
    name: "Solflare",
    url: "https://solflare.com/download",
    color: "#FFC10A",
    browse: (target: string, ref: string) =>
      `https://solflare.com/ul/v1/browse/${encodeURIComponent(
        target
      )}?ref=${encodeURIComponent(ref)}`,
  },
  {
    name: "Backpack",
    url: "https://backpack.app/download",
    color: "#E33E3F",
    browse: (target: string, ref: string) =>
      `https://backpack.app/ul/v1/browse/${encodeURIComponent(
        target
      )}?ref=${encodeURIComponent(ref)}`,
  },
  { name: "Jupiter", url: "https://jup.ag/mobile", color: "#22D3EE" },
] as const;

function WalletRow({
  wallet,
  pending,
  onSelect,
  caption = "Detected",
}: {
  wallet: Wallet;
  pending: boolean;
  onSelect: () => void;
  caption?: string;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={pending}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition-all duration-200 hover:border-brand-purple/40 hover:bg-white/[0.06] disabled:opacity-70"
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={wallet.adapter.icon}
          alt=""
          width={28}
          height={28}
          className="size-7"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">
          {wallet.adapter.name}
        </span>
        <span className="text-xs text-brand-green">{caption}</span>
      </span>
      {pending ? (
        <Loader2 className="size-4 animate-spin text-brand-purple" />
      ) : (
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
}

export function WalletModal() {
  const { visible, close } = useConnectModal();
  const { wallets, select, connect, connected, connecting, wallet } =
    useWallet();
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { isLive, signInWithGoogle, loading: authLoading } = useAuth();

  useScrollLock(visible);

  // Detected (installed / loadable) wallets, installed first.
  const detected = React.useMemo(
    () =>
      wallets
        .filter(
          (w) =>
            w.readyState === WalletReadyState.Installed ||
            w.readyState === WalletReadyState.Loadable
        )
        .sort((a, b) =>
          a.readyState === WalletReadyState.Installed ? -1 : 1
        ),
    [wallets]
  );

  /**
   * True when Mobile Wallet Adapter registered, i.e. we are on Android and the
   * page can hand off to a wallet *app*. See `registerMwa` in `providers.tsx`.
   */
  const mwaAvailable = React.useMemo(
    () =>
      detected.some(
        (w) => w.adapter.name === SolanaMobileWalletAdapterWalletName
      ),
    [detected]
  );

  /*
   * Are we on a phone?
   *
   * Read in an effect rather than during render: `navigator` does not exist
   * during the server pass, and branching the markup on it directly would
   * produce a hydration mismatch on every page load.
   */
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    setIsMobile(/android|iphone|ipad|ipod/i.test(navigator.userAgent));
  }, []);

  /** The page to reopen inside a wallet's in-app browser. */
  const browseTarget = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, []);

  /*
   * Curated wallets that aren't already detected.
   *
   * Kept on both platforms - the earlier version suppressed them entirely once
   * MWA registered, which removed the only rows that actually connect on a
   * phone. What changes by platform is *what the row does*: an extension
   * download on desktop, a hand-off into the wallet's own browser on mobile.
   */
  const discover = React.useMemo(() => {
    const names = new Set(detected.map((w) => w.adapter.name.toLowerCase()));
    return CURATED.filter((c) => !names.has(c.name.toLowerCase()));
  }, [detected]);

  /*
   * Drive the select -> connect handshake.
   *
   * The catch used to be `.catch(() => {})` - every connection failure
   * discarded in silence. Clicking a wallet and having the modal do absolutely
   * nothing is indistinguishable from a dead button, and it is the same class
   * of bug that got the Android build rejected, just failing quietly instead of
   * loudly. Errors now go through the shared vocabulary, so the browser reports
   * what the phone reports.
   */
  React.useEffect(() => {
    if (!pending) return;
    if (wallet?.adapter.name === pending && !connected && !connecting) {
      const attempted = pending;
      connect()
        .catch((e: unknown) => {
          /*
           * Mobile Wallet Adapter fails differently, and generically, so it
           * gets its own sentence.
           *
           * On web MWA cannot use the Android intent the native app uses. It
           * reaches the wallet over a localhost socket, which first needs
           * Chrome's local-network permission - the "Allow connections to your
           * wallet" prompt. When that prompt does not appear, or was declined
           * once, the handshake dies with nothing specific to report. Saying
           * "try again" there sends people round the same loop; the in-app
           * browser rows below are the route that does not depend on it.
           */
          if (attempted === SolanaMobileWalletAdapterWalletName) {
            setError(
              "Your wallet app did not open. Chrome needs permission to reach it, which it does not always ask for - opening this page inside your wallet's own browser below works without that."
            );
            return;
          }
          setError(describeWalletError(e));
        })
        .finally(() => setPending(null));
    }
  }, [pending, wallet, connected, connecting, connect]);

  // Close on successful connection.
  React.useEffect(() => {
    if (connected && visible) {
      close();
      setPending(null);
    }
  }, [connected, visible, close]);

  // Close on Escape.
  React.useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, close]);

  const handleSelect = (name: string) => {
    setError(null);
    setPending(name);
    // `WalletName` is a branded string; the adapter name is exactly that type.
    select(name as Parameters<typeof select>[0]);
  };

  /**
   * Google, in the same place and with the same words as the app's sheet.
   *
   * It was missing here entirely. On mobile the connect sheet offers "Continue
   * with Google" under an "or" divider - the path for anyone without a wallet,
   * and the one that carries the profile and social graph. The website offered
   * wallets and nothing else, so a visitor with no extension reached a dead end
   * that the app does not have.
   */
  const handleGoogle = React.useCallback(() => {
    setError(null);
    void signInWithGoogle();
  }, [signInWithGoogle]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Connect a wallet"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={close}
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="gradient-border relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-brand-bg-soft/95 shadow-card backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-brand-purple/15 text-brand-purple">
                  <WalletIcon className="size-5" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold text-white">
                    Connect a wallet
                  </h2>
                  {/* The website's own line, kept as it was. Mirroring the
                      app's wording belongs after sign-in, not here. */}
                  <p className="text-xs text-muted-foreground">
                    Choose how you want to connect
                  </p>
                </div>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {/* A failed connection has to say so - see the handshake effect. */}
              {error && (
                <p
                  role="alert"
                  className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                >
                  {error}
                </p>
              )}

              {/* Detected wallets */}
              {detected.length > 0 ? (
                <div className="space-y-2">
                  {detected.map((w) => (
                    <WalletRow
                      key={w.adapter.name}
                      wallet={w}
                      pending={pending === w.adapter.name}
                      onSelect={() => handleSelect(w.adapter.name)}
                      /* "Detected" is right for an extension and misleading for
                         MWA, which has not detected anything - it opens a
                         chooser and hands off to whichever wallet app answers. */
                      caption={
                        w.adapter.name === SolanaMobileWalletAdapterWalletName
                          ? "Opens your wallet app"
                          : "Detected"
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center">
                  <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-white/[0.05] text-muted-foreground">
                    <WalletIcon className="size-5" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-white">
                    No Solana wallet detected
                  </p>
                  {/* On a phone "install one below" is wrong - the apps are
                      very likely already there, just invisible to a web page. */}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isMobile
                      ? "A web page cannot see wallet apps. Open this page in your wallet's browser below."
                      : "Install one of the wallets below to continue."}
                  </p>
                </div>
              )}

              {/* Discovery */}
              {discover.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {isMobile
                      ? "Open in a wallet app"
                      : detected.length > 0
                        ? "More wallets"
                        : "Get a wallet"}
                  </p>
                  <div className="space-y-2">
                    {discover.map((c) => {
                      /*
                       * On a phone, hand off to the wallet's in-app browser -
                       * the page reopens there and the wallet injects, which is
                       * the only route that reliably connects. Falls back to the
                       * download link for Jupiter, which publishes no browse
                       * deeplink, and for every wallet on desktop.
                       */
                      const deepLink =
                        isMobile && "browse" in c && browseTarget
                          ? c.browse(browseTarget, window.location.origin)
                          : null;

                      return (
                        <a
                          key={c.name}
                          href={deepLink ?? c.url}
                          {...(deepLink
                            ? {}
                            : { target: "_blank", rel: "noopener noreferrer" })}
                          className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.04]"
                        >
                          <span
                            className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                            style={{
                              backgroundColor: `${c.color}22`,
                              color: c.color,
                            }}
                          >
                            <WalletIcon className="size-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-white">
                              {c.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {deepLink
                                ? `Opens in ${c.name}`
                                : isMobile
                                  ? "Get the app"
                                  : "Not installed"}
                            </span>
                          </span>
                          <span className="flex items-center gap-1 text-xs font-medium text-brand-cyan">
                            {deepLink ? "Open" : "Install"}
                            <ArrowUpRight className="size-3.5" />
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/*
                Google, below the wallets and behind an "or" - the same order,
                divider and helper text as the app's connect sheet, so the two
                onboarding surfaces read as one product.
              */}
              {isLive && (
                <>
                  <div className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-white/10" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogle}
                    disabled={authLoading}
                    className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full border border-white/[0.12] bg-white/[0.05] text-sm font-semibold text-white transition-colors hover:bg-white/[0.08] disabled:opacity-60"
                  >
                    <GoogleMark className="size-[18px]" />
                    Continue with Google
                  </button>

                  <p className="mt-2.5 text-center text-xs text-muted-foreground">
                    Google makes your profile discoverable and the account
                    recoverable. Tickets and check-in still need a wallet.
                  </p>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 border-t border-white/10 px-5 py-3.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0 text-brand-green" />
              Eventerz never has access to your funds. You approve every action.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
