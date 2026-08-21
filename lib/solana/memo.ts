/**
 * SPL Memo - the only part of a transaction a wallet can read aloud.
 *
 * # Why this exists
 *
 * The send-crypto dialog has always had a memo field. What the user typed was
 * written to `payments.memo` and rendered in the chat receipt - and never
 * reached the chain. The transaction was a bare `SystemProgram.transfer`, so
 * the wallet's approval sheet could only say "transfer N SOL to <address>", and
 * anyone checking the signature on an explorer found no note at all.
 *
 * That makes the receipt a claim the chain cannot corroborate: the app shows a
 * memo beside a signature that does not carry one. The wallet prompt is also
 * the last thing a person reads before money moves, and it was the least
 * informative surface in the flow.
 *
 * # Parity
 *
 * A 1:1 port of `Eventerz dApp/src/services/solana/memo.ts`, maintained by hand
 * like `lib/solana/amount.ts` ⇄ `src/utils/amount.ts`. Both suites assert the
 * same behaviour so drift is visible; see the note in `HANDOFF.md` about a
 * shared package being the real fix.
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js";

/** SPL Memo v2 - what explorers and wallets decode. */
export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

/**
 * Conservative byte budget.
 *
 * A transaction has a hard 1232-byte limit, and an over-long memo does not
 * degrade gracefully - it makes the whole transfer fail to serialise, turning a
 * long note into a payment that cannot be sent at all.
 */
export const MAX_MEMO_BYTES = 320;

/**
 * Trim to a byte budget without splitting a character.
 *
 * The limit is bytes; UTF-8 characters are one to four of them. Cutting at a
 * byte offset can leave a dangling continuation sequence, which is not valid
 * UTF-8 and renders as a replacement glyph wherever it is shown next - so any
 * partial character at the end is dropped rather than kept.
 */
export function truncateMemoBytes(text: string): Buffer {
  let bytes = Buffer.from(text, "utf8");
  if (bytes.length <= MAX_MEMO_BYTES) return bytes;

  bytes = bytes.subarray(0, MAX_MEMO_BYTES);

  // Walk back over continuation bytes (10xxxxxx)...
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1]! & 0b1100_0000) === 0b1000_0000) {
    end -= 1;
  }
  // ...then drop the lead byte they belonged to, if it is now orphaned.
  if (end > 0 && (bytes[end - 1]! & 0b1000_0000) !== 0) {
    end -= 1;
  }

  return bytes.subarray(0, end);
}

/** The instruction that puts `text` on-chain beside a transfer. */
export function memoInstruction(
  text: string,
  signer?: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    /*
     * Beside a transfer, pass nothing: Memo v2 accepts zero accounts, and
     * naming the payer adds nothing the transfer does not already prove.
     *
     * In a **memo-only** transaction there is no transfer to prove anything,
     * and the distinction stops being cosmetic. Memo v2 verifies that every
     * account handed to it signed the transaction, so a named signer is the
     * difference between a note and an attestation. See `event-claim.ts`.
     */
    keys: signer ? [{ pubkey: signer, isSigner: true, isWritable: false }] : [],
    programId: MEMO_PROGRAM_ID,
    data: truncateMemoBytes(text),
  });
}
