/**
 * The memo is the wallet's only chance to say what a payment is for.
 *
 * Mirrors `Eventerz dApp/src/services/solana/memo.test.ts` assertion for
 * assertion - these two modules are hand-maintained 1:1 ports, and the suites
 * are what make drift between them visible.
 *
 * The behaviour is pinned because the memo was accepted by the UI, written to
 * `payments.memo`, rendered in the receipt, and then silently dropped before it
 * reached the transaction - so the app displayed a note beside a signature that
 * did not carry one.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_MEMO_BYTES,
  MEMO_PROGRAM_ID,
  memoInstruction,
  truncateMemoBytes,
} from "./memo";

describe("memoInstruction", () => {
  it("targets SPL Memo v2, which is what wallets actually decode", () => {
    expect(MEMO_PROGRAM_ID.toBase58()).toBe(
      "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    );
  });

  it("carries the text as UTF-8 with no accounts", () => {
    const instruction = memoInstruction("Thanks for dinner");
    expect(instruction.programId.equals(MEMO_PROGRAM_ID)).toBe(true);
    expect(instruction.keys).toHaveLength(0);
    expect(instruction.data.toString("utf8")).toBe("Thanks for dinner");
  });
});

describe("truncateMemoBytes", () => {
  it("leaves a normal memo alone", () => {
    const text = "Splitting the taxi";
    expect(truncateMemoBytes(text).toString("utf8")).toBe(text);
  });

  it("caps an over-long memo at the byte budget", () => {
    expect(truncateMemoBytes("a".repeat(MAX_MEMO_BYTES * 2)).length).toBe(
      MAX_MEMO_BYTES,
    );
  });

  /*
   * A user-supplied memo can be any script. Cutting mid-character would emit a
   * dangling continuation byte - invalid UTF-8, which renders as a replacement
   * glyph wherever it is shown next.
   */
  it("never splits a multi-byte character", () => {
    const bytes = truncateMemoBytes("🎟️".repeat(200));

    expect(bytes.length).toBeLessThanOrEqual(MAX_MEMO_BYTES);
    const decoded = bytes.toString("utf8");
    expect(decoded).not.toMatch(/�/);
    expect(Buffer.from(decoded, "utf8").length).toBe(bytes.length);
  });

  it("handles a three-byte script the same way", () => {
    const bytes = truncateMemoBytes("日本語のイベント".repeat(100));
    expect(bytes.length).toBeLessThanOrEqual(MAX_MEMO_BYTES);
    expect(bytes.toString("utf8")).not.toMatch(/�/);
  });

  it("survives an empty memo", () => {
    expect(truncateMemoBytes("").length).toBe(0);
  });
});
