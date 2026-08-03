"use client";

import * as React from "react";
import Link from "next/link";
import {
  Award,
  CalendarPlus,
  Compass,
  QrCode,
  Ticket,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  useEvents,
  useEventsAttending,
  useEventsByHost,
  useFriendRequests,
  useProfiles,
} from "@/lib/hooks/use-eventerz-data";
import { eventRowToItem } from "@/lib/supabase/map-event";
import { useSession } from "@/components/auth/use-session";
import { EventCard } from "@/components/app/event-card";
import { EmptyState } from "@/components/app/empty-state";
import { Avatar } from "@/components/app/avatar";
import { Button } from "@/components/ui/button";
import { isUpcoming } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The four shortcuts, matching the app's home screen exactly.
 *
 * Deliberately *not* including Create: it is the raised centre control in the
 * bottom bar, always visible and always in the same place, and it was
 * previously here as well as there as well as a hero button above.
 *
 * What is left is exactly the set with no nav entry of its own - Explore, the
 * two things a person does at a door, and the wallet. Each of these is the only
 * route to where it goes.
 *
 * `/checkin` with no query shows the "scan a ticket to check in" state, which
 * is the honest destination in a browser: the phone opens a camera, a desktop
 * has nothing to open. See `app/(app)/checkin/page.tsx`.
 */
const QUICK_ACTIONS = [
  {
    href: "/explore",
    label: "Explore",
    icon: Compass,
    accent: "bg-brand-purple/10 text-brand-purple",
  },
  {
    href: "/checkin",
    label: "Scan QR",
    icon: QrCode,
    accent: "bg-brand-blue/10 text-brand-blue",
  },
  {
    href: "/my-events",
    label: "Tickets",
    icon: Ticket,
    accent: "bg-brand-cyan/10 text-brand-cyan",
  },
  {
    href: "/settings",
    label: "Wallet",
    icon: Wallet,
    accent: "bg-brand-green/10 text-brand-green",
  },
] as const;

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-xl",
          accent
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="mt-3 font-display text-2xl font-bold text-white">
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, userId } = useSession();

  const { data: hostedRows = [] } = useEventsByHost(userId ?? undefined);
  const { data: attendingRows = [] } = useEventsAttending(userId ?? undefined);
  const { data: publicRows = [] } = useEvents({ upcomingOnly: true });
  const { data: requests = [] } = useFriendRequests(userId ?? undefined);

  const data = React.useMemo(() => {
    const hosting = hostedRows.map(eventRowToItem);
    const attending = attendingRows
      .map(eventRowToItem)
      .filter((e) => e.hostId !== userId);

    const myUpcoming = [...hosting, ...attending]
      .filter((e) => isUpcoming(e.startsAt))
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));

    // Suggestions exclude anything already on your calendar.
    const mine = new Set(myUpcoming.map((e) => e.id));
    const suggested = publicRows
      .map(eventRowToItem)
      .filter((e) => e.visibility === "public" && !mine.has(e.id))
      .slice(0, 3);

    const friends = requests
      .filter((r) => r.status === "accepted")
      .map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
    const incoming = requests.filter(
      (r) => r.status === "pending" && r.addressee_id === userId
    );

    return { hosting, attending, myUpcoming, suggested, friends, incoming };
  }, [hostedRows, attendingRows, publicRows, requests, userId]);

  // Names for the request avatars, in one batched lookup.
  const { data: requesters = [] } = useProfiles(
    data.incoming.map((r) => r.requester_id),
  );
  /*
   * Keep the whole row, not just the name. Mapping straight to a string threw
   * away the avatar that had already been fetched alongside it, so these faces
   * could only ever be initials.
   */
  const requesterById = React.useMemo(
    () => Object.fromEntries(requesters.map((u) => [u.id, u])),
    [requesters],
  );

  if (!user) return null;

  return (
    <div className="space-y-10">
      {/* Greeting */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-white">
            Welcome back, {user.name.split(" ")[0]} 👋
          </h1>
        </div>
        {/*
          No hero buttons.

          "Create Event" and "Explore" sat here while Create was also the raised
          centre control in the bottom bar and also a quick action, and Explore
          was also a nav entry and also a quick action. Three routes to one
          screen is not three times as discoverable - it is a dashboard where
          most of what you see does nothing new. The quick-action row below is
          the single set of shortcuts, and it holds only what has no nav entry
          of its own.
        */}
      </div>

      {/*
        Quick actions - the same four, in the same order, as the app's
        `features/home/quick-actions.tsx`.

        Shown at every width. These are no longer a mobile-only convenience
        duplicating the sidebar: none of the four has a nav entry any more, so
        on a desktop this row is the only route to Explore, the door tools and
        the wallet.
      */}
      <div className="grid grid-cols-4 gap-2.5">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-2 py-4 transition-colors hover:border-brand-purple/30"
          >
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-xl",
                action.accent
              )}
            >
              <action.icon className="size-[18px]" />
            </span>
            <span className="text-[11px] font-medium text-white">
              {action.label}
            </span>
          </Link>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={Ticket}
          label="Hosting"
          value={data.hosting.length}
          accent="bg-brand-purple/10 text-brand-purple"
        />
        <StatTile
          icon={CalendarPlus}
          label="Attending"
          value={data.attending.length}
          accent="bg-brand-blue/10 text-brand-blue"
        />
        <StatTile
          icon={Users}
          label="Friends"
          value={data.friends.length}
          accent="bg-brand-cyan/10 text-brand-cyan"
        />
        <StatTile
          icon={Award}
          label="Reputation"
          value={user.reputation}
          accent="bg-brand-green/10 text-brand-green"
        />
      </div>

      {/* Friend requests nudge */}
      {data.incoming.length > 0 && (
        <Link
          href="/friends"
          className="flex items-center gap-3 rounded-2xl border border-brand-purple/30 bg-brand-purple/10 p-4 transition-colors hover:bg-brand-purple/15"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-purple/20 text-brand-purple">
            <UserPlus className="size-5" />
          </span>
          <div className="flex -space-x-2">
            {data.incoming.slice(0, 4).map((r) => (
              <Avatar
                key={r.id}
                name={requesterById[r.requester_id]?.name ?? "Member"}
                seed={r.requester_id}
                size="sm"
                ring
                src={requesterById[r.requester_id]?.avatar_url}
              />
            ))}
          </div>
          <p className="text-sm font-medium text-white">
            You have {data.incoming.length} new friend request
            {data.incoming.length > 1 ? "s" : ""}
          </p>
          <span className="ml-auto text-xs text-brand-cyan">Review →</span>
        </Link>
      )}

      {/* Upcoming */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-white">
            Your upcoming events
          </h2>
          <Link href="/my-events" className="text-sm text-brand-cyan">
            View all →
          </Link>
        </div>
        {data.myUpcoming.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.myUpcoming.slice(0, 3).map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Ticket}
            title="Nothing on your calendar yet"
            description="RSVP to an event or host your own to see it here."
            action={
              <Button asChild>
                <Link href="/explore">
                  <Compass className="size-4" />
                  Explore events
                </Link>
              </Button>
            }
          />
        )}
      </section>

      {/* Suggested */}
      {data.suggested.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-xl font-semibold text-white">
            Recommended for you
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.suggested.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
