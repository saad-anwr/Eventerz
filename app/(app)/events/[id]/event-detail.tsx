"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  Clock,
  Globe,
  Hourglass,
  Lock,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Loader2,
  Pencil,
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
import { EventMap } from "@/components/app/event-map";
import { GuestManager } from "@/components/app/guest-manager";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOnChainActions } from "@/lib/solana/use-onchain-actions";
import { FeeCancelled, useFee } from "@/lib/solana/use-fee";
import { formatEventDate } from "@/lib/format";
import {
  RSVP_PRESENTATION,
  filledPercent,
  goingCount,
  hasEnded as eventHasEnded,
  isCancelled,
  isEditable,
  myRsvpState,
  rsvpActionLabel,
  rsvpDetail,
  spotsLeft,
} from "@/lib/events";
import { cn } from "@/lib/utils";

export function EventDetail() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { userId } = useSession();

  const { data: row, isLoading } = useEvent(eventId);
  const event = React.useMemo(() => (row ? eventRowToItem(row) : null), [row]);

  const requestToJoin = useRequestToJoin();
  const cancelRsvp = useCancelRsvp();

  const { data: host } = useProfile(row?.host_id);
  const onChain = useOnChainActions();

  /** $1 in SOL, taken before the seat is claimed. Free off mainnet. */
  const {
    pay: payRsvpFee,
    paying: payingFee,
    label: feeLabel,
    enabled: feesOn,
  } = useFee('rsvp');
  const [joinError, setJoinError] = React.useState('');
  const joining = payingFee || requestToJoin.isPending;

  /**
   * Claim the seat on-chain, then in the database.
   *
   * Deliberately not blocking: `claimSeat` returns null when no program is
   * deployed, and a thrown error is swallowed on purpose. The RSVP is a real
   * Postgres record either way, and refusing to seat someone because an RPC was
   * slow would break a working feature to protect a promise that is additive.
   * The reverse - claiming an on-chain ticket that does not exist - is the
   * failure that would matter, and it cannot happen: the signature is only ever
   * recorded after the cluster confirms it.
   */
  const handleJoin = React.useCallback(async () => {
    if (!event || joining) return;
    setJoinError('');

    /*
     * The $1 fee comes first, and it is non-refundable.
     *
     * Same ordering as the mobile app and for the same reason: RSVPing first
     * would seat people for free whenever the payment failed, and a seat that
     * has been taken cannot be quietly untaken - the host has already seen the
     * guest count move.
     *
     * Note this sits *above* the on-chain seat claim rather than beside it.
     * Those two are not alike: the seat claim is additive and failure-tolerant
     * by design, whereas this decides whether the RSVP happens at all.
     */
    try {
      if ((await payRsvpFee()) === null && feesOn) return;
    } catch (err) {
      if (err instanceof FeeCancelled) return;
      setJoinError(
        err instanceof Error ? err.message : 'Could not take the RSVP fee.',
      );
      return;
    }

    if (onChain.available) {
      try {
        await onChain.claimSeat(event.id, host?.wallet_address);
      } catch (err) {
        console.warn('[eventerz] on-chain seat claim failed', err);
      }
    }
    requestToJoin.mutate(event.id, {
      onError: (err) =>
        setJoinError(
          feesOn
            ? // The fee landed and the seat did not. Telling them to try again
              // invites a second charge for the same event.
              'Your fee was taken but the RSVP did not save. Contact support with your wallet address - do not pay again.'
            : err instanceof Error
              ? err.message
              : 'Could not RSVP. Please try again.',
        ),
    });
  }, [
    event,
    feesOn,
    host?.wallet_address,
    joining,
    onChain,
    payRsvpFee,
    requestToJoin,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading event...
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
  const hasEnded = eventHasEnded(event);
  const cancelled = isCancelled(event);

  /*
   * The roster is gated to the host and confirmed guests, matching the RLS in
   * migration 0005. Everyone else sees a bounded preview.
   */
  const canSeeRoster = isHost || isConfirmed;

  // Whatever the last action was, its failure has to be visible. The previous
  // version dropped mutation errors on the floor, which is what made the RSVP
  // button look inert when the server rejected the call.
  const actionError =
    // The fee path sets its own message, and it takes precedence: it is the
    // only one that can involve money having moved.
    joinError ||
    (requestToJoin.error as Error | null)?.message ||
    (cancelRsvp.error as Error | null)?.message ||
    null;
  // Includes the fee step: the wallet is open and the button must not look idle
  // while a charge is waiting to be approved.
  const busy = joining || cancelRsvp.isPending;


  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to events
        </Link>

        {/* The host's own entry point. Hidden once the event is cancelled or
            over, because `update_event` refuses both and a button that only
            produces an error is worse than no button. */}
        {isHost && isEditable(event) && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/events/${event.id}/edit`}>
              <Pencil className="size-3.5" />
              Edit event
            </Link>
          </Button>
        )}
      </div>

      {cancelled && (
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-semibold text-red-200">
              This event has been cancelled
            </p>
            <p className="mt-0.5 text-xs text-red-200/80">
              {event.cancelReason ??
                "The host called it off. Everyone holding a spot has been notified."}
            </p>
          </div>
        </div>
      )}

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
            // Fall back to the gradient rather than a broken-image icon. See
            // the same handler on `EventCard`.
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
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
            {/* Host-written. Never sent to the translation provider - see
                components/layout/translation-provider.tsx. */}
            <h1
              data-no-translate
              className="font-display text-3xl font-bold tracking-tight text-white"
            >
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
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <Link
              href={`/u/${event.hostId}`}
              className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80"
            >
              <Avatar name={host?.name ?? "Host"} seed={event.hostId} size="md" src={host?.avatar_url} />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Hosted by</p>
                <p className="truncate text-sm font-semibold text-white">
                  {host?.name ?? "Unknown"}
                </p>
              </div>
            </Link>

            {/*
             * Contact host. Deliberately not gated on friendship: someone
             * deciding whether to attend usually has one question, and making
             * them send a friend request first turns a thirty-second exchange
             * into a two-step negotiation. DMs were already open to any two
             * profiles under `can_access_channel`; what was missing was a way
             * in, and an inbox that showed the reply.
             */}
            {!isHost && userId && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/messages/${event.hostId}`}>
                  <MessageSquare className="size-3.5" />
                  Contact host
                </Link>
              </Button>
            )}
            <Link
              href={`/u/${event.hostId}`}
              className="text-xs text-brand-cyan hover:underline"
            >
              View profile →
            </Link>
          </div>

          {/* About */}
          {event.description && (
            <div>
              <h2 className="mb-2 font-display text-lg font-semibold text-white">
                About
              </h2>
              <p
                data-no-translate
                className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground"
              >
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

          {/* The venue. Renders nothing for an online event. */}
          <EventMap
            place={{
              location: event.location,
              latitude: event.latitude,
              longitude: event.longitude,
              placeId: event.placeId,
              address: event.address,
              isOnline: event.isOnline,
            }}
          />

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
                {/*
                 * `rsvpDetail` rather than the raw presentation string: the
                 * waitlist case is specialised to include the guest's place in
                 * the queue. "On the waitlist" alone is not actionable - third
                 * in line means keep the evening free, fortieth means make
                 * other plans.
                 */}
                <p className="mt-1 text-xs opacity-80">
                  {rsvpDetail(event, status)}
                </p>
                {status === "waitlist" && event.waitlistPosition ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-semibold">
                    <Clock className="size-3" />
                    #{event.waitlistPosition} of {event.waitlistCount ?? 0} waiting
                  </p>
                ) : null}
              </div>
            )}

            <div className="mt-4">
              {isHost ? (
                <Button variant="secondary" className="w-full" disabled>
                  <BadgeCheck className="size-4" />
                  You&apos;re hosting
                </Button>
              ) : cancelled ? (
                <Button variant="outline" className="w-full" disabled>
                  <AlertTriangle className="size-4" />
                  Event cancelled
                </Button>
              ) : hasEnded ? (
                <Button variant="outline" className="w-full" disabled>
                  <Clock className="size-4" />
                  Event ended
                </Button>
              ) : status === "confirmed" ||
                status === "pending" ||
                status === "waitlist" ? (
                /* One button for all three live states - cancelling a request
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
                  onClick={() => void handleJoin()}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <BadgeCheck className="size-4" />
                  )}
                  {payingFee
                    ? "Confirm in your wallet..."
                    : busy
                      ? "Sending..."
                      : rsvpActionLabel(event)}
                </Button>
              )}

              {/*
                Say the price before the button is pressed. The charge is not
                refundable, so learning about it from a wallet popup is not good
                enough.
              */}
              {feeLabel && !status && !isHost && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  RSVPing costs a one-off{" "}
                  <span className="text-foreground">{feeLabel}</span>, and is
                  not refundable.
                </p>
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
              placeholder="Message attendees..."
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
