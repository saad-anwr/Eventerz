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

/**
 * The RPC this app should use.
 *
 * `NEXT_PUBLIC_HELIUS_RPC_URL` wins when set. The fallback is the public
 * endpoint, which works and is **not suitable for production traffic**: it is
 * aggressively rate-limited and shared with the world, so under real load
 * balance reads fail and transfers get stuck at "confirming". Set a dedicated
 * RPC before launch.
 */
export function rpcEndpoint(): string {
  const custom = process.env.NEXT_PUBLIC_HELIUS_RPC_URL?.trim();
  if (custom && /^https?:\/\//i.test(custom)) return custom;

  if (IS_MAINNET && typeof window !== "undefined") {
    // Browser-side only: this runs once per page load, and warning during the
    // server render would print on every request in the Vercel logs.
    // eslint-disable-next-line no-console
    console.warn(
      "[solana] Using the public mainnet RPC. It is rate-limited and not " +
        "suitable for production traffic - set NEXT_PUBLIC_HELIUS_RPC_URL.",
    );
  }

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
