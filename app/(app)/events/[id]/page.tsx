"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  Clock,
  Globe,
  Lock,
  MapPin,
  MessagesSquare,
  Users,
  Loader2,
} from "lucide-react";
import {
  useEvent,
  useProfile,
  useProfiles,
  useToggleRsvp,
} from "@/lib/hooks/use-eventerz-data";
import { eventRowToItem } from "@/lib/supabase/map-event";
import { useSession } from "@/components/auth/use-session";
import { EmptyState } from "@/components/app/empty-state";
import { Avatar } from "@/components/app/avatar";
import { ChatPanel } from "@/components/app/chat-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatEventDate, isUpcoming } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { userId } = useSession();

  const { data: row, isLoading } = useEvent(eventId);
  const event = React.useMemo(() => (row ? eventRowToItem(row) : null), [row]);
  const toggleRsvp = useToggleRsvp(userId ?? undefined);

  const { data: host } = useProfile(row?.host_id);
  const { data: attendees = [] } = useProfiles(row?.attendee_ids ?? []);

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
  const isAttending = !!userId && event.attendeeIds.includes(userId);
  const spotsLeft = event.capacity - event.attendeeIds.length;
  const filled = Math.min(
    100,
    Math.round((event.attendeeIds.length / event.capacity) * 100)
  );
  const upcoming = isUpcoming(event.startsAt);


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

          {/* Attendees */}
          <div>
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-white">
              <Users className="size-5 text-brand-purple" />
              Attendees
              <span className="text-sm font-normal text-muted-foreground">
                ({attendees.length})
              </span>
            </h2>
            <div className="flex flex-wrap gap-3">
              {attendees.slice(0, 12).map((a) => (
                <Link
                  key={a.id}
                  href={`/u/${a.id}`}
                  className="flex flex-col items-center gap-1.5"
                >
                  <Avatar name={a.name} seed={a.id} size="md" ring />
                  <span className="max-w-16 truncate text-[11px] text-muted-foreground">
                    {a.name.split(" ")[0]}
                  </span>
                </Link>
              ))}
              {attendees.length > 12 && (
                <span className="flex size-10 items-center justify-center rounded-full bg-white/[0.05] text-xs text-muted-foreground">
                  +{attendees.length - 12}
                </span>
              )}
            </div>
          </div>
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
                {spotsLeft > 0 ? `${spotsLeft} spots left` : "Sold out"}
              </span>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-brand-gradient transition-all"
                style={{ width: `${filled}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {event.attendeeIds.length} / {event.capacity} registered
            </p>

            <div className="mt-4">
              {isHost ? (
                <Button variant="secondary" className="w-full" disabled>
                  <BadgeCheck className="size-4" />
                  You&apos;re hosting
                </Button>
              ) : isAttending ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => userId && toggleRsvp.mutate(event.id)}
                >
                  <Check className="size-4 text-brand-green" />
                  You&apos;re going · Cancel
                </Button>
              ) : !upcoming ? (
                <Button variant="outline" className="w-full" disabled>
                  <Clock className="size-4" />
                  Event ended
                </Button>
              ) : (
                <Button
                  className="w-full"
                  disabled={spotsLeft <= 0}
                  onClick={() => userId && toggleRsvp.mutate(event.id)}
                >
                  <BadgeCheck className="size-4" />
                  {event.requiresApproval ? "Request to join" : "RSVP on-chain"}
                </Button>
              )}
            </div>
            {event.requiresApproval && !isHost && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Host approval required
              </p>
            )}
          </div>

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
              disabledReason={
                isHost || isAttending
                  ? undefined
                  : "RSVP to join the conversation"
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
