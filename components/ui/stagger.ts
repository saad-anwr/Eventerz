import type { Variants } from "framer-motion";

/**
 * Framer Motion variants for revealing a list in sequence.
 *
 * Put `staggerContainer` on the wrapper (with `initial="hidden"` and
 * `whileInView="show"`) and `staggerItem` on each child.
 */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};
