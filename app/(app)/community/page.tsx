"use client";

/**
 * Community - friends, requests and messages in one place.
 *
 * The browser half of the app's `(tabs)/community.tsx`, with the same three
 * segments in the same order and the same rule behind them.
 *
 * # Why these three merged
 *
 * They were `/friends` and `/messages`: two nav entries, plus a requests
 * section inside the first, plus - on the phone - two header icons duplicating
 * the two nav entries. All of it answers one question, "who do I know here and
 * what is waiting on me", so it is one destination with three segments.
 *
 * Requests sits in the middle rather than first. It is the only segment that
 * can be empty *and* urgent, so it carries the count; leading with it would put
 * a usually-empty list in front of the list people actually come here for.
 *
 * `/friends` and `/messages` now redirect here, because links to them exist in
 * notification emails and in people's history, and a dead link is a worse
 * outcome than a redirect.
 */

import * as React from "react";
import Link from "next/link";
import {
  Coins,
  Loader2,
  MessageCircle,
  Search,
  UserPlus,
  Users,
} from "lucide-react";

import {
  useConversations,
  useDiscoverablePeople,
  useFriendRequests,
} from "@/lib/hooks/use-eventerz-data";
import { profileToUser } from "@/lib/supabase/map-profile";
import { useSession } from "@/components/auth/use-session";
import { GoogleGate, useHasGoogleAccount } from "@/components/auth/google-gate";
import { PageHeader } from "@/components/app/page-header";
import { UserCard } from "@/components/app/user-card";
import { EmptyState } from "@/components/app/empty-state";
import { Avatar } from "@/components/app/avatar";
import { FriendButton } from "@/components/app/friend-button";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Segment = "friends" | "requests" | "messages";

export default function CommunityPage() {
  const { userId: me } = useSession();
  // Community is Google-gated - see the note at the gate below.
  const hasGoogle = useHasGoogleAccount();
  const [segment, setSegment] = React.useState<Segment>("friends");
  const [query, setQuery] = React.useState("");

  const { data: people = [], isLoading } = useDiscoverablePeople();
  const { data: requests = [] } = useFriendRequests(me ?? undefined);
  const { data: conversations = [] } = useConversations(me ?? undefined);

  const { friends, incoming, outgoing, discover } = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (name: string, handle: string | null) =>
      !q ||
      name.toLowerCase().includes(q) ||
      (handle ?? "").toLowerCase().includes(q);

    const accepted = new Set(
      requests
        .filter((r) => r.status === "accepted")
        .map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id))
    );

    // Requests waiting on *me* to answer.
    const incomingIds = new Set(
      requests
        .filter((r) => r.status === "pending" && r.addressee_id === me)
        .map((r) => r.requester_id)
    );
    // Requests I sent that nobody has answered. Shown so a person can see they
    // already asked, rather than asking again.
    const outgoingIds = new Set(
      requests
        .filter((r) => r.status === "pending" && r.requester_id === me)
        .map((r) => r.addressee_id)
    );

    const visible = people.filter((p) => match(p.name, p.handle));

    return {
      friends: visible.filter((p) => accepted.has(p.id)),
      incoming: visible.filter((p) => incomingIds.has(p.id)),
      outgoing: visible.filter((p) => outgoingIds.has(p.id)),
      discover: visible.filter(
        (p) =>
          !accepted.has(p.id) && !incomingIds.has(p.id) && !outgoingIds.has(p.id)
      ),
    };
  }, [people, requests, me, query]);

  const segments: { value: Segment; label: string; count: number }[] = [
    { value: "friends", label: "Friends", count: friends.length },
    { value: "requests", label: "Requests", count: incoming.length },
    { value: "messages", label: "Messages", count: conversations.length },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Community"
        title="Community"
        description="Your people - friends, requests and conversations."
      />

      {/*
        Community is the one surface that needs a Google account - the same rule
        the app enforces, so the two behave identically. Showing the segments
        and three empty lists instead would read as "nobody uses this" rather
        than "you are not signed in".
      */}
      {!hasGoogle ? (
        <GoogleGate />
      ) : (
      <>
      {/* Segments */}
      <div className="mb-6 inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
        {segments.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSegment(s.value)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              segment === s.value
                ? "bg-white/10 text-white"
                : "text-muted-foreground hover:text-white"
            )}
          >
            {s.label}
            {s.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-bold",
                  s.value === "requests"
                    ? "bg-brand-purple text-white"
                    : "bg-white/10 text-muted-foreground"
                )}
              >
                {s.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {segment === "friends" && (
        <>
          {/*
            Search sits on the Friends segment only. It searches *people*, not
            the loaded friends list - filtering that can only return people
            already added, which is the opposite of what searching is for.
          */}
          <div className="relative mb-8 max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people by name or @handle..."
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] pl-11 pr-4 text-sm text-white placeholder:text-muted-foreground focus:border-brand-purple/40 focus:outline-none"
            />
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading people...
            </div>
          )}

          <section className="mb-10">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-white">
              <Users className="size-5 text-brand-cyan" />
              Your friends
              <span className="text-sm font-normal text-muted-foreground">
                ({friends.length})
              </span>
            </h2>
            {friends.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {friends.map((p) => (
                  <UserCard key={p.id} user={profileToUser(p)} />
                ))}
              </div>
            ) : (
              !isLoading && (
                <EmptyState
                  icon={Users}
                  title="No friends yet"
                  description="Add people from Discover below to start building your network."
                />
              )
            )}
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-white">
              <Search className="size-5 text-brand-purple" />
              Discover people
            </h2>
            {discover.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {discover.map((p) => (
                  <UserCard key={p.id} user={profileToUser(p)} />
                ))}
              </div>
            ) : (
              !isLoading && (
                <p className="text-sm text-muted-foreground">
                  No more people to discover right now.
                </p>
              )
            )}
          </section>
        </>
      )}

      {segment === "requests" &&
        (incoming.length === 0 && outgoing.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No pending requests"
            description="Friend requests you send or receive show up here."
          />
        ) : (
          <div className="space-y-10">
            {incoming.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-white">
                  <UserPlus className="size-5 text-brand-purple" />
                  Waiting on you
                </h2>
                <div className="space-y-2">
                  {incoming.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <Link href={`/u/${p.id}`}>
                        <Avatar
                          name={p.name}
                          seed={p.id}
                          size="md"
                          ring
                          src={p.avatar_url}
                        />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/u/${p.id}`}
                          className="block truncate font-semibold text-white hover:underline"
                        >
                          {p.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          wants to connect
                        </p>
                      </div>
                      <FriendButton userId={p.id} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {outgoing.length > 0 && (
              <section>
                <h2 className="mb-3 font-display text-lg font-semibold text-white">
                  Sent
                </h2>
                <div className="space-y-2">
                  {outgoing.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <Link href={`/u/${p.id}`}>
                        <Avatar
                          name={p.name}
                          seed={p.id}
                          size="md"
                          src={p.avatar_url}
                        />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/u/${p.id}`}
                          className="block truncate font-semibold text-white hover:underline"
                        >
                          {p.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          Request sent
                        </p>
                      </div>
                      <FriendButton userId={p.id} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ))}

      {segment === "messages" &&
        (conversations.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            description="Add friends to start a conversation, or message a host from any event page."
          />
        ) : (
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
            {conversations.map(({ user, last, isFriend }, i) => (
              <Link
                key={user.id}
                href={`/messages/${user.id}`}
                className={`flex items-center gap-3 p-4 transition-colors hover:bg-white/[0.03] ${
                  i > 0 ? "border-t border-white/[0.06]" : ""
                }`}
              >
                <Avatar
                  name={user.name}
                  seed={user.id}
                  size="md"
                  ring
                  src={user.avatar_url}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold text-white">
                        {user.name}
                      </span>
                      {/* An unexplained stranger in an inbox reads as spam.
                          This says where they came from. */}
                      {!isFriend && (
                        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Not a friend
                        </span>
                      )}
                    </span>
                    {last && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {timeAgo(Date.parse(last.created_at))}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {last ? (
                      <>
                        {last.sender_id === me ? "You: " : ""}
                        {last.kind === "payment" ? (
                          <span className="inline-flex items-center gap-1 text-brand-green">
                            <Coins className="size-3" />
                            {last.body}
                          </span>
                        ) : (
                          last.body
                        )}
                      </>
                    ) : (
                      "Say hi 👋"
                    )}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ))}
      </>
      )}
    </div>
  );
}
