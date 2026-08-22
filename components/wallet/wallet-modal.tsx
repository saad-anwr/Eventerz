"use client";

import * as React from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { useWallet, type Wallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { SolanaMobileWalletAdapterWalletName } from "@solana-mobile/wallet-standard-mobile";
import {
  ArrowUpRight,
  ChevronLeft,
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
import {
  watchLocalNetworkAccess,
  type LocalNetworkAccess,
} from "@/lib/local-network-access";
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

/**
 * Why a Mobile Wallet Adapter connection failed, in the user's terms.
 *
 * Only reached on browsers where MWA is worth attempting at all - see
 * `mwaIsHopeless`. Anywhere the permission gate is known to be in the way, the
 * modal explains the alternatives instead of failing.
 */
function mwaFailureMessage(error: unknown): string {
  const raw =
    error instanceof Error ? `${error.name} ${error.message}` : String(error);

  if (/LOOPBACK_ACCESS_BLOCKED|permission denied/i.test(raw)) {
    return "Chrome blocked the local connection your wallet needs. Open this page in your wallet's own browser below - that route needs no permission.";
  }

  return "Your wallet app did not open. Make sure a Solana wallet is installed, or open this page in your wallet's own browser below.";
}

/**
 * Is Mobile Wallet Adapter a dead end on this browser?
 *
 * MWA on the web reaches the wallet over `ws://localhost:<port>`, which Chrome
 * 142 put behind the permission it labels "Apps on device". Unless that is
 * already granted, it cannot connect - and on Android Chrome the permission
 * cannot be obtained either:
 *
 *   * the library asks for it under `loopback-network`, the origin-trial name,
 *     so on a shipping Chrome the query throws and it never asks at all; and
 *   * asking correctly, as `local-network-access` from inside the tap, is not
 *     enough either. Chrome leaves the permission on `prompt` and puts up no
 *     dialog for a loopback request, so there is nothing for a user to allow.
 *     Verified on device: the state never moves.
 *
 * So `prompt` is not a state to work towards, it is a wall. Treating it as
 * "try again" is what produced the loop of identical failures this replaces.
 *
 * `unsupported` means the browser has no such gate - older Chrome, or not
 * Chromium - and MWA is left to connect exactly as it always did. `granted`
 * means someone has the permission and it genuinely works.
 */
function mwaIsHopeless(lna: LocalNetworkAccess): boolean {
  return lna === "prompt" || lna === "denied";
}

/** A wallet we can only reach by handing the page to its own browser. */
type CuratedWallet = (typeof CURATED)[number];

/**
 * A curated wallet as a link: into its in-app browser on a phone, to its
 * download page otherwise.
 *
 * Shared by the wallet list and by the "can't open a wallet app" explainer, so
 * the two cannot drift into offering different routes to the same wallet.
 */
function WalletLinkRow({
  wallet,
  isMobile,
  browseTarget,
}: {
  wallet: CuratedWallet;
  isMobile: boolean;
  browseTarget: string;
}) {
  /*
   * On a phone, hand off to the wallet's in-app browser - the page reopens
   * there and the wallet injects, which is the only route that reliably
   * connects. Falls back to the download link for Jupiter, which publishes no
   * browse deeplink, and for every wallet on desktop.
   */
  const deepLink =
    isMobile && "browse" in wallet && browseTarget
      ? wallet.browse(browseTarget, window.location.origin)
      : null;

  return (
    <a
      href={deepLink ?? wallet.url}
      {...(deepLink ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.04]"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${wallet.color}22`, color: wallet.color }}
      >
        <WalletIcon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">
          {wallet.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {deepLink
            ? `Opens in ${wallet.name}`
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
}

function WalletRow({
  wallet,
  pending,
  onSelect,
  caption = "Detected",
  captionTone = "ready",
}: {
  wallet: Wallet;
  pending: boolean;
  onSelect: () => void;
  caption?: string;
  /** "ready" is the green that means detected; "blocked" must not be green. */
  captionTone?: "ready" | "blocked";
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
        <span
          className={cn(
            "text-xs",
            captionTone === "blocked" ? "text-amber-400" : "text-brand-green"
          )}
        >
          {caption}
        </span>
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

  /*
   * The permission MWA cannot work without.
   *
   * Tracked here rather than read at click time because reading it is async,
   * and an `await` before `connect()` spends the tap - see `handleSelect`. By
   * the time a row is tapped this already holds the answer.
   *
   * Watching rather than polling also means a user who grants the permission in
   * Chrome's site settings, in another tab, comes back to a working button
   * without reloading.
   */
  const [lna, setLna] = React.useState<LocalNetworkAccess>("unsupported");
  React.useEffect(() => watchLocalNetworkAccess(setLna), []);

  /**
   * Which panel the sheet is showing.
   *
   * `"no-mwa"` is the explainer that replaces a connection attempt that cannot
   * succeed - see `mwaIsHopeless`.
   */
  const [view, setView] = React.useState<"wallets" | "no-mwa">("wallets");

  // Always reopen on the wallet list; the explainer is a detour, not a state
  // the sheet should remember.
  React.useEffect(() => {
    if (visible) setView("wallets");
  }, [visible]);

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
    // Skip when the click handler already started this connection inside the
    // user gesture - see `handleSelect`. This effect is only the fallback for
    // adapters that need the provider to finish selecting first.
    if (directConnect.current === pending) return;
    if (wallet?.adapter.name === pending && !connected && !connecting) {
      const attempted = pending;
      connect()
        .catch((e: unknown) => {
          if (attempted === SolanaMobileWalletAdapterWalletName) {
            setError(mwaFailureMessage(e));
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

  /** Names we started connecting from inside the click, not from the effect. */
  const directConnect = React.useRef<string | null>(null);

  const handleSelect = (name: string) => {
    setError(null);

    /*
     * Say so, rather than fail again.
     *
     * Every attempt on this browser ends the same way, for a reason no retry
     * touches - so the row stops attempting and shows what does work instead.
     * The three routes out are a wallet's own browser, a desktop extension, and
     * Google; all three are on the panel.
     */
    if (
      name === SolanaMobileWalletAdapterWalletName &&
      mwaIsHopeless(lna)
    ) {
      setView("no-mwa");
      return;
    }

    setPending(name);
    // `WalletName` is a branded string; the adapter name is exactly that type.
    select(name as Parameters<typeof select>[0]);

    /*
     * Start the connection here, in the click, rather than leaving it to the
     * effect below.
     *
     * Chrome on Android blocks any navigation that does not originate from an
     * explicit user gesture. Mobile Wallet Adapter has to navigate to the
     * wallet app, so it needs that gesture - and a `connect()` called from a
     * `useEffect` is several tasks removed from the tap that caused it, by
     * which point the activation is gone. Extensions never cared, because they
     * navigate nowhere, which is why this went unnoticed until MWA appeared in
     * the list.
     *
     * The adapter is connected directly rather than through the provider's
     * `connect()`, because that one operates on the *selected* wallet and
     * selection is a state update that has not landed yet at this point.
     */
    const entry = wallets.find((w) => w.adapter.name === name);
    if (!entry) return;

    directConnect.current = name;
    void entry.adapter
      .connect()
      .catch((e: unknown) => {
        if (name === SolanaMobileWalletAdapterWalletName) {
          setError(mwaFailureMessage(e));
          return;
        }
        setError(describeWalletError(e));
      })
      .finally(() => {
        directConnect.current = null;
        setPending(null);
      });
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
    <ModalShell
      open={visible}
      label="Connect a wallet"
      onDismiss={close}
    >
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-5">
        <div className="flex items-center gap-3">
          {view === "no-mwa" ? (
            <button
              onClick={() => setView("wallets")}
              aria-label="Back to wallets"
              className="flex size-10 items-center justify-center rounded-2xl bg-white/[0.06] text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : (
            <span className="flex size-10 items-center justify-center rounded-2xl bg-brand-purple/15 text-brand-purple">
              <WalletIcon className="size-5" />
            </span>
          )}
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              {view === "no-mwa"
                ? "Wallet apps can't open here"
                : "Connect a wallet"}
            </h2>
            {/* The website's own line, kept as it was. Mirroring the
                app's wording belongs after sign-in, not here. */}
            <p className="text-xs text-muted-foreground">
              {view === "no-mwa"
                ? "Here are three ways in that do work"
                : "Choose how you want to connect"}
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
        {view === "no-mwa" ? (
          <>
            {/*
              Said plainly and once, instead of a fourth identical
              failure. Every part of this is what the user can act on -
              the reason is one sentence and the rest is routes out.
            */}
            <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-200/90">
              A mobile browser can&apos;t open your wallet app. Chrome has
              to grant this site access to apps on your device first, and
              it never offers the choice - so there is nothing to allow
              and nothing for the connection to reach.
            </p>

            <div className="mt-5">
              <p className="px-1 text-sm font-semibold text-white">
                Open Eventerz in your wallet
              </p>
              <p className="mb-2.5 mt-1 px-1 text-xs leading-relaxed text-muted-foreground">
                Every wallet ships its own browser. The page reopens
                inside it and connects straight away, with no permission
                involved. This is the one to use on a phone.
              </p>
              <div className="space-y-2">
                {discover.map((c) => (
                  <WalletLinkRow
                    key={c.name}
                    wallet={c}
                    isMobile={isMobile}
                    browseTarget={browseTarget}
                  />
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
              <p className="text-sm font-semibold text-white">
                Or use a computer
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                On a desktop browser, connect with a wallet extension as
                normal. It is the same account either way - whatever you
                do there shows up here.
              </p>
            </div>
          </>
        ) : (
          <>
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
              {detected.map((w) => {
                const isMwa =
                  w.adapter.name === SolanaMobileWalletAdapterWalletName;
                return (
                  <WalletRow
                    key={w.adapter.name}
                    wallet={w}
                    pending={pending === w.adapter.name}
                    onSelect={() => handleSelect(w.adapter.name)}
                    /* "Detected" is right for an extension and misleading
                       for MWA, which has not detected anything - it opens a
                       chooser and hands off to whichever wallet app
                       answers. Where that hand-off cannot work, the row
                       says so up front and explains when tapped, rather
                       than looking like every other row and failing. */
                    caption={
                      isMwa
                        ? mwaIsHopeless(lna)
                          ? "Not available in this browser"
                          : "Opens your wallet app"
                        : "Detected"
                    }
                    captionTone={
                      isMwa && mwaIsHopeless(lna) ? "blocked" : "ready"
                    }
                  />
                );
              })}
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
                {discover.map((c) => (
                  <WalletLinkRow
                    key={c.name}
                    wallet={c}
                    isMobile={isMobile}
                    browseTarget={browseTarget}
                  />
                ))}
              </div>
            </div>
            )}
          </>
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

            <p className="mt-2.5 text-center text-xs leading-relaxed text-muted-foreground">
              {view === "no-mwa"
                ? "Carry on here with Google - discover events, message friends, build your profile. Add a wallet later, from any browser, to claim tickets."
                : "Google makes your profile discoverable and the account recoverable. Tickets and check-in still need a wallet."}
            </p>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-white/10 px-5 py-3.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0 text-brand-green" />
        Eventerz never has access to your funds. You approve every action.
      </div>
    </ModalShell>
  );
}
