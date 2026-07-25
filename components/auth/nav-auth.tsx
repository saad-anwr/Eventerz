"use client";

import Link from "next/link";
import { LayoutGrid, LogIn } from "lucide-react";
import { useSession } from "./use-session";
import { useAuth } from "./auth-provider";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/app/avatar";

/** Marketing-navbar auth control: "Sign in" when signed out, avatar when in. */
export function NavAuth({
  mobile,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const { user, isSignedIn, isLoading } = useSession();
  const { openAuth } = useAuth();

  if (isLoading) {
    return <div className="h-9 w-20 animate-pulse rounded-full bg-white/[0.05]" />;
  }

  if (isSignedIn && user) {
    if (mobile) {
      return (
        <Button asChild variant="secondary" className="w-full" onClick={onNavigate}>
          <Link href="/dashboard">
            <LayoutGrid className="size-4" />
            Open App
          </Link>
        </Button>
      );
    }
    return (
      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-1 pl-1 pr-3 transition-colors hover:border-brand-purple/40"
        aria-label="Open app"
      >
        <Avatar name={user.name} seed={user.id} size="sm" />
        <span className="max-w-24 truncate text-sm font-medium text-white">
          {user.name.split(" ")[0]}
        </span>
      </Link>
    );
  }

  return (
    <Button
      variant={mobile ? "secondary" : "ghost"}
      size={mobile ? "default" : "sm"}
      onClick={() => {
        openAuth();
        onNavigate?.();
      }}
      className={mobile ? "w-full" : undefined}
    >
      <LogIn className="size-4" />
      Sign in
    </Button>
  );
}
