"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, Globe, Lock, MapPin, Users } from "lucide-react";
import { useProfile } from "@/lib/hooks/use-eventerz-data";
import { useSession } from "@/components/auth/use-session";
import type { EventItem } from "@/lib/store/types";
import { Avatar } from "./avatar";
import { eventDateParts, formatEventDate, isUpcoming } from "@/lib/format";
import { RSVP_PRESENTATION, goingCount, myRsvpState } from "@/lib/events";
import { cn } from "@/lib/utils";

export function EventCard({ event }: { event: EventItem }) {
  const { userId } = useSession();
  const status = myRsvpState(event, userId);
  const isHost = event.hostId === userId;
  const pendingCount = event.pendingCount ?? 0;
  // Host is fetched per-card but cached by id, so a grid of events sharing a
  // host costs one request, not one per card.
  const { data: host } = useProfile(event.hostId);
  const { month, day } = eventDateParts(event.startsAt);
  const upcoming = isUpcoming(event.startsAt);

  return (
    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
      <Link
        href={`/events/${event.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition-colors hover:border-brand-purple/30"
      >
        {/* Cover */}
        <div
          className={cn(
            "relative h-32 overflow-hidden bg-gradient-to-br",
            event.coverGradient
          )}
        >
          {/* Banner sits over the gradient, which stays as the fallback while
              the image loads or if it fails. */}
          {event.coverImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={event.coverImage}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.35),transparent_55%)]" />
          <div className="absolute left-3 top-3 flex gap-1.5">
            <span className="rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
              {event.category}
            </span>
            {event.tokenGated && (
              <span className="flex items-center gap-1 rounded-full bg-black/30 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                <Lock className="size-2.5" />
                Gated
              </span>
            )}
          </div>
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            <div className="flex flex-col items-center rounded-xl bg-black/40 px-2.5 py-1 backdrop-blur-md">
              <span className="text-[9px] font-semibold uppercase text-white/80">
                {month}
              </span>
              <span className="text-sm font-bold leading-none text-white">
                {day}
              </span>
            </div>
            {!upcoming && (
              <span className="rounded-full bg-black/40 px-2 py-1 text-[10px] font-medium text-white/80 backdrop-blur-md">
                Ended
              </span>
            )}
          </div>
          <span className="absolute bottom-3 right-3 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
            {event.price}
          </span>
          {/*
            Top-right corner reports whichever is relevant to this viewer: for a
            host, requests needing a decision; for a guest, their own state.
            Both matter from a list — otherwise a pending request or a waiting
            approval queue is only discoverable by opening the event.
          */}
          {isHost ? (
            pendingCount > 0 && (
              <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 backdrop-blur-md">
                <Clock className="size-2.5" />
                {pendingCount} to review
              </span>
            )
          ) : status && status !== "cancelled" && status !== "declined" ? (
            <span
              className={cn(
                "absolute right-3 top-3 rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md",
                RSVP_PRESENTATION[status].tone
              )}
            >
              {RSVP_PRESENTATION[status].label}
            </span>
          ) : null}
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col p-4">
          <p className="text-xs text-brand-cyan">
            {formatEventDate(event.startsAt)}
          </p>
          <h3 className="mt-1 line-clamp-2 font-display text-base font-semibold text-white">
            {event.title}
          </h3>

          <div className="mt-3 flex items-center gap-2">
            <Avatar name={host?.name ?? "Host"} seed={event.hostId} size="xs" />
            <span className="truncate text-xs text-muted-foreground">
              {host?.name ?? "Unknown host"}
            </span>
          </div>

          <div className="mt-auto flex items-center gap-3 pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {event.isOnline ? (
                <Globe className="size-3.5" />
              ) : (
                <MapPin className="size-3.5" />
              )}
              <span className="truncate">{event.location}</span>
            </span>
            <span className="flex items-center gap-1">
              <Users className="size-3.5" />
              {goingCount(event)}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
