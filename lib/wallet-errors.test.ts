import { describe, expect, it } from "vitest";

import {
  describeSigningError,
  describeWalletError,
  isWalletCancellation,
} from "./wallet-errors";

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

/**
 * Paying is not connecting.
 *
 * The transfer dialog used to test `err.message` against a local
 * "user rejected|declined|denied" regex. Closing the wallet popup - the most
 * ordinary way to back out in a browser - throws `WalletWindowClosedError`, and
 * wallet-adapter carries that meaning in `error.name`, which the local regex
 * never looked at. So backing out of a transfer showed a red error box.
 */
describe("describeSigningError", () => {
  it("recognises the browser's real cancellation, which lives in `name`", () => {
    const closed = adapterError("WalletWindowClosedError");
    expect(isWalletCancellation(closed)).toBe(true);
    expect(describeSigningError(closed)).toBeNull();

    // ...and the local regex the dialog used could not see it.
    expect(/user rejected|declined|denied/i.test(closed.message)).toBe(false);
  });

  it("does not offer 'continue with Google' as a way to send SOL", () => {
    const shown = describeSigningError(adapterError("SomethingNew"));
    expect(shown).not.toMatch(/Google/i);
    expect(shown).not.toMatch(/could not be connected/i);
    expect(shown).toMatch(/Nothing has been charged/i);
  });

  it("keeps a sentence the transfer flow wrote itself", () => {
    // Thrown by the dialog when a confirmed transaction carries an error.
    expect(
      describeSigningError(new Error("The network rejected that transfer.")),
    ).toBe("The network rejected that transfer.");
  });

  it("does not glue the error name onto our own sentence", () => {
    // `messageOf` tags errors as `${name} ${message}` for pattern matching; the
    // text shown must be the message alone.
    const shown = describeSigningError(
      new Error("Your wallet does not have enough SOL for this."),
    );
    expect(shown).toBe("Your wallet does not have enough SOL for this.");
    expect(shown).not.toMatch(/^Error /);
  });

  it("still refuses class names and runtime errors", () => {
    const inputs: unknown[] = [
      adapterError("WalletSendTransactionError"),
      new TypeError("Cannot read property 'toBase58' of undefined"),
      "TypeError: undefined is not an object",
      null,
      42,
      {},
    ];

    for (const input of inputs) {
      const shown = describeSigningError(input);
      if (shown === null) continue;
      expect(shown).not.toMatch(/Wallet\w*Error|TypeError|Cannot read propert/);
      expect(shown).toMatch(/[.!]$/);
    }
  });
});
