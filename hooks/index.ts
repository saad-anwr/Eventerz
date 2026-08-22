"use client";

import { useEffect, useState } from "react";

/**
 * Returns `false` on the server and on the first client render, then `true`
 * after mount. Use it to gate rendering of client-only / persisted state so
 * SSR and the first client render always match (avoids hydration mismatches).
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/**
 * Lock body scroll while `locked` is true (e.g. when a mobile menu is open).
 * Preserves scrollbar width to avoid layout shift.
 */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const original = document.body.style.overflow;
    const scrollBarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }
    return () => {
      document.body.style.overflow = original;
      document.body.style.paddingRight = "";
    };
  }, [locked]);
}
