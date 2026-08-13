"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWallet, type Wallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
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

/** Popular wallets to surface for discovery when not already installed. */
const CURATED = [
  { name: "Phantom", url: "https://phantom.app/download", color: "#AB9FF2" },
  { name: "Solflare", url: "https://solflare.com/download", color: "#FFC10A" },
  { name: "Backpack", url: "https://backpack.app/download", color: "#E33E3F" },
  { name: "Jupiter", url: "https://jup.ag/mobile", color: "#22D3EE" },
] as const;

function WalletRow({
  wallet,
  pending,
  onSelect,
}: {
  wallet: Wallet;
  pending: boolean;
  onSelect: () => void;
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
        <span className="text-xs text-brand-green">Detected</span>
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

  // Curated wallets that aren't already detected -> offer install links.
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
      connect()
        .catch((e: unknown) => setError(describeWalletError(e)))
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
                  {/* Same line the app's sheet uses. It used to read "Your
                      wallet is your Eventerz identity" there, which stopped
                      being true at migration 0022 and told anyone without a
                      wallet there was no way in. */}
                  <p className="text-xs text-muted-foreground">
                    Or continue with Google - no wallet needed to look around
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    Install one of the wallets below to continue.
                  </p>
                </div>
              )}

              {/* Discovery */}
              {discover.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {detected.length > 0 ? "More wallets" : "Get a wallet"}
                  </p>
                  <div className="space-y-2">
                    {discover.map((c) => (
                      <a
                        key={c.name}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.04]"
                      >
                        <span
                          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                          style={{ backgroundColor: `${c.color}22`, color: c.color }}
                        >
                          <WalletIcon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-white">
                            {c.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Not installed
                          </span>
                        </span>
                        <span className="flex items-center gap-1 text-xs font-medium text-brand-cyan">
                          Install
                          <ArrowUpRight className="size-3.5" />
                        </span>
                      </a>
                    ))}
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
