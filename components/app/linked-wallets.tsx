"use client";

/**
 * The wallets attached to this account.
 *
 * The browser half of the app's `features/wallet/linked-wallets.tsx`, with the
 * same model and the same words. Until migration 0022 an account held exactly
 * one wallet in a single `text unique` column, so a person with a browser
 * wallet and a phone wallet had to keep two Eventerz accounts - the constraint
 * meant to prevent duplicate identities was creating them.
 *
 * Exactly one wallet is primary. That is the one mirrored into
 * `profiles.wallet_address`, which event cards, receipts and the public
 * address -> account lookup all read, so it is the wallet the rest of Eventerz
 * treats as yours. The others are private to the account on purpose - see the
 * migration header on why publishing the set would tie a burner to a main
 * wallet in public.
 */

import * as React from "react";
import { Check, Loader2, Plus, Star, Trash2, Wallet } from "lucide-react";

import { useConnectModal } from "@/components/wallet/connect-modal-context";

/**
 * Matches `max_wallets_per_profile()`, lowered from 10 to 3 in migration 0025.
 *
 * Advisory only - it disables the button and writes the caption. The database
 * enforces the real limit, so a client left on the old number is a stale label
 * rather than a way past the cap.
 */
const MAX_WALLETS = 3;

import {
  myWallets,
  setPrimaryWallet,
  unlinkWallet,
  type LinkedWallet,
} from "@/lib/supabase/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { shortenAddress } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LinkedWallets({
  /** The address connected in this browser right now, if any. */
  connectedAddress,
}: {
  connectedAddress?: string | null;
}) {
  const { open: openWallet } = useConnectModal();
  const [wallets, setWallets] = React.useState<LinkedWallet[]>([]);
  const [loading, setLoading] = React.useState(isSupabaseConfigured);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setWallets(await myWallets());
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh, connectedAddress]);

  /*
   * Re-read when the tab regains focus.
   *
   * Linking runs through a wallet extension: the user leaves this tab, approves
   * a signature in a popup, and `auth-provider` posts it while they are away.
   * Without this the list they come back to is the one rendered before they
   * left, so a wallet they just linked appears not to have linked - and the
   * obvious response to that is to try again.
   */
  React.useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const act = React.useCallback(
    async (address: string, run: () => Promise<unknown>) => {
      setBusy(address);
      setError(null);
      try {
        await run();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(null);
      }
    },
    [refresh]
  );

  if (!isSupabaseConfigured) return null;

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Linked wallets
      </h3>

      {loading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : wallets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No wallets linked yet. Link one and approve the signature to attach it
          to this account.
        </p>
      ) : (
        <ul className="space-y-2">
          {wallets.map((wallet) => (
            <li
              key={wallet.address}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
            >
              <div className="flex items-center gap-2">
                <Wallet className="size-4 shrink-0 text-muted-foreground" />
                <span
                  className="flex-1 truncate font-mono text-xs text-white"
                  data-no-translate
                >
                  {shortenAddress(wallet.address)}
                </span>
                {wallet.isPrimary && (
                  <span className="flex items-center gap-1 rounded-full bg-brand-green/10 px-2 py-0.5 text-[10px] font-semibold text-brand-green">
                    <Check className="size-3" />
                    Main
                  </span>
                )}
                {wallet.address === connectedAddress && (
                  <span className="rounded-full bg-brand-purple/10 px-2 py-0.5 text-[10px] font-semibold text-brand-purple">
                    Connected
                  </span>
                )}
              </div>

              <div className="mt-2 flex gap-2">
                {!wallet.isPrimary && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled={busy !== null}
                    onClick={() =>
                      void act(wallet.address, () =>
                        setPrimaryWallet(wallet.address)
                      )
                    }
                  >
                    <Star
                      className={cn(
                        "size-3.5",
                        busy === wallet.address && "animate-pulse"
                      )}
                    />
                    Make main
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(wallet.address, () => unlinkWallet(wallet.address))
                  }
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}

      {/*
        The way *in*.

        This panel shipped with Remove and "Make main" and no way to add a
        wallet at all, which made a screen about managing several wallets usable
        only for taking them away. Linking happens through the same connect
        modal as everywhere else: choosing a wallet there triggers the
        auto-link in `auth-provider.tsx`, which issues the challenge, has the
        wallet sign it and posts it to the `link-wallet` Edge Function. There is
        no separate "link" path to keep in step, and no way to reach a linked
        row without a signature.
      */}
      <Button
        variant="outline"
        size="sm"
        className="mt-4 w-full"
        onClick={openWallet}
        disabled={busy !== null || wallets.length >= MAX_WALLETS}
      >
        <Plus className="size-3.5" />
        {wallets.length === 0 ? "Link a wallet" : "Link another wallet"}
      </Button>

      <p className="mt-3 text-xs text-muted-foreground">
        {wallets.length >= MAX_WALLETS
          ? `You have reached the limit of ${MAX_WALLETS} linked wallets. Remove one to link another.`
          : `Up to ${MAX_WALLETS} wallets can share this account. Your tickets, friends and reputation belong to the account, not to any one wallet.`}
      </p>
    </div>
  );
}
