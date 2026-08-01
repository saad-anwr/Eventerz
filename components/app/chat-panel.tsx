"use client";

import * as React from "react";
import { Send } from "lucide-react";
import {
  useMessages,
  usePayments,
  useProfiles,
  useSendMessage,
} from "@/lib/hooks/use-eventerz-data";
import { useRealtimeMessages } from "@/lib/hooks/use-realtime";
import type { MessageScope } from "@/lib/store/types";
import { useSession } from "@/components/auth/use-session";
import { Avatar } from "./avatar";
import { PaymentReceipt } from "./payment-receipt";
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
  /**
   * Rendered inside the composer, left of the input - the "send crypto" button
   * on a DM thread.
   *
   * A slot rather than a prop for the feature itself: the dialog needs a wallet
   * adapter, a recipient profile and a channel, none of which a chat renderer
   * should know about. Event chat passes nothing and stays exactly as it was.
   */
  composerAction?: React.ReactNode;
}

function sameDay(a: number, b: number) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function ChatPanel({
  scope,
  channelId,
  className,
  placeholder = "Write a message...",
  disabledReason,
  emptyHint = "No messages yet. Say hello 👋",
  composerAction,
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
        kind: m.kind ?? "text",
        paymentId: m.payment_id,
      })),
    [rows]
  );

  /*
   * Receipts referenced by this thread, in one request. A thread with no
   * payments in it makes no request at all - the hook is disabled on an empty
   * id list.
   */
  const paymentIds = React.useMemo(
    () =>
      Array.from(
        new Set(
          messages
            .map((m) => m.paymentId)
            .filter((id): id is string => Boolean(id))
        )
      ),
    [messages]
  );
  const { data: payments = [] } = usePayments(channelId, paymentIds);
  const paymentById = React.useMemo(
    () => new Map(payments.map((p) => [p.id, p])),
    [payments]
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
                      src={sender?.avatar_url}
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
                  {m.kind === "payment" && m.paymentId ? (
                    /*
                     * The receipt renders in place of the bubble. `m.text` is
                     * the generated "Sent 0.4 SOL" line, which stays as the
                     * fallback for the moment before the payment row loads -
                     * and permanently for anyone who can see the message but
                     * not the payment, which RLS on `payments` allows in an
                     * event channel.
                     */
                    (() => {
                      const payment = paymentById.get(m.paymentId);
                      return payment ? (
                        <PaymentReceipt payment={payment} mine={mine} />
                      ) : (
                        <div
                          title={fullTimestamp(m.createdAt)}
                          className="rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-sm text-white/90"
                        >
                          {m.text}
                        </div>
                      );
                    })()
                  ) : (
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
                  )}
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
          className={cn(
            "mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 backdrop-blur-md focus-within:border-brand-purple/40",
            composerAction ? "pl-1.5" : "pl-4"
          )}
        >
          {composerAction}
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
