/**
 * Future-integration placeholders.
 * ---------------------------------
 * This marketing site is intentionally front-end only. The stubs below mark
 * the seams where the real product wiring plugs in. Each returns mock data
 * today so the UI renders; swap the bodies for real SDK calls when ready.
 *
 * Read env from `.env.local` (see `.env.example`).
 */

export const integrationsConfig = {
  solanaNetwork: process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "mainnet-beta",
  heliusRpcUrl: process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? "",
  programId: process.env.NEXT_PUBLIC_EVENTERZ_PROGRAM_ID ?? "",
  merkleTree: process.env.NEXT_PUBLIC_MERKLE_TREE_ADDRESS ?? "",
} as const;

/* -------------------------------------------------------------------------- */
/*  Wallet Adapter (@solana/wallet-adapter-react)                             */
/* -------------------------------------------------------------------------- */
// TODO: wrap the app in <ConnectionProvider> + <WalletProvider> and expose a
// `useWallet()` powered "Connect Wallet" flow (Phantom, Backpack, Solflare).
export async function connectWallet(): Promise<{ address: string } | null> {
  // Placeholder — replace with wallet-adapter `connect()`.
  return { address: "9xQe000000000000000000000000000000000004dRt" };
}

/* -------------------------------------------------------------------------- */
/*  Helius API — indexing, DAS, webhooks                                      */
/* -------------------------------------------------------------------------- */
// TODO: fetch assets / transactions via the Helius DAS API or RPC.
export async function getWalletAssets(_owner: string) {
  return { tickets: [], badges: [], reputation: 0 };
}

/* -------------------------------------------------------------------------- */
/*  Anchor program — on-chain RSVP / check-in                                 */
/* -------------------------------------------------------------------------- */
// TODO: load the IDL and build instructions with `@coral-xyz/anchor`.
export async function rsvpOnChain(_eventId: string) {
  return { signature: "SIMULATED_TX_SIGNATURE" };
}

/* -------------------------------------------------------------------------- */
/*  Metaplex — compressed NFT ticket minting                                  */
/* -------------------------------------------------------------------------- */
// TODO: mint cNFTs with `@metaplex-foundation/mpl-bubblegum`.
export async function mintTicket(_eventId: string, _owner: string) {
  return { assetId: "SIMULATED_CNFT_ASSET_ID" };
}

/* -------------------------------------------------------------------------- */
/*  Supabase — off-chain indexing / metadata                                  */
/* -------------------------------------------------------------------------- */
// TODO: create a typed Supabase client for indexed events & analytics.
export function getSupabaseClient() {
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Analytics                                                                  */
/* -------------------------------------------------------------------------- */
// TODO: pipe events to your analytics provider (Vercel Analytics, PostHog…).
export function track(_event: string, _props?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.debug("[analytics]", _event, _props);
  }
}

/* -------------------------------------------------------------------------- */
/*  Newsletter                                                                 */
/* -------------------------------------------------------------------------- */
// TODO: POST to a server route that forwards to Resend / ConvertKit.
export async function subscribeEmail(_email: string) {
  return { ok: true };
}
