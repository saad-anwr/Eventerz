/**
 * Integration config, and a map of where each integration actually lives.
 *
 * This file used to hold placeholder functions that returned fabricated
 * successes - `mintTicket()` answered `"SIMULATED_CNFT_ASSET_ID"`, and
 * `rsvpOnChain()` answered `"SIMULATED_TX_SIGNATURE"`. Nothing called them, and
 * that was the danger: the first caller to wire one up would have shipped a UI
 * reporting a mint that never happened, with a plausible-looking id to render.
 *
 * The same defect was found and removed in the dApp's wallet adapter, where a
 * stand-in *did* have a caller: it sent a zero-lamport self-transfer, which
 * produced a real, confirmable signature for a transaction that did nothing, so
 * the UI reported a minted ticket and the explorer appeared to agree.
 *
 * Every integration below is now either implemented elsewhere or absent. None
 * of them is simulated here.
 */

import { SOLANA_CLUSTER } from "./solana/cluster";

export const integrationsConfig = {
  /** Validated once in `lib/solana/cluster` - never read the env var directly. */
  solanaNetwork: SOLANA_CLUSTER,
  heliusRpcUrl: process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? "",
  programId: process.env.NEXT_PUBLIC_EVENTERZ_PROGRAM_ID ?? "",

  /**
   * Read for display only - to tell a host whether this deployment can mint.
   * The address that actually gets minted against is the function secret
   * `MERKLE_TREE_ADDRESS`, because the tree authority signs server-side and a
   * client-visible value could be swapped for another tree.
   */
  merkleTree: process.env.NEXT_PUBLIC_MERKLE_TREE_ADDRESS ?? "",
} as const;

/** Whether this deployment can mint compressed NFTs at all. */
export const canMintCompressedAssets = (): boolean =>
  integrationsConfig.merkleTree.length > 0;

/** Whether the on-chain program half is switched on. */
export const isOnChainEnabled = (): boolean =>
  integrationsConfig.programId.length > 0;

/*
 * Where each integration lives
 * ----------------------------
 * Wallet connect      `components/providers/wallet-provider.tsx`
 * On-chain actions    `lib/solana/use-onchain-actions.ts` (hand-built
 *                     instructions - see `Eventerz Program/README.md` for why
 *                     the Anchor client is not used at runtime)
 * cNFT tickets/badges `supabase/functions/mint-cnft/` - server-side, because a
 *                     Bubblegum mint is signed by the tree authority
 * Token gating        `supabase/functions/check-gate/` + `lib/solana/gate.ts`
 * Reputation          derived in Postgres, migration 0013
 * Supabase client     `lib/supabase/client.ts`; data access in
 *                     `lib/supabase/data.ts`
 * Newsletter          `subscribe_newsletter`, migration 0012
 */

/* -------------------------------------------------------------------------- */
/*  Analytics                                                                 */
/* -------------------------------------------------------------------------- */
// The one genuine stub left. It no-ops rather than reporting success, because
// nothing downstream reads its result.
export function track(_event: string, _props?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.debug("[analytics]", _event, _props);
  }
}
