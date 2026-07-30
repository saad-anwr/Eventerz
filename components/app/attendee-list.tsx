"use client";

/**
 * Who's going.
 *
 * Two modes, decided by what the viewer is entitled to see rather than by a
 * prop the caller picks:
 *
 *   • Host or confirmed guest → the full roster, names and links.
 *   • Anyone else            → a bounded preview: a few faces and a count.
 *
 * The gate is enforced in Postgres (RLS on `rsvps`, plus a SECURITY DEFINER
 * function for the preview), so this component renders whatever came back
 * rather than deciding who deserves what. If it renders a full list, the
 * database already agreed the viewer could have it.
 */

import * as React from "react";
import Link from "next/link";
import { Lock, Users } from "lucide-react";

import { useEventGuests, useGuestPreview } from "@/lib/hooks/use-eventerz-data";
import { goingCount } from "@/lib/events";
import type { EventItem } from "@/lib/store/types";
import { Avatar } from "./avatar";

const VISIBLE_FACES = 12;

export function AttendeeList({
  event,
  canSeeRoster,
}: {
  event: EventItem;
  canSeeRoster: boolean;
}) {
  const total = goingCount(event);

  // Only one of these actually fetches — the roster query would come back
  // empty for a non-attendee anyway, so asking for it would be a wasted round
  // trip rather than a leak.
  const { data: guests = [] } = useEventGuests(
    canSeeRoster ? event.id : undefined
  );
  const { data: preview = [] } = useGuestPreview(
    canSeeRoster ? undefined : event.id
  );

  const confirmed = guests.filter((g) => g.status === "confirmed");

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-white">
        <Users className="size-5 text-brand-purple" />
        {total === 1 ? "1 person going" : `${total} people going`}
      </h2>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody has joined yet — be the first.
        </p>
      ) : canSeeRoster ? (
        <div className="flex flex-wrap gap-3">
          {confirmed.slice(0, VISIBLE_FACES).map((g) => (
            <Link
              key={g.profile_id}
              href={`/u/${g.profile_id}`}
              className="flex flex-col items-center gap-1.5"
            >
              <Avatar name={g.name} seed={g.profile_id} size="md" ring />
              <span className="max-w-16 truncate text-[11px] text-muted-foreground">
                {g.name.split(" ")[0]}
              </span>
            </Link>
          ))}
          {confirmed.length > VISIBLE_FACES && (
            <span className="flex size-10 items-center justify-center rounded-full bg-white/[0.05] text-xs text-muted-foreground">
              +{confirmed.length - VISIBLE_FACES}
            </span>
          )}
        </div>
      ) : (
        <GuestPreviewRow preview={preview} total={total} />
      )}
    </div>
  );
}

/**
 * The locked view: overlapping faces, a summary sentence, and an honest note
 * about why the rest is hidden.
 */
function GuestPreviewRow({
  preview,
  total,
}: {
  preview: { id: string; name: string; avatar_url: string | null }[];
  total: number;
}) {
  const names = preview.map((p) => p.name.split(" ")[0]);
  const others = Math.max(0, total - preview.length);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-3">
        {preview.length > 0 && (
          <div className="flex -space-x-2.5">
            {preview.map((p) => (
              <span
                key={p.id}
                className="rounded-full ring-2 ring-brand-bg-soft"
              >
                <Avatar name={p.name} seed={p.id} size="sm" />
              </span>
            ))}
            {others > 0 && (
              <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-semibold text-muted-foreground ring-2 ring-brand-bg-soft">
                +{others}
              </span>
            )}
          </div>
        )}
        <p className="min-w-0 text-sm text-white/90">
          {names.length === 0
            ? `${total} going`
            : others > 0
              ? `${names.join(", ")} and ${others} ${others === 1 ? "other" : "others"} are going`
              : `${names.join(", ")} ${names.length === 1 ? "is" : "are"} going`}
        </p>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" />
        The full guest list is visible to confirmed guests.
      </p>
    </div>
  );
}
