"use client";

/**
 * Someone's Solana holdings, rendered next to their wallet address.
 *
 * Mirrors the app's `HoldingsList`. Two rules it shares, both about not lying:
 *
 *  - an unknown dollar value renders as nothing, never as `$0.00`. Null means
 *    "no price source answered", and showing zero turns a missing number into a
 *    false claim about someone's balance.
 *  - a token with no metadata shows its shortened mint rather than a guessed
 *    symbol. A mint is at least true.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins, Wallet } from "lucide-react";

import { getWalletHoldings, type TokenHolding } from "@/lib/solana/holdings";
import { shortenAddress } from "@/lib/format";

/**
 * Significant digits rather than fixed decimals.
 *
 * Token amounts span many orders of magnitude - 0.000021 SOL and 4,200,000
 * BONK are both ordinary. A fixed `toFixed(2)` renders the first as "0.00",
 * which reads as an empty wallet.
 */
function formatAmount(value: number): string {
  if (value === 0) return "0";
  if (value < 0.001) return value.toExponential(2);
  if (value < 1) return value.toPrecision(3);
  if (value < 1_000) return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

const formatUsd = (value: number): string =>
  value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2,
  });

function Row({
  icon,
  title,
  subtitle,
  amount,
  usd,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string | null;
  amount: string;
  usd: number | null;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{title}</p>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm tabular-nums text-white">{amount}</p>
        {/* Only when known. See the note at the top of this file. */}
        {usd !== null && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatUsd(usd)}
          </p>
        )}
      </div>
    </li>
  );
}

function TokenRow({ token }: { token: TokenHolding }) {
  return (
    <Row
      icon={
        token.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={token.imageUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <Coins className="size-4 text-muted-foreground" />
        )
      }
      title={token.symbol ?? shortenAddress(token.mint)}
      subtitle={token.name}
      amount={formatAmount(token.uiAmount)}
      usd={token.usdValue}
    />
  );
}

export function HoldingsCard({
  address,
  title = "Holdings",
  max = 5,
}: {
  address: string;
  title?: string;
  max?: number;
}) {
  const { data, isLoading, isError } = useQuery({
    // Keyed by address, not by profile: the same wallet viewed from two
    // profiles is the same query, and a profile that relinks a wallet must not
    // serve the old one's balances.
    queryKey: ["holdings", address],
    queryFn: () => getWalletHoldings(address),
    staleTime: 60_000,
    enabled: Boolean(address),
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-white/[0.05]" />
          ))}
        </div>
      </div>
    );
  }

  /*
   * A failed read says so instead of rendering an empty list. "No tokens" and
   * "we could not ask" look identical otherwise, and only one of them is a
   * statement about this person's wallet.
   */
  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-muted-foreground">
          Could not read this wallet right now.
        </p>
      </div>
    );
  }

  const tokens = data.tokens.slice(0, max);
  const hidden = data.tokens.length - tokens.length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="mb-1 text-sm font-semibold text-white">{title}</h3>
      <ul className="divide-y divide-white/[0.06]">
        <Row
          icon={<Wallet className="size-4 text-brand-purple" />}
          title="SOL"
          subtitle="Solana"
          amount={formatAmount(data.solBalance)}
          usd={data.solUsdValue}
        />
        {tokens.map((token) => (
          <TokenRow key={token.mint} token={token} />
        ))}
      </ul>

      {tokens.length === 0 && (
        <p className="pt-2 text-xs text-muted-foreground">
          No SPL tokens in this wallet.
        </p>
      )}
      {hidden > 0 && (
        <p className="pt-2 text-xs text-muted-foreground">
          +{hidden} more {hidden === 1 ? "token" : "tokens"}
        </p>
      )}
    </div>
  );
}
