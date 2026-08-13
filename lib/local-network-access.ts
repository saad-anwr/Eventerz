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
 * # Why this only reads
 *
 * The obvious repair - ask under the name Chrome ships, from inside the tap -
 * was tried and does not work. Chrome leaves the permission on `prompt` and
 * puts up no dialog for a loopback request, so there is nothing for the user
 * to allow. Verified on device: the state never moves off `prompt`.
 *
 * So there is no `request` here, deliberately. What the state is good for is
 * telling the truth in the UI: `prompt` and `denied` both mean MWA cannot
 * connect on this browser, and the connect sheet offers the routes that do
 * work instead of failing again. See `mwaIsHopeless` in the wallet modal.
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
