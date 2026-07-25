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
