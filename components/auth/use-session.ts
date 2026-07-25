"use client";

import { useAppStore } from "@/lib/store/use-app-store";
import { useHydrated } from "@/hooks/use-hydrated";

/** Unified session — the current app user (from wallet or social/email auth). */
export function useSession() {
  const hydrated = useHydrated();
  const user = useAppStore((s) =>
    s.currentUserId ? (s.users[s.currentUserId] ?? null) : null
  );
  return {
    user: hydrated ? user : null,
    userId: hydrated ? (user?.id ?? null) : null,
    isSignedIn: hydrated && !!user,
    isLoading: !hydrated,
  };
}
