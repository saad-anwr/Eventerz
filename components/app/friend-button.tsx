"use client";

/**
 * Friend action button.
 *
 * Reads real `friend_requests` rows from Supabase — previously this used the
 * local demo store, which is why people who actually signed up never appeared
 * as addable and requests never reached anyone.
 */

import * as React from "react";
import Link from "next/link";
import {
  Check,
  Clock,
  Loader2,
  MessageCircle,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";

import {
  useFriendRequests,
  useRespondToFriendRequest,
  useSendFriendRequest,
} from "@/lib/hooks/use-eventerz-data";
import { useSession } from "@/components/auth/use-session";
import { Button, type ButtonProps } from "@/components/ui/button";

type Relation = "self" | "none" | "friends" | "outgoing" | "incoming";

/** Shared derivation so the button and the pill can never disagree. */
function useRelation(otherId: string) {
  const { userId: me } = useSession();
  const { data: requests = [], isLoading } = useFriendRequests(me ?? undefined);

  return React.useMemo(() => {
    if (!me || me === otherId) {
      return { relation: "self" as Relation, request: null, me, isLoading };
    }

    const request = requests.find(
      (r) =>
        (r.requester_id === me && r.addressee_id === otherId) ||
        (r.requester_id === otherId && r.addressee_id === me),
    );

    let relation: Relation = "none";
    if (request && request.status !== "declined") {
      relation =
        request.status === "accepted"
          ? "friends"
          : request.requester_id === me
            ? "outgoing"
            : "incoming";
    }

    return { relation, request: request ?? null, me, isLoading };
  }, [requests, me, otherId, isLoading]);
}

interface FriendButtonProps {
  /** The OTHER user. */
  userId: string;
  size?: ButtonProps["size"];
  className?: string;
}

export function FriendButton({
  userId,
  size = "sm",
  className,
}: FriendButtonProps) {
  const { relation, request, me, isLoading } = useRelation(userId);

  const sendRequest = useSendFriendRequest(me ?? undefined);
  const respond = useRespondToFriendRequest();

  if (!me || relation === "self") return null;

  // Hold the slot while the relationship resolves, so the row does not jump.
  if (isLoading) {
    return (
      <Button size={size} variant="secondary" disabled className={className}>
        <Loader2 className="size-4 animate-spin" />
      </Button>
    );
  }

  if (relation === "friends") {
    return (
      <Button asChild size={size} variant="secondary" className={className}>
        <Link href={`/messages/${userId}`}>
          <MessageCircle className="size-4" />
          Message
        </Link>
      </Button>
    );
  }

  if (relation === "outgoing") {
    return (
      <Button size={size} variant="outline" disabled className={className}>
        <Clock className="size-4" />
        Requested
      </Button>
    );
  }

  if (relation === "incoming" && request) {
    return (
      <div className="flex items-center gap-2">
        <Button
          size={size}
          className={className}
          disabled={respond.isPending}
          onClick={() => respond.mutate({ id: request.id, accept: true })}
        >
          {respond.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Accept
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Decline"
          disabled={respond.isPending}
          onClick={() => respond.mutate({ id: request.id, accept: false })}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      size={size}
      variant="secondary"
      className={className}
      disabled={sendRequest.isPending}
      onClick={() => sendRequest.mutate(userId)}
    >
      {sendRequest.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <UserPlus className="size-4" />
      )}
      Add Friend
    </Button>
  );
}

/** Small inline label reflecting friendship state (for profile headers). */
export function FriendStatusPill({ userId }: { userId: string }) {
  const { relation } = useRelation(userId);
  if (relation !== "friends") return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-green/30 bg-brand-green/10 px-2.5 py-1 text-xs font-medium text-brand-green">
      <UserCheck className="size-3.5" />
      Friends
    </span>
  );
}
