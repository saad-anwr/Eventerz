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

import { describeSigningError, isWalletCancellation } from '@/lib/wallet-errors';

import { IS_MAINNET } from './cluster';
import { explorerTxUrl } from './cluster';
import { confirmSignature } from './confirm';
import { memoInstruction } from './memo';
import { computeBudgetInstructions } from './priority-fee';
import {
  FEE_LABEL,
  FEE_USD,
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

      const treasury = new PublicKey(TREASURY_ADDRESS);

      /*
       * Priority fee. This is the transaction that decides whether someone gets
       * their event, so it is the last one that should be left sitting
       * unconfirmed because it bid nothing for block space.
       */
      const budget = await computeBudgetInstructions('transfer', [
        publicKey,
        treasury,
      ]);

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      })
        .add(...budget)
        .add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: treasury,
            // bigint all the way to the instruction. A number loses precision
            // above 2^53 lamports, and money is the wrong place to find out.
            lamports: fresh.lamports,
          }),
        );

      /*
       * Say what the money is for, where the user will actually read it.
       *
       * Without this the wallet's approval popup - the last thing anyone sees
       * before a non-refundable charge - could only show "transfer N SOL to
       * HUTXvj…", an address that means nothing to the person being asked to
       * approve it. The mobile app was rejected by the dApp Store for exactly
       * this ("SOL deduction without clarity on what for"); the same transfer
       * is built here, so it carries the same memo.
       */
      transaction.add(
        memoInstruction(
          `Eventerz: ${FEE_LABEL[kind].toLowerCase()} ($${fresh.usd}). Non-refundable.`,
        ),
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
      const result = await confirmSignature(
        connection,
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
      /*
       * Declining is a choice, not a fault - surface it as a cancellation so
       * the caller can stop quietly rather than showing a red error.
       *
       * The test used to be a local regex over `error.message`, which missed
       * the most common way of backing out in a browser: closing the wallet
       * popup throws `WalletWindowClosedError`, and wallet-adapter carries that
       * meaning in `error.name`. So closing the popup on a payment produced a
       * red error instead of a quiet stop. `isWalletCancellation` reads both,
       * and is the same rule the connect flow already uses.
       */
      if (isWalletCancellation(error)) {
        throw new FeeCancelled();
      }

      /*
       * Everything else is translated rather than shown raw. The real sentences
       * this hook throws itself - the SOL price failing, a confirmed on-chain
       * rejection - are preserved by `describeSigningError`; library error
       * names and TypeErrors are not.
       */
      throw new Error(
        describeSigningError(error) ?? 'The fee could not be taken.',
      );
    } finally {
      setPaying(false);
    }
  }, [connected, connection, kind, publicKey, sendTransaction]);

  /**
   * `$5 (about 0.0234 SOL)`, or null only when fees are genuinely off.
   *
   * It used to return null while the quote was still in flight, which meant the
   * *disclosure* was in flight too: every caller renders this behind
   * `{feeLabel && ...}`, so on a slow connection the sentence naming a
   * non-refundable charge simply was not on the page yet - and the submit
   * button was, from first paint. Someone who moved quickly could be charged
   * having never seen a price.
   *
   * The dollar figure is a constant (`FEE_USD`), known without any network
   * call, so there is no reason to withhold it. Only the SOL conversion needs
   * the rate, and it is the half that matters least to a reader.
   */
  const label = React.useMemo(() => {
    if (!feesEnabled()) return null;
    if (!quote) return `$${FEE_USD[kind]}`;
    return `$${quote.usd} (about ${formatFeeSol(quote.lamports)})`;
  }, [kind, quote]);

  return { pay, paying, quote, label, enabled: feesEnabled(), kindLabel: FEE_LABEL[kind] };
}
