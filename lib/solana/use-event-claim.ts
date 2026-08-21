'use client';

/**
 * Sign a host's on-chain claim from the browser wallet, then have the server
 * verify it.
 *
 * Two steps that must both happen, in this order, and only the second one puts
 * anything in the database:
 *
 *   1. The wallet signs and sends a memo-only transaction naming the event.
 *   2. `claim-event` reads that transaction back off the cluster, checks the
 *      signer is a wallet linked to this host and the memo names this event,
 *      and only then writes `events.onchain_signature`.
 *
 * Step 2 is not a formality. The browser could send any string it liked, which
 * is exactly why `onchain_signature` has no client write grant - see migration
 * 0017 and the Edge Function's header. Nothing here can shortcut it.
 *
 * Kept in step with `Eventerz dApp/src/services/event-claim-service.ts`. Same
 * memo, same verifier, same never-throws contract.
 */

import * as React from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isWalletCancellation, describeSigningError } from '@/lib/wallet-errors';

import { SOLANA_CLUSTER, explorerTxUrl } from './cluster';
import { confirmSignature } from './confirm';
import { eventClaimInstruction } from './event-claim';
import { computeBudgetInstructions } from './priority-fee';

export type ClaimFailure =
  /** The wallet popup was closed or the request declined. Not an error. */
  | 'cancelled'
  /** Signed and sent, but the server would not or could not attach it. */
  | 'unverified'
  /** Never reached the chain. */
  | 'send-failed'
  /** No wallet connected, so there is nothing to sign with. */
  | 'no-wallet';

export interface ClaimResult {
  ok: boolean;
  failure?: ClaimFailure;
  signature?: string;
  explorerUrl?: string;
  /** Safe to show a host. Never a raw RPC string. */
  message?: string;
}

/**
 * Ask the server to verify and record a signature that is already on-chain.
 *
 * Exported separately because it is independently useful: a claim whose
 * transaction landed but whose verification call failed is recoverable by
 * calling this again, with no second signature and no second network fee. The
 * transaction is already public; re-signing would only cost the host another
 * 5,000 lamports to prove the same fact twice.
 */
export async function recordEventClaim(
  eventId: string,
  signature: string,
): Promise<ClaimResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    // Unconfigured build. The transaction is already on-chain and public, so
    // this is recoverable later rather than lost - which is why the signature
    // is handed back rather than swallowed.
    return {
      ok: false,
      failure: 'unverified',
      signature,
      message: 'The claim was signed but could not be recorded yet.',
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('claim-event', {
      body: { eventId, signature, cluster: SOLANA_CLUSTER },
    });

    if (error) {
      return {
        ok: false,
        failure: 'unverified',
        signature,
        message: 'The claim was signed but could not be recorded yet.',
      };
    }

    const result = data as { claimed?: boolean; detail?: string } | null;
    if (result?.claimed) return { ok: true, signature };

    return {
      ok: false,
      failure: 'unverified',
      signature,
      // The function's `detail` is written for a host to read. Passing it
      // through beats replacing it with something vaguer.
      message: result?.detail ?? 'The claim could not be verified yet.',
    };
  } catch {
    return {
      ok: false,
      failure: 'unverified',
      signature,
      message: 'The claim was signed but could not be recorded yet.',
    };
  }
}

export function useEventClaim() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [signing, setSigning] = React.useState(false);

  /**
   * Sign a claim for `eventId`, then record it.
   *
   * **Never throws.** Every failure is a `ClaimResult`, because every caller so
   * far is publishing an event that already exists and must not be undone by a
   * closed wallet popup. A thrown error here would propagate into a create flow
   * whose event is already live, and turn "your claim is not signed" into
   * "publishing failed" - which would be a lie, and would send the host back
   * through the form to make a duplicate.
   */
  const claim = React.useCallback(
    async (eventId: string): Promise<ClaimResult> => {
      if (!connected || !publicKey) {
        return {
          ok: false,
          failure: 'no-wallet',
          message: 'Connect a wallet to sign the claim.',
        };
      }

      setSigning(true);
      try {
        /*
         * Priority fee. A claim that bids nothing is last in line and, on a
         * busy network, is simply not included before its blockhash expires -
         * the wallet reports "sent", nothing lands, and the host is told their
         * claim did not verify. `simple` is the smallest budget available and
         * is the right one for a memo: it writes no account.
         */
        const budget = await computeBudgetInstructions('memo', [publicKey]);

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash();

        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash,
          lastValidBlockHeight,
        })
          .add(...budget)
          .add(eventClaimInstruction(eventId, publicKey));

        const signature = await sendTransaction(transaction, connection);

        /*
         * A signature means submitted, not succeeded - and the verifier will
         * reject a failed transaction anyway. Confirming here turns "the server
         * says your claim is invalid" into the accurate "it did not land",
         * which is the difference between a host retrying and a host filing a
         * bug.
         */
        const result = await confirmSignature(
          connection,
          { signature, blockhash, lastValidBlockHeight },
          'confirmed',
        );
        if (result.value.err) {
          return {
            ok: false,
            failure: 'send-failed',
            message:
              'The network rejected the claim. Check your SOL balance covers the network fee.',
          };
        }

        const recorded = await recordEventClaim(eventId, signature);
        return { ...recorded, explorerUrl: explorerTxUrl(signature) };
      } catch (error) {
        if (isWalletCancellation(error)) {
          return { ok: false, failure: 'cancelled' };
        }
        return {
          ok: false,
          failure: 'send-failed',
          // `describeSigningError` returns null for anything it cannot phrase
          // safely, rather than leaking a library error to a host.
          message: describeSigningError(error) ?? 'The claim could not be signed.',
        };
      } finally {
        setSigning(false);
      }
    },
    [connected, connection, publicKey, sendTransaction],
  );

  return { claim, signing, canClaim: connected && Boolean(publicKey) };
}
