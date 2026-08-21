"use client";

/**
 * The host's on-chain claim, on the event page.
 *
 * Two jobs, and the second is the one that makes the create flow honest. When
 * publishing, a host can close the wallet popup - the event goes live anyway,
 * and they are told they can sign later. This is "later". Without it that
 * promise is one the app does not keep, and an event would be permanently
 * unclaimable because of one mis-click.
 *
 * Host-only. There is nothing here a guest can act on, and a guest seeing
 * "unclaimed" would read it as a warning about the event rather than a task
 * belonging to someone else.
 *
 * Mirrors `Eventerz dApp/src/features/create/event-claim-section.tsx`.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { explorerTxUrl } from "@/lib/solana/cluster";
import { useEventClaim } from "@/lib/solana/use-event-claim";

export function EventClaimPanel({
  eventId,
  signature,
}: {
  eventId: string;
  /** Undefined means unclaimed - an ordinary state, not a broken one. */
  signature?: string;
}) {
  const router = useRouter();
  const { claim, signing, canClaim } = useEventClaim();
  const [error, setError] = React.useState("");

  const sign = async () => {
    setError("");
    // Never throws - every outcome is a result. See `useEventClaim`.
    const result = await claim(eventId);

    if (result.ok) {
      // Re-fetch the server component so the signed state replaces the button.
      router.refresh();
      return;
    }
    // Closing the popup is a decision, not a fault, and nothing changed.
    if (result.failure === "cancelled") return;

    setError(result.message ?? "The claim could not be signed.");
  };

  if (signature) {
    return (
      <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3.5">
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-100">
            Claim signed on Solana
          </p>
          <a
            href={explorerTxUrl(signature)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-emerald-200/80 hover:text-emerald-100"
          >
            View on Solana Explorer
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm font-semibold">No on-chain claim yet</p>
      </div>
      {/*
        States the cost before the button, for the same reason the create page
        does: a wallet popup that opens without warning is read as a charge.
        There is no platform fee here at all - only Solana's own network fee.
      */}
      <p className="mt-1 text-xs text-muted-foreground">
        Sign a short message recording that you published this event. No fee is
        charged and no SOL is sent - only the Solana network fee, a fraction of
        a cent.
      </p>

      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={signing || !canClaim}
        onClick={sign}
      >
        {signing && <Loader2 className="size-3.5 animate-spin" />}
        {signing ? "Sign in your wallet..." : "Sign the on-chain claim"}
      </Button>

      {/* Said plainly rather than left to a disabled button with no reason. */}
      {!canClaim && (
        <p className="mt-2 text-xs text-muted-foreground">
          Connect your wallet to sign.
        </p>
      )}
    </div>
  );
}
