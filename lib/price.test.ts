/**
 * Ticket price composition.
 *
 * The `price` column is `text` and shared by the website and the app, so the
 * string these functions produce is the contract between them. A change here
 * that the app's `formatPrice` does not match is a price one product writes and
 * the other cannot read back.
 */

import { describe, expect, it } from "vitest";

import { PRICE_CURRENCIES, formatPrice, sanitizeAmount } from "./price";

describe("PRICE_CURRENCIES", () => {
  /*
   * Pinned as an exact list, not a length. Both entries settle natively on
   * Solana; adding a third is a product decision about what a host can be paid
   * in, and it should fail this test rather than arrive with a UI tweak.
   */
  it("offers SOL and USDC", () => {
    expect(PRICE_CURRENCIES).toEqual(["SOL", "USDC"]);
  });
});

describe("sanitizeAmount", () => {
  it("keeps a plain decimal", () => {
    expect(sanitizeAmount("0.5")).toBe("0.5");
    expect(sanitizeAmount("12")).toBe("12");
  });

  it("strips letters and symbols", () => {
    expect(sanitizeAmount("0.5 SOL")).toBe("0.5");
    expect(sanitizeAmount("$5")).toBe("5");
    expect(sanitizeAmount("half a sol")).toBe("");
  });

  /*
   * `1.2.5` is someone reaching for `1.25`. Keeping the digits and dropping
   * the stray separator is closer to the intent than refusing the keystroke
   * and leaving them to work out which character the field disliked.
   */
  it("collapses a second decimal point rather than rejecting the input", () => {
    expect(sanitizeAmount("1.2.5")).toBe("1.25");
    expect(sanitizeAmount("1.2.3.4")).toBe("1.234");
  });

  it("allows a trailing dot so a decimal can be typed", () => {
    // Stripping it would make the field un-typeable: "0." is what exists for
    // one keystroke on the way to "0.5".
    expect(sanitizeAmount("0.")).toBe("0.");
  });
});

describe("formatPrice", () => {
  it("joins the amount to its currency", () => {
    expect(formatPrice("0.5", "SOL")).toBe("0.5 SOL");
    expect(formatPrice("25", "USDC")).toBe("25 USDC");
  });

  /*
   * The currency is never assumed. A USDC price that renders as SOL is off by
   * whatever SOL happens to cost that day, in the host's favour or the guest's
   * depending on the direction - and nothing downstream can detect it, because
   * both are valid strings.
   */
  it("never silently defaults to SOL", () => {
    expect(formatPrice("1", "USDC")).not.toContain("SOL");
  });

  it("reads an empty amount as free", () => {
    expect(formatPrice("", "SOL")).toBe("Free");
    expect(formatPrice("   ", "USDC")).toBe("Free");
  });

  /*
   * Zero collapses to "Free" rather than "0 SOL". A zero-priced ticket looks
   * free to a guest while keeping every paid-path behaviour behind it, so the
   * two are made the same thing here instead of somewhere further downstream
   * where only one of them was handled.
   */
  it("reads a zero amount as free", () => {
    expect(formatPrice("0", "SOL")).toBe("Free");
    expect(formatPrice("0.00", "USDC")).toBe("Free");
  });

  it("refuses to compose an unparseable amount into a price", () => {
    expect(formatPrice(".", "SOL")).toBe("Free");
  });
});
