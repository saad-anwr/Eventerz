/**
 * Wallet failures, in words a person can act on - the web mirror of the dApp's
 * `src/services/wallet/errors.ts`.
 *
 * # Why this is a deliberate 1:1 port
 *
 * The two apps have to fail the same way, not just look the same. The whole
 * reason to test onboarding on a Vercel preview instead of waiting on an APK is
 * that what you see in the browser predicts what a reviewer sees on a phone -
 * and that only holds if the failure paths agree, since the failure path is
 * exactly what the dApp Store rejection was about.
 *
 * The underlying errors differ (`@solana/wallet-adapter-base` throws typed
 * errors; Mobile Wallet Adapter surfaces native Android ones), so the *inputs*
 * are matched separately here. The **outputs** are kept identical wherever the
 * situation is the same, and `errors.test.ts` on both sides asserts the shared
 * strings so they cannot drift apart silently.
 *
 * # The rule
 *
 * Nothing from a wallet reaches a user unmapped. `describeWalletError` always
 * returns a sentence, or `null` when the user simply cancelled and should be
 * shown nothing at all. It never falls through to the raw message: at this
 * boundary the raw text is a library error name, not a sentence written for
 * anybody.
 */

/** No extension installed, or the adapter never became ready. */
const NOT_INSTALLED =
  /WalletNotReadyError|WalletNotFoundError|not (?:been )?(?:installed|detected|ready)|no installed wallet/i;

/**
 * A cancelled connection is a decision, not a failure.
 *
 * Closing the extension popup throws `WalletWindowClosedError`; declining in it
 * throws a `WalletConnectionError` whose message says the user rejected the
 * request. Neither deserves a red toast - the user did what they meant to.
 */
const CANCELLED =
  /WalletWindowClosedError|WalletWindowBlockedError|CancellationException|user rejected|user denied|declined|cancell?ed|aborted/i;

/** The adapter could not be selected or loaded at all. */
const UNAVAILABLE = /WalletNotSelectedError|WalletLoadError|WalletConfigError/i;

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    // Wallet-adapter errors carry the meaning in `name`, not always in `message`.
    return `${error.name} ${error.message}`;
  }
  return typeof error === "string" ? error : "";
}

export function isWalletCancellation(error: unknown): boolean {
  const message = messageOf(error);
  // Order matters: "not installed" must not be read as a cancellation, and some
  // adapters report it with a closed window wrapped around it.
  if (NOT_INSTALLED.test(message)) return false;
  return CANCELLED.test(message);
}

/**
 * Turn any wallet failure into a sentence.
 *
 * @returns A message to show, or `null` when the user cancelled and should be
 *   shown nothing.
 */
export function describeWalletError(error: unknown): string | null {
  const message = messageOf(error);

  if (NOT_INSTALLED.test(message)) {
    return "No Solana wallet was found in this browser. Install one - or continue with Google, which needs no wallet.";
  }

  if (isWalletCancellation(error)) return null;

  if (UNAVAILABLE.test(message)) {
    return "That wallet could not be loaded. Try another, or continue with Google.";
  }

  if (/network|timeout|unreachable|failed to fetch/i.test(message)) {
    return "Could not reach the network while connecting. Check your connection and try again.";
  }

  /*
   * Anything unrecognised. Deliberately does *not* fall through to the raw
   * message - everything reaching this line is a library error name or a
   * TypeError, and showing either is what put a stack-trace fragment in front
   * of a store reviewer on the mobile side.
   */
  return "That wallet could not be connected. You can try again, or continue with Google.";
}
