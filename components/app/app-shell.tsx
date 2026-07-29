"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Home,
  LogOut,
  MessageCircle,
  Plus,
  Sparkles,
  Ticket,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "@/components/auth/use-session";
import { useAuth } from "@/components/auth/auth-provider";
import { useConnectModal } from "@/components/wallet/connect-modal-context";
import { useFriendRequests } from "@/lib/hooks/use-eventerz-data";
import { useRealtimeSync } from "@/lib/hooks/use-realtime";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Avatar } from "./avatar";
import { shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

function useNav(): NavItem[] {
  const { userId } = useSession();
  const { data: requests = [] } = useFriendRequests(userId ?? undefined);

  // Requests waiting on this user to answer.
  const pending = requests.filter(
    (r) => r.status === "pending" && r.addressee_id === userId
  ).length;
  return [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/my-events", label: "My Events", icon: Ticket },
    { href: "/friends", label: "Friends", icon: Users, badge: pending },
    { href: "/messages", label: "Messages", icon: MessageCircle },
    { href: "/profile", label: "Profile", icon: UserRound },
  ];
}

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* -------------------------------------------------------------------------- */
/*  Gate (shown when not signed in)                                           */
/* -------------------------------------------------------------------------- */

function Gate() {
  const { openAuth } = useAuth();
  const { open: openWallet } = useConnectModal();
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none absolute left-1/2 top-1/3 -z-10 size-[32rem] -translate-x-1/2 rounded-full bg-brand-purple/20 blur-[120px]" />
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-xl">
        <Logo className="justify-center" />
        <h1 className="mt-6 font-display text-2xl font-bold text-white">
          Sign in to continue
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create and discover events, build reputation and connect with your
          community — sign in with a social account or your Solana wallet.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <Button size="lg" onClick={openAuth} className="w-full">
            <Sparkles className="size-4" />
            Sign in / Sign up
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={openWallet}
            className="w-full"
          >
            <Wallet className="size-4" />
            Connect Wallet
          </Button>
        </div>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-muted-foreground transition-colors hover:text-white"
        >
          ← Back to home
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sidebar footer — user + wallet                                            */
/* -------------------------------------------------------------------------- */

function WalletChip() {
  const { user } = useSession();
  const { open } = useConnectModal();
  if (user?.walletAddress) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-brand-green/25 bg-brand-green/10 px-3 py-2 text-xs font-medium text-brand-green">
        <span className="size-1.5 rounded-full bg-brand-green" />
        {shortenAddress(user.walletAddress)}
      </div>
    );
  }
  return (
    <button
      onClick={open}
      className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-purple/40 hover:text-white"
    >
      <Wallet className="size-3.5 text-brand-purple" />
      Link a wallet
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  App shell                                                                  */
/* -------------------------------------------------------------------------- */

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, userId, isSignedIn, isLoading } = useSession();
  const { signOut } = useAuth();
  const nav = useNav();

  /*
   * One subscription for the whole app section. Changes another user makes —
   * publishing an event, sending a friend request, RSVPing — invalidate the
   * matching queries here, so the UI updates without a refresh.
   */
  useRealtimeSync(userId);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-purple" />
      </div>
    );
  }

  if (!isSignedIn || !user) return <Gate />;

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-brand-bg-soft/40 backdrop-blur-xl lg:flex">
        <div className="p-5">
          <Link href="/dashboard">
            <Logo />
          </Link>
        </div>

        <div className="px-4">
          <Button asChild className="w-full">
            <Link href="/create">
              <Plus className="size-4" />
              Create Event
            </Link>
          </Button>
        </div>

        <nav className="mt-6 flex-1 space-y-1 px-3">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/[0.06] text-white"
                    : "text-muted-foreground hover:bg-white/[0.03] hover:text-white"
                )}
              >
                <item.icon
                  className={cn(
                    "size-[18px]",
                    active && "text-brand-purple"
                  )}
                />
                {item.label}
                {item.badge ? (
                  <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-brand-purple text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-3">
          <WalletChip />
          <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
            <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-2.5">
              <Avatar name={user.name} seed={user.id} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">
                  {user.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  @{user.handle}
                </span>
              </span>
            </Link>
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-brand-bg/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link href="/dashboard">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/create">
              <Plus className="size-4" />
              Create
            </Link>
          </Button>
          <Link href="/profile">
            <Avatar name={user.name} seed={user.id} size="sm" ring />
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="min-h-screen pb-24 lg:pb-0 lg:pl-64">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-white/10 bg-brand-bg/90 px-2 py-2 backdrop-blur-xl lg:hidden">
        {nav.slice(0, 5).map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] font-medium transition-colors",
                active ? "text-white" : "text-muted-foreground"
              )}
            >
              <item.icon
                className={cn("size-5", active && "text-brand-purple")}
              />
              {item.label}
              {item.badge ? (
                <span className="absolute right-2 top-0 flex size-4 items-center justify-center rounded-full bg-brand-purple text-[9px] font-bold text-white">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
