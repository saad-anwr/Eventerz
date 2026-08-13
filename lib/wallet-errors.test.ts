import { describe, expect, it } from "vitest";

import { describeWalletError, isWalletCancellation } from "./wallet-errors";

/**
 * The parity suite for wallet failures.
 *
 * This mirrors the dApp's `src/services/wallet/errors.test.ts`. The two modules
 * are hand-maintained ports, and the failure mode of drift is not a crash - it
 * is a Vercel preview that says one thing and an APK that says another, which
 * defeats the entire reason for testing onboarding on the web first.
 *
 * The literal strings asserted below are the contract, not an implementation
 * detail: where the situation is the same on both platforms, the sentence shown
 * has to be the same too.
 */

/** Wallet-adapter errors carry their meaning in `name`. */
function adapterError(name: string, message = ""): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("the failure that must never be shown raw", () => {
  it("never leaks a TypeError", () => {
    const shown = describeWalletError(
      new TypeError("Cannot read property 'slice' of null"),
    );
    expect(shown).not.toBeNull();
    expect(shown).not.toMatch(/slice|null|TypeError/i);
    expect(shown).toMatch(/could not be connected/i);
  });

  it("never leaks an adapter error name", () => {
    const shown = describeWalletError(adapterError("WalletSignTransactionError"));
    expect(shown).not.toMatch(/WalletSignTransactionError/);
  });
});

describe("describeWalletError", () => {
  it("names the real problem when no wallet is installed", () => {
    const shown = describeWalletError(adapterError("WalletNotReadyError"));
    expect(shown).toMatch(/No Solana wallet was found/i);
    // The way out has to be in the message - this is where a visitor with no
    // extension lands, and it is the dead end the modal used to have.
    expect(shown).toMatch(/Google/);
  });

  it("does not read 'not installed' as a cancellation", () => {
    const error = adapterError("WalletNotReadyError", "window closed");
    expect(isWalletCancellation(error)).toBe(false);
    expect(describeWalletError(error)).toMatch(/No Solana wallet was found/i);
  });

  it("says nothing when the user closed the popup", () => {
    expect(describeWalletError(adapterError("WalletWindowClosedError"))).toBeNull();
    expect(
      describeWalletError(
        adapterError("WalletConnectionError", "User rejected the request."),
      ),
    ).toBeNull();
  });

  it("explains an unloadable adapter", () => {
    expect(describeWalletError(adapterError("WalletLoadError"))).toMatch(
      /could not be loaded/i,
    );
  });

  /*
   * These two sentences are asserted identically in the dApp suite. They are
   * the cases where both platforms mean exactly the same thing, so they say
   * exactly the same thing.
   */
  it("shares its wording with the app where the situation is shared", () => {
    expect(describeWalletError(new Error("Network request failed"))).toBe(
      "Could not reach the network while connecting. Check your connection and try again.",
    );
    expect(describeWalletError(adapterError("SomethingNew"))).toBe(
      "That wallet could not be connected. You can try again, or continue with Google.",
    );
  });

  it("always returns a sentence or nothing", () => {
    const inputs: unknown[] = [
      new Error(""),
      adapterError("WalletError"),
      "TypeError: undefined is not an object",
      null,
      undefined,
      42,
      {},
    ];

    for (const input of inputs) {
      const shown = describeWalletError(input);
      if (shown === null) continue;
      expect(shown.length).toBeGreaterThan(0);
      expect(shown).toMatch(/[.!]$/);
    }
  });
});
