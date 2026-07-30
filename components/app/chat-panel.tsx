"use client";

import * as React from "react";
import { Send } from "lucide-react";
import {
  useMessages,
  useProfiles,
  useSendMessage,
} from "@/lib/hooks/use-eventerz-data";
import { useRealtimeMessages } from "@/lib/hooks/use-realtime";
import type { MessageScope } from "@/lib/store/types";
import { useSession } from "@/components/auth/use-session";
import { Avatar } from "./avatar";
import { clockTime, dayLabel, fullTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  scope: MessageScope;
  channelId: string;
  className?: string;
  placeholder?: string;
  /** Disable input with a reason (e.g. must be friends / must RSVP). */
  disabledReason?: string;
  emptyHint?: string;
}

function sameDay(a: number, b: number) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function ChatPanel({
  scope,
  channelId,
  className,
  placeholder = "Write a message…",
  disabledReason,
  emptyHint = "No messages yet. Say hello 👋",
}: ChatPanelProps) {
  const { userId } = useSession();

  const { data: rows = [] } = useMessages(channelId);
  const send = useSendMessage(channelId, userId ?? undefined, scope);

  // Live: an INSERT on this channel invalidates the query, so the other side's
  // message appears without polling or a refresh.
  useRealtimeMessages(channelId);

  const messages = React.useMemo(
    () =>
      rows.map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        text: m.body,
        createdAt: Date.parse(m.created_at) || Date.now(),
      })),
    [rows]
  );

  // One batched lookup for every sender in the thread.
  const senderIds = React.useMemo(
    () => Array.from(new Set(messages.map((m) => m.senderId))),
    [messages]
  );
  const { data: senders = [] } = useProfiles(senderIds);
  const users = React.useMemo(
    () => Object.fromEntries(senders.map((u) => [u.id, u])),
    [senders]
  );

  const [text, setText] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !text.trim()) return;
    send.mutate(text);
    setText("");
  };

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-1 overflow-y-auto px-1 py-2"
      >
        {messages.length === 0 && (
          <div className="flex h-full min-h-32 items-center justify-center text-center text-sm text-muted-foreground">
            {emptyHint}
          </div>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showDay = !prev || !sameDay(prev.createdAt, m.createdAt);
          const mine = m.senderId === userId;
          const sender = users[m.senderId];
          const grouped =
            prev &&
            prev.senderId === m.senderId &&
            !showDay &&
            m.createdAt - prev.createdAt < 4 * 60 * 1000;

          return (
            <React.Fragment key={m.id}>
              {showDay && (
                <div className="flex items-center justify-center py-3">
                  <span className="rounded-full bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-muted-foreground">
                    {dayLabel(m.createdAt)}
                  </span>
                </div>
              )}
              <div
                className={cn(
                  "flex items-end gap-2",
                  mine ? "flex-row-reverse" : "flex-row",
                  grouped ? "mt-0.5" : "mt-2"
                )}
              >
                <div className="w-8 shrink-0">
                  {!mine && !grouped && (
                    <Avatar
                      name={sender?.name ?? "?"}
                      seed={m.senderId}
                      size="sm"
                    />
                  )}
                </div>
                <div
                  className={cn(
                    "flex max-w-[78%] flex-col",
                    mine ? "items-end" : "items-start"
                  )}
                >
                  {!mine && !grouped && (
                    <span className="mb-0.5 px-1 text-[11px] font-medium text-muted-foreground">
                      {sender?.name ?? "Unknown"}
                    </span>
                  )}
                  <div
                    title={fullTimestamp(m.createdAt)}
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                      mine
                        ? "rounded-br-md bg-brand-gradient text-white"
                        : "rounded-bl-md border border-white/10 bg-white/[0.05] text-white/90"
                    )}
                  >
                    {m.text}
                  </div>
                  <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                    {clockTime(m.createdAt)}
                  </span>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Composer */}
      {disabledReason ? (
        <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-center text-xs text-muted-foreground">
          {disabledReason}
        </div>
      ) : (
        <form
          onSubmit={handleSend}
          className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 pl-4 backdrop-blur-md focus-within:border-brand-purple/40"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow transition-transform hover:scale-105 disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </form>
      )}
    </div>
  );
}
