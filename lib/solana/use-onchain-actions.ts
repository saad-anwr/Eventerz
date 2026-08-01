'use client';

/**
 * On-chain actions, wired to the browser wallet.
 *
 * Every action here is **additive and optional**. RSVPs, tickets and check-ins
 * are real Postgres records; the chain adds a proof anyone can verify without
 * trusting Eventerz. So when no program is deployed - the state until
 * `NEXT_PUBLIC_EVENTERZ_PROGRAM_ID` is set - these report "unavailable" and the
 * database path runs untouched. Gating RSVP on a program that does not exist
 * would break a working feature to protect a promise nobody made yet.
 *
 * The same reasoning applies when a program *is* deployed but the on-chain leg
 * fails. `claimSeat` returning null is not an error the caller has to handle:
 * the guest still gets their seat, and the account can be claimed later. The
 * failure that matters is the reverse - telling someone their ticket is on-chain
 * when it is not - and that cannot happen here, because the signature is only
 * ever reported after the cluster confirms it.
 */

import * as React from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, type TransactionInstruction } from '@solana/web3.js';

import { computeBudgetInstructions, type ComputeKind } from './priority-fee';
import {
  cancelEventInstruction,
  checkInInstruction,
  claimSeatInstruction,
  createEventInstruction,
  decodeEventAccount,
  eventPda,
  eventerzProgramId,
  explorerTxUrl,
  releaseSeatInstruction,
  type OnChainEvent,
} from './eventerz-program';

export interface OnChainOutcome {
  signature: string;
  explorerUrl: string;
}

/**
 * `null` means "not attempted", which is different from a thrown error.
 *
 * Callers treat null as "carry on with the database write" and an exception as
 * "the user asked for this and it did not happen".
 */
type Maybe = Promise<OnChainOutcome | null>;

export function useOnChainActions() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const programId = React.useMemo(() => eventerzProgramId(), []);
  const available = Boolean(programId) && connected && Boolean(publicKey);

  /** Build, sign, send, confirm. The only place that talks to the cluster. */
  const submit = React.useCallback(
    async (
      instruction: TransactionInstruction,
      kind: ComputeKind = 'simple',
    ): Promise<OnChainOutcome> => {
      if (!publicKey) throw new Error('Connect a wallet first.');

      /*
       * Priority fee, or this may never land. Mainnet orders by fee per compute
       * unit, and a transaction bidding nothing is not included while the
       * network is busy - it just expires. See `priority-fee`.
       */
      const budget = await computeBudgetInstructions(
        kind,
        instruction.keys.filter((k) => k.isWritable).map((k) => k.pubkey),
      );

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      })
        .add(...budget)
        .add(instruction);

      const signature = await sendTransaction(transaction, connection);

      const result = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );
      if (result.value.err) {
        throw new Error('The network rejected that transaction.');
      }

      return { signature, explorerUrl: explorerTxUrl(signature) };
    },
    [connection, publicKey, sendTransaction],
  );

  /**
   * Publish the event account. Host only, and idempotent in practice - the PDA
   * already existing makes a second call fail in the runtime, which the caller
   * reads as "already published".
   */
  const publishEvent = React.useCallback(
    async (args: {
      eventId: string;
      capacity: number;
      startsAt: string;
      endsAt?: string | null;
      requiresApproval?: boolean;
      priceLamports?: bigint;
    }): Maybe => {
      if (!programId || !publicKey) return null;
      return submit(
        createEventInstruction({ ...args, host: publicKey }, programId),
        'createEvent',
      );
    },
    [programId, publicKey, submit],
  );

  /**
   * Take a seat on-chain.
   *
   * Needs the host's wallet as well as the attendee's: a paid event settles the
   * price to the host inside the same instruction, so the host account has to be
   * writable in the transaction. A host with no linked wallet therefore cannot
   * have on-chain seats - which is correct, since there would be nowhere to send
   * the money.
   */
  const claimSeat = React.useCallback(
    async (eventId: string, hostWallet: string | null | undefined): Maybe => {
      if (!programId || !publicKey || !hostWallet) return null;
      const { PublicKey } = await import('@solana/web3.js');
      return submit(
        claimSeatInstruction(
          eventId,
          publicKey,
          new PublicKey(hostWallet),
          programId,
        ),
        'claimSeat',
      );
    },
    [programId, publicKey, submit],
  );

  /** Give up a seat, reclaiming the account's rent. */
  const releaseSeat = React.useCallback(
    async (eventId: string): Maybe => {
      if (!programId || !publicKey) return null;
      return submit(releaseSeatInstruction(eventId, publicKey, programId));
    },
    [programId, publicKey, submit],
  );

  /** Attest attendance. Host only. */
  const checkIn = React.useCallback(
    async (eventId: string, attendeeWallet: string): Maybe => {
      if (!programId || !publicKey) return null;
      const { PublicKey } = await import('@solana/web3.js');
      return submit(
        checkInInstruction(
          eventId,
          new PublicKey(attendeeWallet),
          publicKey,
          programId,
        ),
      );
    },
    [programId, publicKey, submit],
  );

  /** Mark the event cancelled on-chain. Host only, one-way. */
  const cancelOnChain = React.useCallback(
    async (eventId: string): Maybe => {
      if (!programId || !publicKey) return null;
      return submit(cancelEventInstruction(eventId, publicKey, programId));
    },
    [programId, publicKey, submit],
  );

  /**
   * Read the event account, or null when there is none.
   *
   * Null covers three cases the caller does not need to distinguish: no program
   * deployed, an event published before it was, and an RPC that could not be
   * reached. All three mean "nothing to show on-chain right now".
   */
  const readEvent = React.useCallback(
    async (eventId: string): Promise<OnChainEvent | null> => {
      if (!programId) return null;
      try {
        const info = await connection.getAccountInfo(
          eventPda(eventId, programId),
        );
        return info ? decodeEventAccount(info.data) : null;
      } catch {
        return null;
      }
    },
    [connection, programId],
  );

  return {
    /** True when an on-chain action can actually be attempted right now. */
    available,
    /** True when a program is deployed at all, regardless of wallet state. */
    deployed: Boolean(programId),
    programId,
    publishEvent,
    claimSeat,
    releaseSeat,
    checkIn,
    cancelOnChain,
    readEvent,
  };
}
