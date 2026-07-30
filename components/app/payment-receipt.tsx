"use client";

import * as React from "react";
import { ArrowUpRight, BadgeCheck, Clock3, Coins } from "lucide-react";
import type { PaymentRow } from "@/lib/supabase/types";
import { formatTokenAmount } from "@/lib/solana/amount";
import { cn } from "@/lib/utils";

interface PaymentReceiptProps {
  payment: PaymentRow;
  /** True when the viewer is the sender — flips the wording, not the amount. */
  mine: boolean;
}

function explorerUrl(signature: string, cluster: string): string {
  const suffix = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${suffix}`;
}

/**
 * A transfer, rendered in the thread it was sent from.
 *
 * The verified tick is the whole point of the design. `record_payment` writes
 * receipts with `verified = false` because Postgres cannot make an outbound RPC
 * call and therefore cannot know whether the transaction the client described
 * actually happened; the `verify-payment` Edge Function checks the recipient's
 * balance delta against the cluster and flips it.
 *
 * So an unverified receipt must not look like a verified one. It renders with a
 * clock instead of a tick and says "confirming" — which is true whether it is
 * thirty seconds old or a fabrication, and either way the explorer link is one
 * tap away. Showing every receipt identically would make the tick decorative,
 * and a decorative trust signal is worse than none.
 */
export function PaymentReceipt({ payment, mine }: PaymentReceiptProps) {
  const pretty = formatTokenAmount(payment.amount, payment.decimals, payment.symbol);

  return (
    <a
      href={explorerUrl(payment.signature, payment.cluster)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group block max-w-[78%] rounded-2xl border p-3 transition-colors",
        mine
          ? "rounded-br-md border-brand-green/30 bg-brand-green/[0.08] hover:bg-brand-green/[0.12]"
          : "rounded-bl-md border-brand-cyan/30 bg-brand-cyan/[0.08] hover:bg-brand-cyan/[0.12]",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg",
            mine
              ? "bg-brand-green/15 text-brand-green"
              : "bg-brand-cyan/15 text-brand-cyan",
          )}
        >
          <Coins className="size-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {mine ? "You sent" : "You received"}
          </span>
          <span className="block font-display text-base font-semibold text-white">
            {pretty}
          </span>
        </span>
        <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>

      {payment.memo && (
        <p className="mt-2 border-t border-white/10 pt-2 text-xs leading-relaxed text-white/80">
          {payment.memo}
        </p>
      )}

      <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        {payment.verified ? (
          <>
            <BadgeCheck className="size-3 text-brand-green" />
            Verified on-chain
          </>
        ) : (
          <>
            <Clock3 className="size-3" />
            Confirming — tap to check on Explorer
          </>
        )}
      </p>
    </a>
  );
}
