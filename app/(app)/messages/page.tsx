"use client";

import * as React from "react";
import Link from "next/link";
import { Coins, MessageCircle, Users } from "lucide-react";
import { useConversations } from "@/lib/hooks/use-eventerz-data";
import { useSession } from "@/components/auth/use-session";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Avatar } from "@/components/app/avatar";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";

export default function MessagesPage() {
  const { userId: me } = useSession();

  // Friends plus their latest message, resolved server-side.
  const { data: conversations = [] } = useConversations(me ?? undefined);

  return (
    <div>
      <PageHeader
        eyebrow="Inbox"
        title="Messages"
        description="Direct messages, and anyone who has reached out about an event."
      />

      {conversations.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No conversations yet"
          description="Add friends to start a conversation, or message a host from any event page."
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
          {conversations.map(({ user, last, isFriend }, i) => (
            <Link
              key={user.id}
              href={`/messages/${user.id}`}
              className={`flex items-center gap-3 p-4 transition-colors hover:bg-white/[0.03] ${
                i > 0 ? "border-t border-white/[0.06]" : ""
              }`}
            >
              <Avatar name={user.name} seed={user.id} size="md" ring />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-white">
                      {user.name}
                    </span>
                    {/* An unexplained stranger in an inbox reads as spam. This
                        says where they came from. */}
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
      )}
    </div>
  );
}
