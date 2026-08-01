"use client";

/**
 * Friends.
 *
 * Reads real profiles from Supabase. Previously this listed the seeded demo
 * users from the local store, so anyone who actually signed up was invisible
 * to everyone else - which is exactly the bug this fixes.
 */

import * as React from "react";
import Link from "next/link";
import { Loader2, Search, UserPlus, Users } from "lucide-react";

import {
  useDiscoverablePeople,
  useFriendRequests,
} from "@/lib/hooks/use-eventerz-data";
import { profileToUser } from "@/lib/supabase/map-profile";
import { useSession } from "@/components/auth/use-session";
import { PageHeader } from "@/components/app/page-header";
import { UserCard } from "@/components/app/user-card";
import { EmptyState } from "@/components/app/empty-state";
import { Avatar } from "@/components/app/avatar";
import { FriendButton } from "@/components/app/friend-button";

export default function FriendsPage() {
  const { userId: me } = useSession();
  const [query, setQuery] = React.useState("");

  const { data: people = [], isLoading } = useDiscoverablePeople();
  const { data: requests = [] } = useFriendRequests(me ?? undefined);

  const { friends, incoming, discover } = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (name: string, handle: string | null) =>
      !q ||
      name.toLowerCase().includes(q) ||
      (handle ?? "").toLowerCase().includes(q);

    const accepted = new Set(
      requests
        .filter((r) => r.status === "accepted")
        .map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id)),
    );

    // Requests waiting on *me* to answer.
    const incomingIds = new Set(
      requests
        .filter((r) => r.status === "pending" && r.addressee_id === me)
        .map((r) => r.requester_id),
    );

    const visible = people.filter((p) => match(p.name, p.handle));

    return {
      friends: visible.filter((p) => accepted.has(p.id)),
      incoming: visible.filter((p) => incomingIds.has(p.id)),
      discover: visible.filter(
        (p) => !accepted.has(p.id) && !incomingIds.has(p.id),
      ),
    };
  }, [people, requests, me, query]);

  return (
    <div>
      <PageHeader
        eyebrow="Community"
        title="Friends"
        description="Connect with people in the ecosystem - add friends and start chatting."
      />

      {/* Search */}
      <div className="relative mb-8 max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people..."
          className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] pl-11 pr-4 text-sm text-white placeholder:text-muted-foreground focus:border-brand-purple/40 focus:outline-none"
        />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading people...
        </div>
      )}

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-white">
            <UserPlus className="size-5 text-brand-purple" />
            Friend requests
            <span className="flex size-5 items-center justify-center rounded-full bg-brand-purple text-[11px] font-bold text-white">
              {incoming.length}
            </span>
          </h2>
          <div className="space-y-2">
            {incoming.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
              >
                <Link href={`/u/${p.id}`}>
                  <Avatar name={p.name} seed={p.id} size="md" ring src={p.avatar_url} />
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

      {/* Friends */}
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
              description="Add people from the Discover section below to start building your network."
            />
          )
        )}
      </section>

      {/* Discover */}
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
    </div>
  );
}
