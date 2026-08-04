import { clusterApiUrl } from "@solana/web3.js";

/**
 * Which Solana cluster this deployment talks to, resolved once.
 *
 * # Why this is not just `process.env.NEXT_PUBLIC_SOLANA_NETWORK`
 *
 * Six files read that variable and each one assumed it held a valid cluster.
 * It is a string typed by a human into a Vercel dashboard, so the realistic
 * values include `mainnet` (the common mistake - the cluster is `mainnet-beta`),
 * `Mainnet-Beta`, an empty string left behind by a deleted entry, and a stray
 * trailing space.
 *
 * `clusterApiUrl` throws on anything it does not recognise. It is called during
 * module initialisation of the wallet providers, which wrap the entire app, so
 * a typo there is not a broken RPC call - it is a blank page with a stack trace
 * in the console, on every route, for everyone.
 *
 * Validating once and falling back is the safer failure: an unrecognised value
 * lands on mainnet, which is where a production deployment was trying to go.
 * Getting there by accident is still worth complaining about, so it warns.
 */
export type SolanaCluster = "mainnet-beta" | "devnet" | "testnet";

const CLUSTERS: readonly SolanaCluster[] = [
  "mainnet-beta",
  "devnet",
  "testnet",
];

function resolveCluster(): SolanaCluster {
  const raw = process.env.NEXT_PUBLIC_SOLANA_NETWORK?.trim().toLowerCase();
  if (!raw) return "mainnet-beta";

  if ((CLUSTERS as readonly string[]).includes(raw)) {
    return raw as SolanaCluster;
  }

  // `mainnet` is wrong often enough to be worth accepting rather than
  // discarding - someone who wrote it meant mainnet-beta, unambiguously.
  if (raw === "mainnet" || raw === "mainnet-beta ") return "mainnet-beta";

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      `[solana] NEXT_PUBLIC_SOLANA_NETWORK="${process.env.NEXT_PUBLIC_SOLANA_NETWORK}" ` +
        `is not a Solana cluster. Falling back to mainnet-beta. ` +
        `Valid values: ${CLUSTERS.join(", ")}.`,
    );
  }
  return "mainnet-beta";
}

export const SOLANA_CLUSTER: SolanaCluster = resolveCluster();

/** True on the network where a mistake costs real money. */
export const IS_MAINNET = SOLANA_CLUSTER === "mainnet-beta";

/** Where the browser sends RPC. Same-origin, so no credential travels with it. */
export const RPC_PROXY_PATH = "/api/rpc";

/**
 * The RPC endpoint the client should use.
 *
 * This is **our own origin**, not Helius. `app/api/rpc/route.ts` forwards to the
 * provider using a server-only `HELIUS_RPC_URL`, so the key is never inlined
 * into the bundle and never reaches a browser. The full reasoning is in that
 * file; the short version is that `NEXT_PUBLIC_` means published, and a billable
 * RPC key should not be.
 *
 * `web3.js` needs an absolute URL, so this resolves an origin rather than
 * returning a bare path:
 *
 *   - in the browser, whatever the page is actually served from, which is
 *     correct on production, on a preview URL and on localhost alike;
 *   - during SSR and static generation there is no `window`, so it falls back to
 *     `NEXT_PUBLIC_SITE_URL`, then to `VERCEL_URL` for preview builds that have
 *     no configured site URL.
 *
 * If neither is set - a fresh clone with no `.env`, building statically - it
 * returns the public cluster endpoint. That keeps `next build` working; the
 * browser re-resolves to the proxy on hydration, so nothing ships pointing at
 * the public RPC.
 */
export function rpcEndpoint(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}${RPC_PROXY_PATH}`;
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (site && /^https?:\/\//i.test(site)) return `${site}${RPC_PROXY_PATH}`;

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}${RPC_PROXY_PATH}`;

  return clusterApiUrl(SOLANA_CLUSTER);
}

/**
 * Explorer query suffix. Mainnet needs none; every other cluster does, and
 * omitting it silently shows a mainnet page for a devnet signature - which
 * renders as "transaction not found" and reads as "your payment vanished".
 */
export function explorerClusterSuffix(): string {
  return IS_MAINNET ? "" : `?cluster=${SOLANA_CLUSTER}`;
}

/**
 * Explorer link for a signature.
 *
 * `cluster` is a parameter because a payment receipt records the cluster it was
 * made on, and that is not always the one this build targets: opening a devnet
 * signature against mainnet is exactly the "transaction not found" above.
 *
 * It lives here rather than beside the instruction builders so a chat bubble
 * can link a receipt without pulling web3.js and the borsh decoders in with it.
 */
export function explorerTxUrl(signature: string, cluster?: string): string {
  const suffix = cluster
    ? cluster === "mainnet-beta"
      ? ""
      : `?cluster=${cluster}`
    : explorerClusterSuffix();
  return `https://explorer.solana.com/tx/${signature}${suffix}`;
}
