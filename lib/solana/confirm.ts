import type { Connection } from '@solana/web3.js';

/**
 * Wait for a signature to confirm, over plain HTTP.
 *
 * # Why not `connection.confirmTransaction`
 *
 * web3.js confirms by opening a WebSocket and calling `signatureSubscribe`.
 * That works against Helius directly and cannot work through `/api/rpc`: a
 * Next.js route handler serves HTTP, so the derived `wss://…/api/rpc` has
 * nothing listening. The failure is the worst shape available - the transaction
 * lands on-chain, the socket never answers, and the UI sits on "confirming"
 * while the user's money has already moved.
 *
 * So confirmation polls `getSignatureStatuses` instead. It is a handful of
 * extra requests on a path that already costs a network round trip and a wallet
 * prompt, and it removes the last thing that needed a direct connection.
 *
 * # Why the block height matters
 *
 * A blockhash expires after ~150 blocks. Polling on a signature alone cannot
 * tell "not confirmed yet" from "never will be", so a dropped transaction would
 * spin until an arbitrary timeout and then report something vague. Comparing
 * against `lastValidBlockHeight` gives the honest answer: once the chain passes
 * it, that transaction cannot land, and saying so immediately is both true and
 * more useful than waiting.
 *
 * The return shape matches `confirmTransaction` so call sites keep reading
 * `result.value.err`.
 */

export interface ConfirmStrategy {
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
}

export interface ConfirmResult {
  value: { err: unknown };
}

/** How often to ask. Fast enough to feel immediate, slow enough to be polite. */
const POLL_MS = 1_000;

/**
 * A ceiling in case block height stops advancing.
 *
 * `lastValidBlockHeight` is the real bound; this only stops an infinite loop if
 * the RPC itself starts lying or stalls, which is rare and worth surfacing.
 */
const MAX_WAIT_MS = 90_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Commitment strength, so "have we got there yet" is one comparison. */
const RANK = {
  none: 0,
  processed: 1,
  confirmed: 2,
  finalized: 3,
} as const;

export async function confirmSignature(
  connection: Connection,
  { signature, lastValidBlockHeight }: ConfirmStrategy,
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed',
): Promise<ConfirmResult> {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    /*
     * `searchTransactionHistory` stays false on purpose. It is a much heavier
     * lookup, and a signature this recent is in the status cache - turning it on
     * would make every poll expensive to cover a case that cannot apply yet.
     */
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];

    if (status) {
      if (status.err) return { value: { err: status.err } };

      /*
       * Commitment levels are ordered, so compare rank rather than enumerating
       * pairs - "finalized satisfies a request for confirmed" falls out of the
       * ordering instead of needing its own branch.
       */
      if (RANK[status.confirmationStatus ?? 'none'] >= RANK[commitment]) {
        return { value: { err: null } };
      }
    }

    /*
     * Only meaningful once the status is still absent: a transaction that has a
     * status has landed, and an expired blockhash no longer matters to it.
     */
    if (!status) {
      const height = await connection.getBlockHeight(commitment);
      if (height > lastValidBlockHeight) {
        return {
          value: {
            err: 'Transaction expired before it was confirmed. It did not go through, and nothing has been charged.',
          },
        };
      }
    }

    await sleep(POLL_MS);
  }

  return {
    value: {
      err: 'Timed out waiting for confirmation. The transaction may still land - check the explorer before retrying.',
    },
  };
}
