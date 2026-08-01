"use client";

/**
 * Host-side guest management.
 *
 * Requests needing a decision come first and stay expanded - the whole point
 * of the panel is that a host lands on the event and immediately sees what is
 * waiting on them. Confirmed and closed guests collapse below.
 *
 * Every action goes through an RPC that re-checks host ownership server-side,
 * so this component being rendered is not what authorises anything.
 */

import * as React from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  ScanLine,
  UserMinus,
  Users,
  X,
} from "lucide-react";

import {
  useApproveGuest,
  useDeclineGuest,
  useEventGuests,
} from "@/lib/hooks/use-eventerz-data";
import type { EventGuestRow } from "@/lib/supabase/types";
import type { EventItem } from "@/lib/store/types";
import { Button } from "@/components/ui/button";
import { Avatar } from "./avatar";
import { cn } from "@/lib/utils";

export function GuestManager({ event }: { event: EventItem }) {
  const { data: guests = [], isLoading } = useEventGuests(event.id);
  const approve = useApproveGuest();
  const decline = useDeclineGuest();
  const [showAll, setShowAll] = React.useState(false);

  // A single failed action should surface, whichever button caused it.
  const actionError =
    (approve.error as Error | null)?.message ??
    (decline.error as Error | null)?.message ??
    null;

  const waiting = guests.filter(
    (g) => g.status === "pending" || g.status === "waitlist"
  );
  const confirmed = guests.filter((g) => g.status === "confirmed");
  const closed = guests.filter(
    (g) => g.status === "declined" || g.status === "cancelled"
  );

  const busy = approve.isPending || decline.isPending;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <Users className="size-4 text-brand-purple" />
        <h2 className="text-sm font-semibold text-white">Guests</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {confirmed.length} going
          {event.checkedInCount ? ` · ${event.checkedInCount} checked in` : ""}
        </span>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading guests...
        </p>
      ) : guests.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          No requests yet. Share the event link to get your first guests.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {waiting.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
                <Clock className="size-3.5" />
                {waiting.length} waiting on you
              </h3>
              <ul className="space-y-2">
                {waiting.map((g) => (
                  <GuestRow key={g.profile_id} guest={g}>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          approve.mutate({
                            eventId: event.id,
                            profileId: g.profile_id,
                          })
                        }
                      >
                        <Check className="size-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          decline.mutate({
                            eventId: event.id,
                            profileId: g.profile_id,
                          })
                        }
                      >
                        <X className="size-3.5" />
                        Decline
                      </Button>
                    </div>
                  </GuestRow>
                ))}
              </ul>
            </section>
          )}

          {confirmed.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-green">
                <BadgeCheck className="size-3.5" />
                Going
              </h3>
              <ul className="space-y-2">
                {confirmed.slice(0, showAll ? undefined : 6).map((g) => (
                  <GuestRow key={g.profile_id} guest={g}>
                    <button
                      disabled={busy}
                      onClick={() =>
                        decline.mutate({
                          eventId: event.id,
                          profileId: g.profile_id,
                        })
                      }
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                      title="Remove this guest and free their seat"
                    >
                      <UserMinus className="size-3.5" />
                      Remove
                    </button>
                  </GuestRow>
                ))}
              </ul>
              {confirmed.length > 6 && (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-2 flex items-center gap-1 text-xs text-brand-cyan hover:underline"
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      showAll && "rotate-180"
                    )}
                  />
                  {showAll ? "Show fewer" : `Show all ${confirmed.length}`}
                </button>
              )}
            </section>
          )}

          {closed.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Not attending
              </h3>
              <ul className="space-y-2">
                {closed.map((g) => (
                  <GuestRow key={g.profile_id} guest={g} muted />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {actionError && (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {actionError}
        </p>
      )}

      {confirmed.length > 0 && (
        /* Check-in needs a camera to scan ticket QR codes, so it lives in the
           mobile app. Saying so beats a button that cannot work here. */
        <p className="mt-4 flex items-center gap-1.5 border-t border-white/10 pt-3 text-xs text-muted-foreground">
          <ScanLine className="size-3.5 text-brand-cyan" />
          Scan tickets to check guests in from the Eventerz mobile app.
        </p>
      )}
    </div>
  );
}

function GuestRow({
  guest,
  muted,
  children,
}: {
  guest: EventGuestRow;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-2.5",
        muted && "opacity-60"
      )}
    >
      <Link href={`/u/${guest.profile_id}`} className="shrink-0">
        <Avatar name={guest.name} seed={guest.profile_id} size="sm" src={guest.avatar_url} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/u/${guest.profile_id}`}
          className="block truncate text-sm font-medium text-white hover:underline"
        >
          {guest.name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {guest.status === "waitlist"
            ? "Waitlisted"
            : guest.status === "declined"
              ? "Declined"
              : guest.status === "cancelled"
                ? "Cancelled"
                : guest.checked_in_at
                  ? "Checked in"
                  : guest.ticket_serial
                    ? `Ticket #${String(guest.ticket_serial).padStart(4, "0")}`
                    : `@${guest.handle ?? "guest"}`}
        </p>
      </div>
      {children}
    </li>
  );
}
