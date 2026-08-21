/**
 * The on-chain event claim.
 *
 * The memo format is a three-way contract: this module, the app's
 * `services/solana/event-claim.ts`, and the `claim-event` Edge Function, which
 * re-implements `memoClaimsEvent` in Deno because it cannot import from either.
 * These tests pin the properties that verifier depends on - and, more
 * importantly, the ones that stop a claim from being reusable.
 */

import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  CLAIM_MEMO_PREFIX,
  buildEventClaimMemo,
  eventClaimInstruction,
  memoClaimsEvent,
} from "./event-claim";
import { MEMO_PROGRAM_ID } from "./memo";

const EVENT = "a94b27c1-625d-48c0-93cd-dc7a3ef20ec8";
const OTHER_EVENT = "ffffffff-0000-0000-0000-000000000000";
const HOST = new PublicKey("HUTXvjrFNbyCYeu9GxpK5aGYmuyAFC6HHECC781Pw5oJ");

describe("buildEventClaimMemo", () => {
  it("names the event and the host", () => {
    const memo = buildEventClaimMemo(EVENT, HOST.toBase58());
    expect(memo).toContain(CLAIM_MEMO_PREFIX);
    expect(memo).toContain(EVENT);
    expect(memo).toContain(HOST.toBase58());
  });

  /*
   * The whole memo has to fit the 320-byte budget `truncateMemoBytes` enforces,
   * or the claim arrives on-chain with its tail cut off. Comfortably inside it
   * today, but "comfortably" is worth a test rather than an assumption, since
   * the format is meant to gain fields over time.
   */
  it("fits the memo byte budget with room to grow", () => {
    const memo = buildEventClaimMemo(EVENT, HOST.toBase58());
    expect(Buffer.byteLength(memo, "utf8")).toBeLessThan(200);
  });

  /*
   * The website and the app must produce the same shape, or a claim signed in
   * a browser fails to verify for a host looking at their phone. Asserted as a
   * literal so a change here has to be made in both places deliberately.
   */
  it("uses the format the app and the verifier expect", () => {
    const memo = buildEventClaimMemo(EVENT, HOST.toBase58());
    expect(memo).toMatch(
      new RegExp(`^${CLAIM_MEMO_PREFIX} event=${EVENT} host=\\S+ at=\\S+$`),
    );
  });
});

describe("memoClaimsEvent", () => {
  it("accepts a claim for this event", () => {
    expect(
      memoClaimsEvent(buildEventClaimMemo(EVENT, HOST.toBase58()), EVENT),
    ).toBe(true);
  });

  /*
   * The failure this prevents: one signature, presented as the claim for every
   * event a host publishes. Without the id in the memo, any Eventerz claim
   * would verify against any event.
   */
  it("rejects a claim for a different event", () => {
    expect(memoClaimsEvent(buildEventClaimMemo(OTHER_EVENT, HOST.toBase58()), EVENT)).toBe(
      false,
    );
  });

  /*
   * And the mirror of it: a memo that merely mentions the event id - a payment
   * note, a message someone quoted into a transfer - is not an authorship
   * claim. Requiring the prefix as well is what separates the two.
   */
  it("rejects an unrelated memo that happens to mention the event", () => {
    expect(memoClaimsEvent(`thanks for the ticket to ${EVENT}`, EVENT)).toBe(false);
  });

  it("rejects an empty memo", () => {
    expect(memoClaimsEvent("", EVENT)).toBe(false);
  });

  it("matches the event id case-insensitively", () => {
    const memo = buildEventClaimMemo(EVENT.toUpperCase(), HOST.toBase58());
    expect(memoClaimsEvent(memo, EVENT)).toBe(true);
  });
});

describe("eventClaimInstruction", () => {
  it("targets SPL Memo", () => {
    expect(
      eventClaimInstruction(EVENT, HOST).programId.equals(MEMO_PROGRAM_ID),
    ).toBe(true);
  });

  /*
   * The signer account is what makes this an attestation rather than a note.
   * Memo v2 verifies that every account handed to it signed the transaction, so
   * with the host named, the program itself has checked that this address
   * signed this text - and the Edge Function's signer check has something to
   * match against beyond "whoever paid the fee".
   */
  it("names the host as a signer", () => {
    const instruction = eventClaimInstruction(EVENT, HOST);
    expect(instruction.keys).toHaveLength(1);
    expect(instruction.keys[0]!.pubkey.equals(HOST)).toBe(true);
    expect(instruction.keys[0]!.isSigner).toBe(true);
    // Nothing is written. A writable flag here would be a lie about what the
    // transaction touches, and wallets surface exactly that in their preview.
    expect(instruction.keys[0]!.isWritable).toBe(false);
  });

  it("carries a memo the verifier will accept", () => {
    const decoded = eventClaimInstruction(EVENT, HOST).data.toString("utf8");
    expect(memoClaimsEvent(decoded, EVENT)).toBe(true);
  });

  /*
   * No transfer, no lamports, nothing writable. Creating an event is free, and
   * this is the test that says so at the instruction level rather than in a
   * comment - a `SystemProgram.transfer` appearing beside this memo would be a
   * charge nobody disclosed.
   */
  it("moves no money", () => {
    const instruction = eventClaimInstruction(EVENT, HOST);
    expect(instruction.programId.equals(MEMO_PROGRAM_ID)).toBe(true);
    expect(instruction.keys.some((key) => key.isWritable)).toBe(false);
  });
});
