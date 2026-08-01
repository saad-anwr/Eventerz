/**
 * Compute budget and priority fees.
 *
 * # Why a transaction needs this on mainnet
 *
 * On devnet a transaction with no compute-unit price lands every time, because
 * nothing is competing for block space. Mainnet-beta is not that. Leaders order
 * transactions by fee per compute unit, and one that offers nothing sits at the
 * bottom of the queue - during any period of congestion it is simply never
 * included, and roughly 60-90 seconds later its blockhash expires and it dies.
 *
 * From the user's side that is the worst possible failure: the wallet said
 * "sent", the page said "confirming", and then nothing happened. They do not
 * know whether their money moved. It is exactly the failure that makes an app
 * feel broken on mainnet while working perfectly in testing.
 *
 * Kept in step with `Eventerz dApp/src/services/solana/priority-fee.ts` - same
 * limits, same bounds, same percentile. A browser and a phone bidding
 * differently for the same action is a difference nobody would ever think to
 * look for.
 *
 * # Why both instructions, not just the price
 *
 * `setComputeUnitPrice` buys priority. `setComputeUnitLimit` makes it
 * affordable: the priority fee charged is `limit x price`, and the runtime's
 * default limit is 200,000 CU per instruction while a plain transfer uses about
 * 150. Requesting a realistic limit is the difference between a fee of a few
 * thousand lamports and one of a few million.
 */

import { ComputeBudgetProgram, type PublicKey, type TransactionInstruction } from '@solana/web3.js';

import { rpcEndpoint } from './cluster';

/**
 * Compute-unit ceilings per kind of transaction, with roughly 2x of headroom.
 * Under-requesting is fatal - execution aborts once the limit is hit - so the
 * margin is deliberately generous while staying well under the 200,000 default.
 */
export const COMPUTE_UNITS = {
  /** SystemProgram.transfer: ~150 CU, plus the two budget instructions. */
  transfer: 2_000,
  /** Initialises a PDA and writes it. */
  createEvent: 40_000,
  /** Initialises a seat PDA and may transfer the ticket price to the host. */
  claimSeat: 50_000,
  /** Mutates one or two existing accounts. */
  simple: 30_000,
} as const;

export type ComputeKind = keyof typeof COMPUTE_UNITS;

/**
 * Bounds on the price, in micro-lamports per compute unit.
 *
 * The floor exists because a reported zero is common and useless: it means
 * recent blocks were not full, which says nothing about the block this
 * transaction is aiming at. A small non-zero bid costs almost nothing and
 * removes the "landed instantly all week, then never landed on launch day"
 * class of failure.
 *
 * The ceiling exists because this is money. A fee spike can push the observed
 * rate orders of magnitude up for a few minutes, and silently charging a user
 * that because they pressed a button at the wrong moment is not acceptable.
 */
const MIN_MICRO_LAMPORTS = 1_000;
const MAX_MICRO_LAMPORTS = 1_000_000;

let cached: { price: number; at: number } | null = null;
const CACHE_MS = 10_000;

interface PrioritizationFee {
  slot: number;
  prioritizationFee: number;
}

/**
 * What recent blocks charged, for the accounts this transaction writes to.
 *
 * Scoped to the writable accounts on purpose: prioritization is per-account
 * contention, so a network-wide figure over-prices a transaction touching quiet
 * accounts and under-prices one touching a hot program.
 *
 * The 75th percentile rather than the median. The median is the price at which
 * half of recent transactions did *not* get in, and "probably lands" is not the
 * target when the alternative is a user watching a spinner.
 */
async function measurePrice(writableAccounts: string[]): Promise<number> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.price;

  try {
    const response = await fetch(rpcEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'eventerz',
        method: 'getRecentPrioritizationFees',
        // Capped at 128 accounts by the RPC; these calls touch a handful.
        params: [writableAccounts.slice(0, 128)],
      }),
    });
    const body = (await response.json()) as { result?: PrioritizationFee[] };

    const observed = (body.result ?? [])
      .map((f) => f.prioritizationFee)
      .filter((f) => Number.isFinite(f) && f > 0)
      .sort((a, b) => a - b);

    if (observed.length === 0) {
      cached = { price: MIN_MICRO_LAMPORTS, at: Date.now() };
      return MIN_MICRO_LAMPORTS;
    }

    const p75 =
      observed[Math.floor(observed.length * 0.75)] ??
      observed[observed.length - 1];
    const price = Math.min(
      MAX_MICRO_LAMPORTS,
      Math.max(MIN_MICRO_LAMPORTS, Math.ceil(p75)),
    );

    cached = { price, at: Date.now() };
    return price;
  } catch {
    /*
     * A failed measurement must not stop the transaction. The floor is a
     * reasonable bid, and refusing to send because the bid could not be priced
     * would turn a slow RPC into a broken page.
     */
    return MIN_MICRO_LAMPORTS;
  }
}

/** The two instructions to prepend to every transaction. */
export async function computeBudgetInstructions(
  kind: ComputeKind,
  writableAccounts: (PublicKey | string)[],
): Promise<TransactionInstruction[]> {
  const units = COMPUTE_UNITS[kind];
  const price = await measurePrice(writableAccounts.map(String));

  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }),
  ];
}
