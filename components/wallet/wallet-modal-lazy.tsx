"use client";

import dynamic from "next/dynamic";

/**
 * `WalletModal`, code-split and loaded only on the client.
 *
 * It renders nothing until the visitor opens the wallet connector (`visible`
 * starts false - see the `AnimatePresence` in `wallet-modal.tsx`), so shipping
 * its ~700 lines of framer-motion, the curated wallet list and the MWA
 * failure copy inside every page's initial bundle buys nothing: it is mounted
 * once, in the root layout, for every route in the app.
 *
 * The indirection through this file - rather than a `dynamic()` call in
 * `wallet-modal.tsx` itself - exists because `ssr: false` is only valid from a
 * Client Component, and the root layout that mounts this is a Server
 * Component. Same pattern as `Particles` in `components/layout/background.tsx`.
 */
export const WalletModal = dynamic(
  () => import("./wallet-modal").then((m) => m.WalletModal),
  { ssr: false }
);
