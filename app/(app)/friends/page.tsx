"use client";

import * as React from "react";
import Link from "next/link";
import { Search, UserPlus, Users } from "lucide-react";
import {
  useAppStore,
  friendIdsOf,
  incomingRequests,
} from "@/lib/store/use-app-store";
import { useSession } from "@/components/auth/use-session";
import { PageHeader } from "@/components/app/page-header";
import { UserCard } from "@/components/app/user-card";
import { EmptyState } from "@/components/app/empty-state";
import { Avatar } from "@/components/app/avatar";
import { FriendButton } from "@/components/app/friend-button";

export default function FriendsPage() {
  const { userId: me } = useSession();
  const usersMap = useAppStore((s) => s.users);
  const requests = useAppStore((s) => s.friendRequests);
  const [query, setQuery] = React.useState("");

  const { friends, incoming, discover } = React.useMemo(() => {
    const all = Object.values(usersMap).filter((u) => u.id !== me);
    const friendIds = new Set(me ? friendIdsOf(requests, me) : []);
    const incomingReqs = me ? incomingRequests(requests, me) : [];
    const incomingIds = new Set(incomingReqs.map((r) => r.from));

    const q = query.trim().toLowerCase();
    const match = (u: (typeof all)[number]) =>
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.handle.toLowerCase().includes(q);

    return {
      friends: all.filter((u) => friendIds.has(u.id) && match(u)),
      incoming: incomingReqs
        .map((r) => usersMap[r.from])
        .filter(Boolean)
        .filter(match),
      discover: all.filter(
        (u) => !friendIds.has(u.id) && !incomingIds.has(u.id) && match(u)
      ),
    };
  }, [usersMap, requests, me, query]);

  return (
    <div>
      <PageHeader
        eyebrow="Community"
        title="Friends"
        description="Connect with people in the ecosystem — add friends and start chatting."
      />

      {/* Search */}
      <div className="relative mb-8 max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] pl-11 pr-4 text-sm text-white placeholder:text-muted-foreground focus:border-brand-purple/40 focus:outline-none"
        />
      </div>

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
            {incoming.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
              >
                <Link href={`/u/${u.id}`}>
                  <Avatar name={u.name} seed={u.id} size="md" ring />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/u/${u.id}`}
                    className="block truncate font-semibold text-white hover:underline"
                  >
                    {u.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    wants to connect
                  </p>
                </div>
                <FriendButton userId={u.id} />
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
            {friends.map((u) => (
              <UserCard key={u.id} user={u} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No friends yet"
            description="Add people from the Discover section below to start building your network."
          />
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
            {discover.map((u) => (
              <UserCard key={u.id} user={u} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No more people to discover right now.
          </p>
        )}
      </section>
    </div>
  );
}
