"use client";

import * as React from "react";
import Link from "next/link";
import { MessageCircle, Users } from "lucide-react";
import {
  useAppStore,
  friendIdsOf,
  dmChannelId,
} from "@/lib/store/use-app-store";
import { useSession } from "@/components/auth/use-session";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Avatar } from "@/components/app/avatar";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";

export default function MessagesPage() {
  const { userId: me } = useSession();
  const usersMap = useAppStore((s) => s.users);
  const requests = useAppStore((s) => s.friendRequests);
  const messages = useAppStore((s) => s.messages);

  const conversations = React.useMemo(() => {
    if (!me) return [];
    const friendIds = friendIdsOf(requests, me);
    return friendIds
      .map((fid) => {
        const channel = dmChannelId(me, fid);
        const msgs = messages
          .filter((m) => m.scope === "dm" && m.channelId === channel)
          .sort((a, b) => b.createdAt - a.createdAt);
        return { user: usersMap[fid], last: msgs[0] };
      })
      .filter((c) => c.user)
      .sort(
        (a, b) => (b.last?.createdAt ?? 0) - (a.last?.createdAt ?? 0)
      );
  }, [me, requests, messages, usersMap]);

  return (
    <div>
      <PageHeader
        eyebrow="Inbox"
        title="Messages"
        description="Direct messages with your friends."
      />

      {conversations.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No conversations yet"
          description="Add friends to start direct messaging. Once you're both connected, you can chat."
          action={
            <Button asChild>
              <Link href="/friends">
                <Users className="size-4" />
                Find friends
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
          {conversations.map(({ user, last }, i) => (
            <Link
              key={user!.id}
              href={`/messages/${user!.id}`}
              className={`flex items-center gap-3 p-4 transition-colors hover:bg-white/[0.03] ${
                i > 0 ? "border-t border-white/[0.06]" : ""
              }`}
            >
              <Avatar name={user!.name} seed={user!.id} size="md" ring />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-white">
                    {user!.name}
                  </span>
                  {last && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(last.createdAt)}
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {last
                    ? `${last.senderId === me ? "You: " : ""}${last.text}`
                    : "Say hi 👋"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
