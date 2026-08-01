"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Coins, Loader2, UserRound } from "lucide-react";
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
import { SendCryptoDialog } from "@/components/app/send-crypto-dialog";
import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/lib/format";

export default function DirectMessagePage() {
  const params = useParams<{ id: string }>();
  const otherId = params.id;
  const { userId: me } = useSession();

  const { data: other, isLoading } = useProfile(otherId);
  const { data: requests = [] } = useFriendRequests(me ?? undefined);
  const [sending, setSending] = React.useState(false);

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
        Loading conversation...
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
  const isSelf = me === otherId;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col lg:h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 pb-4">
        <Link
          href="/messages"
          className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <Link href={`/u/${other.id}`} className="flex min-w-0 items-center gap-3">
          <Avatar name={other.name} seed={other.id} size="md" ring src={other.avatar_url} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{other.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              @{other.handle}
              {other.wallet_address
                ? ` · ${shortenAddress(other.wallet_address)}`
                : ""}
            </p>
          </div>
        </Link>
        {!areFriends && !isSelf && (
          <div className="ml-auto">
            <FriendButton userId={other.id} />
          </div>
        )}
      </div>

      {/*
       * Chat, open to anyone.
       *
       * The friendship gate that used to be here contradicted the database:
       * `can_access_channel` admits either party to a DM channel and always
       * has, so the message would send fine - the UI just refused to let you
       * type it. It also made "Contact host" impossible, since a guest asking
       * a question is by definition not yet a friend.
       */}
      <ChatPanel
        scope="dm"
        channelId={channel}
        className="min-h-0 flex-1 pt-3"
        placeholder={`Message ${other.name.split(" ")[0]}...`}
        emptyHint={`This is the start of your conversation with ${other.name}.`}
        disabledReason={
          isSelf ? "This is you." : !me ? "Sign in to send messages." : undefined
        }
        composerAction={
          isSelf || !me ? undefined : (
            <button
              type="button"
              onClick={() => setSending(true)}
              title={
                other.wallet_address
                  ? `Send SOL to ${other.name.split(" ")[0]}`
                  : `${other.name.split(" ")[0]} has not linked a wallet`
              }
              aria-label="Send crypto"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-brand-cyan transition-colors hover:border-brand-cyan/40 hover:bg-brand-cyan/10"
            >
              <Coins className="size-4" />
            </button>
          )
        }
      />

      <SendCryptoDialog
        open={sending}
        onClose={() => setSending(false)}
        channelId={channel}
        recipient={{
          id: other.id,
          name: other.name,
          walletAddress: other.wallet_address,
        }}
      />
    </div>
  );
}
