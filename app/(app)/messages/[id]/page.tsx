"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";
import {
  useAppStore,
  friendIdsOf,
  dmChannelId,
} from "@/lib/store/use-app-store";
import { useSession } from "@/components/auth/use-session";
import { EmptyState } from "@/components/app/empty-state";
import { Avatar } from "@/components/app/avatar";
import { ChatPanel } from "@/components/app/chat-panel";
import { FriendButton } from "@/components/app/friend-button";
import { Button } from "@/components/ui/button";

export default function DirectMessagePage() {
  const params = useParams<{ id: string }>();
  const otherId = params.id;
  const { userId: me } = useSession();

  const other = useAppStore((s) => s.users[otherId]);
  const requests = useAppStore((s) => s.friendRequests);

  const areFriends = React.useMemo(
    () => (me ? friendIdsOf(requests, me).includes(otherId) : false),
    [requests, me, otherId]
  );

  if (!other) {
    return (
      <EmptyState
        icon={UserRound}
        title="User not found"
        action={
          <Button asChild>
            <Link href="/messages">Back to messages</Link>
          </Button>
        }
      />
    );
  }

  const channel = me ? dmChannelId(me, otherId) : "";

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col lg:h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <Link
          href="/messages"
          className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <Link href={`/u/${other.id}`} className="flex items-center gap-3">
          <Avatar name={other.name} seed={other.id} size="md" ring />
          <div>
            <p className="font-semibold text-white">{other.name}</p>
            <p className="text-xs text-muted-foreground">@{other.handle}</p>
          </div>
        </Link>
        {!areFriends && (
          <div className="ml-auto">
            <FriendButton userId={other.id} />
          </div>
        )}
      </div>

      {/* Chat */}
      <ChatPanel
        scope="dm"
        channelId={channel}
        className="min-h-0 flex-1 pt-3"
        placeholder={`Message ${other.name.split(" ")[0]}…`}
        emptyHint={`This is the start of your conversation with ${other.name}.`}
        disabledReason={
          areFriends
            ? undefined
            : "You can message each other once you're both friends."
        }
      />
    </div>
  );
}
