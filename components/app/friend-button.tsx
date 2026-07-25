"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Clock, MessageCircle, UserCheck, UserPlus, X } from "lucide-react";
import { useAppStore } from "@/lib/store/use-app-store";
import { useSession } from "@/components/auth/use-session";
import { Button, type ButtonProps } from "@/components/ui/button";

interface FriendButtonProps {
  userId: string; // the OTHER user
  size?: ButtonProps["size"];
  className?: string;
}

export function FriendButton({ userId, size = "sm", className }: FriendButtonProps) {
  const { userId: me } = useSession();
  const requests = useAppStore((s) => s.friendRequests);
  const sendFriendRequest = useAppStore((s) => s.sendFriendRequest);
  const respondFriendRequest = useAppStore((s) => s.respondFriendRequest);

  const rel = React.useMemo(() => {
    if (!me || me === userId) return "self" as const;
    const req = requests.find(
      (r) =>
        (r.from === me && r.to === userId) ||
        (r.from === userId && r.to === me)
    );
    if (!req || req.status === "declined") return "none" as const;
    if (req.status === "accepted") return "friends" as const;
    return req.from === me ? ("outgoing" as const) : ("incoming" as const);
  }, [requests, me, userId]);

  const incomingReq = React.useMemo(
    () =>
      requests.find(
        (r) => r.from === userId && r.to === me && r.status === "pending"
      ),
    [requests, userId, me]
  );

  if (!me || rel === "self") return null;

  if (rel === "friends") {
    return (
      <Button asChild size={size} variant="secondary" className={className}>
        <Link href={`/messages/${userId}`}>
          <MessageCircle className="size-4" />
          Message
        </Link>
      </Button>
    );
  }

  if (rel === "outgoing") {
    return (
      <Button size={size} variant="outline" disabled className={className}>
        <Clock className="size-4" />
        Requested
      </Button>
    );
  }

  if (rel === "incoming") {
    return (
      <div className="flex items-center gap-2">
        <Button
          size={size}
          className={className}
          onClick={() => incomingReq && respondFriendRequest(incomingReq.id, true)}
        >
          <Check className="size-4" />
          Accept
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Decline"
          onClick={() =>
            incomingReq && respondFriendRequest(incomingReq.id, false)
          }
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  // none
  return (
    <Button
      size={size}
      variant="secondary"
      className={className}
      onClick={() => sendFriendRequest(me, userId)}
    >
      <UserPlus className="size-4" />
      Add Friend
    </Button>
  );
}

/** Small inline label reflecting friendship state (for profile headers). */
export function FriendStatusPill({ userId }: { userId: string }) {
  const { userId: me } = useSession();
  const requests = useAppStore((s) => s.friendRequests);
  const areFriends = React.useMemo(
    () =>
      !!me &&
      requests.some(
        (r) =>
          r.status === "accepted" &&
          ((r.from === me && r.to === userId) ||
            (r.from === userId && r.to === me))
      ),
    [requests, me, userId]
  );
  if (!areFriends) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-green/30 bg-brand-green/10 px-2.5 py-1 text-xs font-medium text-brand-green">
      <UserCheck className="size-3.5" />
      Friends
    </span>
  );
}
