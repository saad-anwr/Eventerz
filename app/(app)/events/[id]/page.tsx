"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  Clock,
  Globe,
  Hourglass,
  Lock,
  MapPin,
  MessagesSquare,
  Loader2,
} from "lucide-react";
import {
  useCancelRsvp,
  useEvent,
  useProfile,
  useRequestToJoin,
} from "@/lib/hooks/use-eventerz-data";
import { eventRowToItem } from "@/lib/supabase/map-event";
import { useSession } from "@/components/auth/use-session";
import { EmptyState } from "@/components/app/empty-state";
import { Avatar } from "@/components/app/avatar";
import { AttendeeList } from "@/components/app/attendee-list";
import { ChatPanel } from "@/components/app/chat-panel";
import { GuestManager } from "@/components/app/guest-manager";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatEventDate, isUpcoming } from "@/lib/format";
import {
  RSVP_PRESENTATION,
  filledPercent,
  goingCount,
  myRsvpState,
  rsvpActionLabel,
  spotsLeft,
} from "@/lib/events";
import { cn } from "@/lib/utils";

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { userId } = useSession();

  const { data: row, isLoading } = useEvent(eventId);
  const event = React.useMemo(() => (row ? eventRowToItem(row) : null), [row]);

  const requestToJoin = useRequestToJoin();
  const cancelRsvp = useCancelRsvp();

  const { data: host } = useProfile(row?.host_id);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading event…
      </div>
    );
  }

  if (!event) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Event not found"
        description="This event may have been removed or the link is incorrect."
        action={
          <Button asChild>
            <Link href="/explore">Browse events</Link>
          </Button>
        }
      />
    );
  }

  const isHost = event.hostId === userId;
  const status = myRsvpState(event, userId);
  const isConfirmed = status === "confirmed";
  const left = spotsLeft(event);
  const going = goingCount(event);
  const filled = filledPercent(event);
  /*
   * Matches `request_to_join`, which refuses only once `coalesce(ends_at,
   * starts_at)` is past. Keying off `startsAt` alone would show "Event ended"
   * for an event that is currently running and still accepting guests.
   */
  const hasEnded = event.endsAt
    ? Date.parse(event.endsAt) < Date.now()
    : !isUpcoming(event.startsAt);

  /*
   * The roster is gated to the host and confirmed guests, matching the RLS in
   * migration 0005. Everyone else sees a bounded preview.
   */
  const canSeeRoster = isHost || isConfirmed;

  // Whatever the last action was, its failure has to be visible. The previous
  // version dropped mutation errors on the floor, which is what made the RSVP
  // button look inert when the server rejected the call.
  const actionError =
    (requestToJoin.error as Error | null)?.message ??
    (cancelRsvp.error as Error | null)?.message ??
    null;
  const busy = requestToJoin.isPending || cancelRsvp.isPending;


  return (
    <div>
      <Link
        href="/explore"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-white"
      >
        <ArrowLeft className="size-4" />
        Back to events
      </Link>

      {/* Cover */}
      <div
        className={cn(
          "relative h-44 overflow-hidden rounded-3xl bg-gradient-to-br sm:h-56",
          event.coverGradient
        )}
      >
        {/* Banner over the gradient, which remains the fallback. */}
        {event.coverImage && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={event.coverImage}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.35),transparent_55%)]" />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <Badge className="bg-black/30 text-white">{event.category}</Badge>
          {event.tokenGated && (
            <Badge className="bg-black/30 text-white">
              <Lock className="size-3" /> Token-gated
            </Badge>
          )}
          {event.visibility === "private" && (
            <Badge className="bg-black/30 text-white">Private</Badge>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Left: details */}
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">
              {event.title}
            </h1>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.05] text-brand-cyan">
                  <CalendarDays className="size-4" />
                </span>
                {formatEventDate(event.startsAt)}
                {event.endsAt && (
                  <span className="text-muted-foreground">
                    → {formatEventDate(event.endsAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.05] text-brand-purple">
                  {event.isOnline ? (
                    <Globe className="size-4" />
                  ) : (
                    <MapPin className="size-4" />
                  )}
                </span>
                {event.location}
              </div>
            </div>
          </div>

          {/* Host */}
          <Link
            href={`/u/${event.hostId}`}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-white/20"
          >
            <Avatar name={host?.name ?? "Host"} seed={event.hostId} size="md" />
            <div>
              <p className="text-xs text-muted-foreground">Hosted by</p>
              <p className="text-sm font-semibold text-white">
                {host?.name ?? "Unknown"}
              </p>
            </div>
            <span className="ml-auto text-xs text-brand-cyan">View profile →</span>
          </Link>

          {/* About */}
          {event.description && (
            <div>
              <h2 className="mb-2 font-display text-lg font-semibold text-white">
                About
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {event.description}
              </p>
            </div>
          )}

          {event.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {event.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          <AttendeeList event={event} canSeeRoster={canSeeRoster} />
        </div>

        {/* Right: RSVP + chat */}
        <div className="space-y-6">
          {/* RSVP card */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold text-white">
                {event.price}
              </span>
              <span className="text-sm text-muted-foreground">
                {left > 0 ? `${left} spots left` : "Full"}
              </span>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-brand-gradient transition-all"
                style={{ width: `${filled}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {going} / {event.capacity} going
              {event.pendingCount ? ` · ${event.pendingCount} awaiting approval` : ""}
            </p>

            {/* Current state, when the viewer has one. This is the "revert the
                decision to the attendee" half of the flow: the host's answer
                lands here, live, without a refresh. */}
            {status && !isHost && (
              <div
                className={cn(
                  "mt-4 rounded-2xl border p-3",
                  RSVP_PRESENTATION[status].tone
                )}
              >
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  {status === "confirmed" ? (
                    <Check className="size-4" />
                  ) : status === "pending" ? (
                    <Hourglass className="size-4" />
                  ) : status === "waitlist" ? (
                    <Clock className="size-4" />
                  ) : (
                    <AlertCircle className="size-4" />
                  )}
                  {RSVP_PRESENTATION[status].label}
                </p>
                <p className="mt-1 text-xs opacity-80">
                  {RSVP_PRESENTATION[status].detail}
                </p>
              </div>
            )}

            <div className="mt-4">
              {isHost ? (
                <Button variant="secondary" className="w-full" disabled>
                  <BadgeCheck className="size-4" />
                  You&apos;re hosting
                </Button>
              ) : hasEnded ? (
                <Button variant="outline" className="w-full" disabled>
                  <Clock className="size-4" />
                  Event ended
                </Button>
              ) : status === "confirmed" ||
                status === "pending" ||
                status === "waitlist" ? (
                /* One button for all three live states — cancelling a request
                   and cancelling a confirmed seat are the same intent. */
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => cancelRsvp.mutate(event.id)}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <span className="text-muted-foreground">
                      {status === "confirmed"
                        ? "Cancel my RSVP"
                        : "Withdraw my request"}
                    </span>
                  )}
                </Button>
              ) : (
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={() => requestToJoin.mutate(event.id)}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <BadgeCheck className="size-4" />
                  )}
                  {busy ? "Sending…" : rsvpActionLabel(event)}
                </Button>
              )}
            </div>

            {actionError && (
              <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                {actionError}
              </p>
            )}

            {event.requiresApproval && !isHost && !status && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                The host approves each guest.
              </p>
            )}
            {!event.requiresApproval && left === 0 && !status && !isHost && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                You&apos;ll be admitted automatically if a spot opens.
              </p>
            )}
          </div>

          {/* Host-only: the approval queue and guest roster. */}
          {isHost && <GuestManager event={event} />}

          {/* Event chat */}
          <div className="flex h-[520px] flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
            <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-3">
              <MessagesSquare className="size-4 text-brand-purple" />
              <h2 className="text-sm font-semibold text-white">Event chat</h2>
              <span className="ml-auto text-xs text-muted-foreground">
                Organizers & attendees
              </span>
            </div>
            <ChatPanel
              scope="event"
              channelId={event.id}
              className="min-h-0 flex-1"
              placeholder="Message attendees…"
              emptyHint="Be the first to say something 👋"
              /* Matches `can_access_channel` in migration 0005: the host and
                 confirmed guests only. A pending request is not yet a guest. */
              disabledReason={
                canSeeRoster
                  ? undefined
                  : status === "pending"
                    ? "You'll join the chat once the host approves you"
                    : status === "waitlist"
                      ? "You'll join the chat if a spot opens up"
                      : "RSVP to join the conversation"
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
