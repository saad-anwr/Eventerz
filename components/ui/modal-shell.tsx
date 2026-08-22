"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useScrollLock } from "@/hooks";

/**
 * The dialog chrome every Eventerz modal shares: the full-screen overlay, the
 * click-to-dismiss backdrop and the gradient-bordered card.
 *
 * The auth modal, the wallet modal and the send-crypto dialog each carried a
 * byte-identical copy, so a fix made on one never reached the other two - the
 * height cap below was added to the send dialog alone and the other two kept
 * the bug it fixes.
 *
 * The card is capped to the window with its body scrolling inside. Uncapped, a
 * short viewport - a landscape phone, a small laptop, a browser with devtools
 * open - clipped the bottom of the content with no way to reach it, which on
 * the send form put the Send button out of reach on something that moves real
 * money. `dvh` rather than `vh`: on mobile browsers `vh` counts the space
 * behind the retracting address bar, which is exactly the height this must not
 * assume it has.
 */
export function ModalShell({
  open,
  onDismiss,
  label,
  children,
}: {
  open: boolean;
  /** Backdrop click. Omit to leave the backdrop inert while work is in flight. */
  onDismiss?: () => void;
  label: string;
  children: React.ReactNode;
}) {
  // The page behind a dialog must not scroll under it. Each modal used to call
  // this for itself, on the same value it passes as `open`.
  useScrollLock(open);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={onDismiss}
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="gradient-border relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-brand-bg-soft/95 shadow-card backdrop-blur-2xl"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
