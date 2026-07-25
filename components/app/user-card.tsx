"use client";

import Link from "next/link";
import { Award, MapPin } from "lucide-react";
import type { User } from "@/lib/store/types";
import { Avatar } from "./avatar";
import { FriendButton } from "./friend-button";

export function UserCard({ user }: { user: User }) {
  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl transition-colors hover:border-white/20">
      <div className="flex items-start gap-3">
        <Link href={`/u/${user.id}`}>
          <Avatar name={user.name} seed={user.id} size="md" ring />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/u/${user.id}`}
            className="block truncate font-semibold text-white hover:underline"
          >
            {user.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            @{user.handle}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 text-brand-cyan">
              <Award className="size-3" />
              {user.reputation}
            </span>
            {user.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {user.location}
              </span>
            )}
          </div>
        </div>
      </div>

      {user.bio && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {user.bio}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <FriendButton userId={user.id} />
      </div>
    </div>
  );
}
