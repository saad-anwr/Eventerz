'use client';

/**
 * Charge a platform fee from the connected browser wallet, then let the caller
 * proceed.
 *
 * The ordering is the whole point and it only works one way round: the fee is
 * confirmed on-chain *before* the event is created or the RSVP is sent. The
 * other order - act first, charge after - hands out a free event whenever the
 * payment fails, and there is no way to un-create it.
 *
 * The cost of this ordering is the opposite failure: the fee lands and the
 * action then fails. That one is recoverable - the signature is real and
 * support can see it - which is why the error says so explicitly instead of
 * inviting a retry that would charge twice.
 */

import * as React from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

import { IS_MAINNET } from './cluster';
import { explorerTxUrl } from './eventerz-program';
import {
  FEE_LABEL,
  TREASURY_ADDRESS,
  formatFeeSol,
  quoteFee,
  type FeeKind,
  type FeeQuote,
} from './fees';

/** Thrown when the user declined in their wallet. Not an error to shout about. */
export class FeeCancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'FeeCancelled';
  }
}

/**
 * Devnet and testnet SOL is free, so charging there is theatre that only makes
 * testing harder. Mirrors `feesEnabled()` in the mobile app.
 */
export const feesEnabled = (): boolean => IS_MAINNET;

export interface FeePayment {
  signature: string;
  explorerUrl: string;
  quote: FeeQuote;
}

export function useFee(kind: FeeKind) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [paying, setPaying] = React.useState(false);
  const [quote, setQuote] = React.useState<FeeQuote | null>(null);

  /*
   * Quote up front so the button can say what it will cost before it is
   * pressed. A non-refundable charge should never be a surprise that only
   * appears in the wallet popup.
   */
  React.useEffect(() => {
    if (!feesEnabled()) return;
    let cancelled = false;
    void quoteFee(kind)
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      // A failed quote here is not worth surfacing: `pay` re-quotes and will
      // refuse loudly at the point it matters.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [kind]);

  /**
   * Returns the payment when charged, or null when fees are switched off for
   * this cluster. Throws when the fee could not be taken - callers must not
   * proceed on a throw.
   */
  const pay = React.useCallback(async (): Promise<FeePayment | null> => {
    if (!feesEnabled()) return null;

    if (!connected || !publicKey) {
      throw new Error('Connect a wallet to continue.');
    }

    setPaying(true);
    try {
      const fresh = await quoteFee(kind);
      setQuote(fresh);

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(TREASURY_ADDRESS),
          // bigint all the way to the instruction. A number loses precision
          // above 2^53 lamports, and money is the wrong place to find out.
          lamports: fresh.lamports,
        }),
      );

      const signature = await sendTransaction(transaction, connection);

      /*
       * A signature means submitted, not succeeded. On mainnet a transfer still
       * fails for ordinary reasons - most often a balance that covers the fee
       * but not the fee *plus* rent and the network charge. Treating "submitted"
       * as "paid" hands over a paid-for event that nobody paid for.
       *
       * Stopping on a confirmed failure is safe: a failed transaction moved no
       * money, so retrying costs the user nothing.
       */
      const result = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );
      if (result.value.err) {
        throw new Error(
          'The network rejected the payment, so you have not been charged. ' +
            'Check your SOL balance covers the fee plus network costs.',
        );
      }

      return { signature, explorerUrl: explorerTxUrl(signature), quote: fresh };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The fee could not be taken.';

      // Declining is a choice, not a fault - surface it as a cancellation so
      // the caller can stop quietly rather than showing a red error.
      if (/user rejected|declined|denied|cancell?ed/i.test(message)) {
        throw new FeeCancelled();
      }
      throw new Error(message);
    } finally {
      setPaying(false);
    }
  }, [connected, connection, kind, publicKey, sendTransaction]);

  /** `$5 (about 0.0234 SOL)`, or null when fees are off or not yet quoted. */
  const label = React.useMemo(() => {
    if (!feesEnabled() || !quote) return null;
    return `$${quote.usd} (about ${formatFeeSol(quote.lamports)})`;
  }, [quote]);

  return { pay, paying, quote, label, enabled: feesEnabled(), kindLabel: FEE_LABEL[kind] };
}
