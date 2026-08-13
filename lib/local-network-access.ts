/**
 * Chrome's Local Network Access permission - the thing Mobile Wallet Adapter
 * silently never asks for.
 *
 * # The bug
 *
 * MWA on the web reaches the wallet over `ws://localhost:<port>`: the page
 * launches the wallet through a `solana-wallet://` intent, and the wallet opens
 * a socket the page then connects to. Chrome 142 put local-network requests
 * behind a permission - shown on Android as "Apps on device", and as "Local
 * network access" in Chrome 144 and earlier.
 *
 * `@solana-mobile/wallet-standard-mobile` does handle this. Before associating
 * it calls `navigator.permissions.query({ name: 'loopback-network' })`, and on
 * `prompt` it opens its own "Allow connections to your wallet" sheet whose
 * button issues a `fetch('http://localhost')` - the request that makes Chrome
 * ask.
 *
 * But `loopback-network` was the name during the origin trial. Chrome shipped
 * the permission as `local-network-access`, so on any current Chrome that query
 * throws a `TypeError`, and the library's own catch reads the throw as "this
 * browser has no such permission" and returns:
 *
 *     if (e instanceof TypeError && (e.message.includes('loopback-network') ||
 *         e.message.includes('local-network-access'))) return;
 *
 * The sheet therefore never opens, nothing ever calls that fetch, Chrome is
 * never asked, and the WebSocket is refused with no prompt. Which is exactly
 * the reported symptom: no "Allow" popup ever appears, and the site has no
 * "Apps on device" entry in Chrome's site settings at all - not blocked,
 * *absent*, because the site never asked.
 *
 * So this module does the library's job with the name Chrome actually ships.
 *
 * @see https://developer.chrome.com/blog/local-network-access
 */

export type LocalNetworkAccess = "granted" | "denied" | "prompt" | "unsupported";

/**
 * Permission names to try, current name first.
 *
 * Both are kept: `local-network-access` is what Chrome ships, `loopback-network`
 * is the origin-trial name that some builds still answer to. A browser that
 * knows neither is not refusing anything - it has no such gate, and MWA should
 * be left to connect exactly as it did before.
 */
const PERMISSION_NAMES = ["local-network-access", "loopback-network"] as const;

/**
 * The request that makes Chrome ask.
 *
 * Copied verbatim from the library's own permission sheet rather than improved
 * on: plain `fetch`, no `mode`, no headers. It is the call Solana Mobile tests
 * against Chrome, and the point is to trigger the permission check, not to get
 * a response - nothing is listening on port 80 and nothing needs to be.
 */
const PROBE_URL = "http://localhost";

/**
 * How long to wait on an unanswered prompt before giving the UI back.
 *
 * The fetch stays pending for as long as the permission prompt is open, which
 * is the point - it resolves when the user answers. But an ignored prompt would
 * otherwise leave a spinner running forever.
 */
const PROMPT_TIMEOUT_MS = 60_000;

/** The permission status object, under whichever name this browser knows. */
async function queryStatus(): Promise<PermissionStatus | null> {
  if (typeof navigator === "undefined" || !navigator.permissions) return null;

  for (const name of PERMISSION_NAMES) {
    try {
      return await navigator.permissions.query({ name: name as PermissionName });
    } catch {
      // Not a name this browser knows. Try the next one.
    }
  }
  return null;
}

/** Current state, without prompting for anything. */
export async function readLocalNetworkAccess(): Promise<LocalNetworkAccess> {
  const status = await queryStatus();
  return status ? (status.state as LocalNetworkAccess) : "unsupported";
}

/**
 * Subscribe to the permission, including its current value.
 *
 * Returns an unsubscribe function. `onChange` fires once with the initial state
 * - `"unsupported"` if the browser has no such permission - and again whenever
 * the user changes it, including from Chrome's own site settings while the tab
 * stays open.
 */
export function watchLocalNetworkAccess(
  onChange: (state: LocalNetworkAccess) => void
): () => void {
  let cancelled = false;
  let detach: (() => void) | undefined;

  void (async () => {
    const status = await queryStatus();
    if (cancelled) return;

    if (!status) {
      onChange("unsupported");
      return;
    }

    const emit = () => onChange(status.state as LocalNetworkAccess);
    emit();
    status.addEventListener("change", emit);
    detach = () => status.removeEventListener("change", emit);
  })();

  return () => {
    cancelled = true;
    detach?.();
  };
}

/**
 * Ask for the permission, and report where that left it.
 *
 * Must be called from inside a user gesture: Chrome will not put up a
 * permission prompt for a page that is not responding to a tap.
 *
 * Note that a grant here does *not* mean the caller can go straight on to
 * connect. Answering the prompt takes seconds, and the transient activation
 * that authorised this request will be gone by the time it resolves - so the
 * navigation to the wallet app needs a fresh tap. See the caller.
 */
export async function requestLocalNetworkAccess(): Promise<LocalNetworkAccess> {
  await Promise.race([
    // The failure is expected and carries no information: connection refused
    // means the permission let the request through.
    fetch(PROBE_URL).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, PROMPT_TIMEOUT_MS)),
  ]);

  return readLocalNetworkAccess();
}
