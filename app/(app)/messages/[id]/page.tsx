"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";
import { Loader2 } from "lucide-react";
import {
  dmChannelId,
  useFriendRequests,
  useProfile,
} from "@/lib/hooks/use-eventerz-data";
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

  const { data: other, isLoading } = useProfile(otherId);
  const { data: requests = [] } = useFriendRequests(me ?? undefined);

  const areFriends = React.useMemo(
    () =>
      requests.some(
        (r) =>
          r.status === "accepted" &&
          (r.requester_id === otherId || r.addressee_id === otherId)
      ),
    [requests, otherId]
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading conversation…
      </div>
    );
  }

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
