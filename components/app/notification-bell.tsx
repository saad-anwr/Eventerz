"use client";

/**
 * Notification bell.
 *
 * This is the channel the approval flow reports back through: the guest asks to
 * join, the host approves or declines, and a row appears here. Because
 * `notifications` streams over Realtime and the global subscription invalidates
 * this query, the decision arrives while the guest is looking at the page —
 * no refresh, no polling.
 *
 * Rows are written by the SECURITY DEFINER functions in migration 0005 rather
 * than by either client, so both parties are notified even when the other one
 * is offline.
 */

import * as React from "react";
import Link from "next/link";
import { Bell, Check, Loader2 } from "lucide-react";

import {
  useMarkNotificationsRead,
  useNotifications,
} from "@/lib/hooks/use-eventerz-data";
import { useSession } from "@/components/auth/use-session";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { userId } = useSession();
  const { data: items = [], isLoading } = useNotifications(userId ?? undefined);
  const markRead = useMarkNotificationsRead(userId ?? undefined);
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const unread = items.filter((n) => !n.read).length;

  // Close on outside click and on Escape — a dropdown that traps the page is
  // worse than no dropdown.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-brand-purple px-1 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-white/10 bg-brand-bg-soft/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Notifications</h2>
            {unread > 0 && (
              <button
                onClick={() => markRead.mutate()}
                disabled={markRead.isPending}
                className="flex items-center gap-1 text-xs text-brand-cyan hover:underline disabled:opacity-50"
              >
                {markRead.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing yet. RSVPs, approvals and messages show up here.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {items.map((n) => {
                  const body = (
                    <>
                      <p
                        className={cn(
                          "text-sm font-medium",
                          n.read ? "text-white/70" : "text-white"
                        )}
                      >
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {timeAgo(Date.parse(n.created_at))}
                      </p>
                    </>
                  );

                  return (
                    <li
                      key={n.id}
                      className={cn(
                        "relative px-4 py-3 transition-colors hover:bg-white/[0.03]",
                        !n.read && "bg-brand-purple/[0.06]"
                      )}
                    >
                      {!n.read && (
                        <span className="absolute left-1.5 top-4 size-1.5 rounded-full bg-brand-purple" />
                      )}
                      {n.href ? (
                        <Link href={n.href} onClick={() => setOpen(false)}>
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
