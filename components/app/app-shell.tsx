"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  LogOut,
  MessageCircle,
  Plus,
  Settings,
  Sparkles,
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
import { NotificationBell } from "./notification-bell";
import { shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

/** Requests waiting on this user to answer - the only badge worth showing. */
function usePendingRequestCount(): number {
  const { userId } = useSession();
  const { data: requests = [] } = useFriendRequests(userId ?? undefined);
  return requests.filter(
    (r) => r.status === "pending" && r.addressee_id === userId
  ).length;
}

/**
 * The five destinations, identical here and in the app's tab bar.
 *
 * # The rule
 *
 * **A nav entry is a place you cannot get to from somewhere else.** The old set
 * broke that everywhere: Explore was a nav entry *and* a dashboard hero button;
 * My Events was a nav entry *and* a quick action *and* the "View all" on the
 * dashboard; Create was a hero button *and* a quick action *and* the button in
 * the top bar. Three routes to one screen is not three times as discoverable -
 * it is a dashboard where most of what you see does nothing new, while
 * Settings, which had no route at all, was a column inside Profile.
 *
 * Each of these owns a domain nothing else does:
 *
 *   Home       what is happening, and the way into Explore
 *   Community  friends, requests, messages - three screens that were two nav
 *              entries and two header icons, all answering "who do I know"
 *   Create     the one action, raised and centred on mobile
 *   Profile    you as others see you
 *   Settings   wallets, language, privacy - previously nowhere
 *
 * Explore and My Events stay as routes reached from Home. Losing a nav entry is
 * not losing a screen; it is losing the third way of reaching one.
 *
 * Desktop shows the same five rather than a longer list. The sidebar has room
 * for more, but "the same product on both" is worth more than using the space.
 */
function useSharedNav(): NavItem[] {
  const pending = usePendingRequestCount();
  return [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/community", label: "Community", icon: Users, badge: pending },
    { href: "/profile", label: "Profile", icon: UserRound },
    { href: "/settings", label: "Settings", icon: Settings },
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
          community - sign in with a social account or your Solana wallet.
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
/*  Sidebar footer - user + wallet                                            */
/* -------------------------------------------------------------------------- */

function WalletChip() {
  const { user } = useSession();
  const { open } = useConnectModal();
  if (user?.walletAddress) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-brand-green/25 bg-brand-green/10 px-3 py-2 text-xs font-medium text-brand-green">
        <span className="size-1.5 rounded-full bg-brand-green" />
        <span data-no-translate>{shortenAddress(user.walletAddress)}</span>
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
  const nav = useSharedNav();
  const pendingRequests = usePendingRequestCount();

  /*
   * One subscription for the whole app section. Changes another user makes -
   * publishing an event, sending a friend request, RSVPing - invalidate the
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
        <div className="flex items-center justify-between p-5">
          <Link href="/dashboard">
            <Logo />
          </Link>
          {/* Opens rightward, into the page. The sidebar is narrower than the
              panel, so a right-anchored one would hang off the window. */}
          <NotificationBell align="left" />
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
              <Avatar name={user.name} seed={user.id} size="sm" src={user.avatarUrl} />
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
        {/*
          Notifications and sign-out. Nothing else.

          Friends, Messages and Create left because each is a tab in the bar
          below. The avatar left for the same reason and is the clearest case of
          it: it linked to Profile, which is a tab, *and* looked like an account
          menu it never was - so the one row on the screen with no obvious
          purpose was occupying the corner where every other app puts one.

          Sign-out takes its place because it was genuinely unreachable on a
          phone: it lived in the desktop sidebar footer, which is `lg`-only, so
          nobody on a small screen could sign out at all.
        */}
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-muted-foreground transition-colors hover:border-brand-purple/40 hover:text-white"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="min-h-screen pb-24 lg:pb-0 lg:pl-64">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </div>
      </main>

      {/*
        Mobile bottom tabs.

        Four destinations with a raised Create between the second and third,
        which is the app's bar exactly - see `useMobileNav` for why these five
        and not the six in the sidebar.
      */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/10 bg-brand-bg/90 px-1 py-2 backdrop-blur-xl lg:hidden">
        {nav.map((item, index) => {
          const active = isActive(pathname, item.href);
          const tab = (
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

          /*
            The raised Create button, in a slot of its own.

            It sits inside a `flex-1` wrapper rather than being a `shrink-0`
            child of the nav, and the nav no longer uses `justify-around`. That
            combination was the uneven spacing: four `flex-1` tabs shared
            whatever was left after a fixed 56px button, and `justify-around`
            then added its own margins around all five, so the gaps either side
            of Create were visibly wider than the gaps between tabs.

            Five equal slots, one of which happens to contain a circle, is what
            the app's tab bar does - see `EventerzTabBar`, where both `TabItem`
            and `CreateButton` are `flex-1`. `-mt-6` lifts the circle clear of
            the bar without taking it out of the layout.
          */
          if (index === 2) {
            return (
              <React.Fragment key="create-slot">
                <div className="flex flex-1 items-start justify-center">
                  <Link
                    href="/create"
                    aria-label="Create event"
                    className="-mt-6 flex size-14 items-center justify-center rounded-full border-4 border-brand-bg bg-gradient-to-br from-brand-purple to-brand-cyan text-white shadow-lg shadow-brand-purple/30 transition-transform active:scale-95"
                  >
                    <Plus className="size-6" />
                  </Link>
                </div>
                {tab}
              </React.Fragment>
            );
          }

          return tab;
        })}
      </nav>
    </div>
  );
}
