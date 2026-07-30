"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Award,
  Globe2,
  MapPin,
  Ticket,
  Twitter,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { Loader2 } from "lucide-react";
import {
  useEventsByHost,
  useFriendRequests,
  useProfile,
} from "@/lib/hooks/use-eventerz-data";
import { eventRowToItem } from "@/lib/supabase/map-event";
import { profileToUser } from "@/lib/supabase/map-profile";
import { useSession } from "@/components/auth/use-session";
import { Avatar } from "@/components/app/avatar";
import { EventCard } from "@/components/app/event-card";
import { EmptyState } from "@/components/app/empty-state";
import { FriendButton, FriendStatusPill } from "@/components/app/friend-button";
import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/lib/format";

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { userId: me } = useSession();

  const { data: row, isLoading } = useProfile(id);
  const user = React.useMemo(() => (row ? profileToUser(row) : null), [row]);
  const { data: hostedRows = [] } = useEventsByHost(id);

  /*
   * RLS only exposes friend_requests you are party to, so a visitor cannot see
   * someone else's full friend list. This counts the connections *you* share
   * with them, which is the honest number to show.
   */
  const { data: requests = [] } = useFriendRequests(me ?? undefined);
  const friendCount = React.useMemo(
    () =>
      requests.filter(
        (r) =>
          r.status === "accepted" &&
          (r.requester_id === id || r.addressee_id === id)
      ).length,
    [requests, id]
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading profile…
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState
        icon={UserRound}
        title="User not found"
        description="This profile doesn't exist or was removed."
        action={
          <Button asChild>
            <Link href="/friends">Discover people</Link>
          </Button>
        }
      />
    );
  }

  const isMe = me === id;
  const hosted = hostedRows.map(eventRowToItem);

  return (
    <div>
      <Link
        href="/friends"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-white"
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand-blue/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={user.name} seed={user.id} size="xl" ring />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-bold text-white">
                {user.name}
              </h1>
              <FriendStatusPill userId={user.id} />
            </div>
            <p className="text-sm text-muted-foreground">@{user.handle}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-2.5 py-1 text-xs font-medium text-brand-cyan">
                <Award className="size-3.5" />
                {user.reputation} rep
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-muted-foreground">
                <Users className="size-3.5" />
                {friendCount} friends
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {isMe ? (
              <Button asChild variant="secondary">
                <Link href="/profile">Edit profile</Link>
              </Button>
            ) : (
              <FriendButton userId={user.id} size="default" />
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {user.bio && (
            <section>
              <h2 className="mb-2 font-display text-lg font-semibold text-white">
                About
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {user.bio}
              </p>
            </section>
          )}

          {user.interests.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-lg font-semibold text-white">
                Interests
              </h2>
              <div className="flex flex-wrap gap-2">
                {user.interests.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Ticket className="size-5 text-brand-purple" />
              <h2 className="font-display text-lg font-semibold text-white">
                Hosting ({hosted.length})
              </h2>
            </div>
            {hosted.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {hosted.slice(0, 4).map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not hosting any events yet.
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="mb-3 text-sm font-semibold text-white">Details</h3>
            <ul className="space-y-3 text-sm">
              {user.location && (
                <li className="flex items-center gap-2.5 text-muted-foreground">
                  <MapPin className="size-4 shrink-0" />
                  {user.location}
                </li>
              )}
              {user.website && (
                <li className="flex items-center gap-2.5 text-muted-foreground">
                  <Globe2 className="size-4 shrink-0" />
                  <span className="truncate">{user.website}</span>
                </li>
              )}
              {user.twitter && (
                <li className="flex items-center gap-2.5 text-muted-foreground">
                  <Twitter className="size-4 shrink-0" />@{user.twitter}
                </li>
              )}
              {user.walletAddress && (
                <li className="flex items-center gap-2.5 text-brand-green">
                  <Wallet className="size-4 shrink-0" />
                  {shortenAddress(user.walletAddress)}
                </li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
