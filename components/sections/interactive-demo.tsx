"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  Loader2,
  MapPin,
  QrCode,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/ui/logo";
import { demoEvents } from "@/lib/data";
import { cn } from "@/lib/utils";

type RsvpState = "idle" | "minting" | "done";

function ReputationRing({ score = 78 }: { score?: number }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative flex size-24 items-center justify-center">
      <svg className="size-24 -rotate-90" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="6"
        />
        <motion.circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="url(#rep-grad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          whileInView={{
            strokeDashoffset: circumference - (score / 100) * circumference,
          }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease: "easeOut", delay: 0.3 }}
        />
        <defs>
          <linearGradient id="rep-grad" x1="0" y1="0" x2="80" y2="80">
            <stop stopColor="#9945FF" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-xl font-bold text-white">
          <AnimatedCounter value={score} suffix="0" />
        </span>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
          Rep
        </span>
      </div>
    </div>
  );
}

export function InteractiveDemo() {
  const [selectedId, setSelectedId] = React.useState(demoEvents[0].id);
  const [rsvp, setRsvp] = React.useState<Record<string, RsvpState>>({});

  const selected = demoEvents.find((e) => e.id === selectedId)!;
  const state = rsvp[selectedId] ?? "idle";
  const isDone = state === "done";

  const handleRsvp = () => {
    if (state !== "idle") return;
    setRsvp((r) => ({ ...r, [selectedId]: "minting" }));
    window.setTimeout(() => {
      setRsvp((r) => ({ ...r, [selectedId]: "done" }));
    }, 1400);
  };

  const spotsLeft = selected.spotsLeft - (isDone ? 1 : 0);
  const filled = Math.round(
    ((selected.totalSpots - spotsLeft) / selected.totalSpots) * 100
  );

  return (
    <section id="demo" className="section">
      <div className="container">
        <SectionHeading
          eyebrow="Live Demo"
          icon={<Sparkles className="size-3.5 text-brand-purple" />}
          title={
            <>
              Experience the <span className="text-gradient">on-chain app</span>
            </>
          }
          description="This is a live preview. Pick an event, RSVP on-chain and watch your NFT ticket mint in real time."
        />

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7 }}
          className="mt-14"
        >
          {/* App window */}
          <div className="gradient-border overflow-hidden rounded-4xl bg-brand-bg-soft/60 shadow-card backdrop-blur-2xl">
            {/* top bar */}
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-1.5 sm:flex">
                  <span className="size-2.5 rounded-full bg-red-400/70" />
                  <span className="size-2.5 rounded-full bg-yellow-400/70" />
                  <span className="size-2.5 rounded-full bg-green-400/70" />
                </div>
                <Logo />
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white sm:flex">
                  <Wallet className="size-3.5 text-brand-blue" />◎ 12.84
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-brand-green/30 bg-brand-green/10 px-3 py-1.5 text-xs font-medium text-brand-green">
                  <span className="size-1.5 animate-pulse rounded-full bg-brand-green" />
                  9xQe…4dRt
                </span>
              </div>
            </div>

            {/* body */}
            <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.85fr)]">
              {/* Column 1 — Upcoming events */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Upcoming Events
                  </h3>
                  <Badge variant="purple">{demoEvents.length}</Badge>
                </div>
                <div className="space-y-2.5">
                  {demoEvents.map((event) => {
                    const active = event.id === selectedId;
                    return (
                      <button
                        key={event.id}
                        onClick={() => setSelectedId(event.id)}
                        className={cn(
                          "w-full rounded-2xl border p-3 text-left transition-all duration-300",
                          active
                            ? "border-brand-purple/40 bg-brand-purple/[0.08]"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br text-white",
                              event.gradient
                            )}
                          >
                            <span className="text-[9px] font-medium uppercase leading-none opacity-90">
                              {event.date.split(" ")[0]}
                            </span>
                            <span className="text-sm font-bold leading-tight">
                              {event.date.split(" ")[1]}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">
                              {event.title}
                            </p>
                            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <MapPin className="size-3" />
                              {event.location} · {event.price}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Column 2 — Event detail + RSVP */}
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div
                  className={cn(
                    "relative h-28 overflow-hidden rounded-xl bg-gradient-to-br",
                    selected.gradient
                  )}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.35),transparent_55%)]" />
                  <div className="absolute bottom-3 left-3 flex gap-1.5">
                    {selected.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <h3 className="mt-3 font-display text-lg font-semibold text-white">
                  {selected.title}
                </h3>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3.5" />
                    {selected.date} · {selected.time}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" />
                    hosted by {selected.host}
                  </span>
                </div>

                {/* spots progress */}
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {spotsLeft} spots left
                    </span>
                    <span className="font-medium text-white">{filled}% full</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full rounded-full bg-brand-gradient"
                      initial={false}
                      animate={{ width: `${filled}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* RSVP button */}
                <button
                  onClick={handleRsvp}
                  disabled={state !== "idle"}
                  className={cn(
                    "group relative mt-4 flex h-11 items-center justify-center gap-2 overflow-hidden rounded-xl text-sm font-semibold text-white transition-all",
                    isDone
                      ? "bg-brand-green/15 text-brand-green"
                      : "bg-brand-gradient shadow-glow hover:scale-[1.02] active:scale-[0.98]"
                  )}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {state === "idle" && (
                      <motion.span
                        key="idle"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="flex items-center gap-2"
                      >
                        <BadgeCheck className="size-4" />
                        RSVP On-chain
                      </motion.span>
                    )}
                    {state === "minting" && (
                      <motion.span
                        key="minting"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        <Loader2 className="size-4 animate-spin" />
                        Minting ticket…
                      </motion.span>
                    )}
                    {state === "done" && (
                      <motion.span
                        key="done"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        <Check className="size-4" />
                        You&apos;re going!
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </motion.div>

              {/* Column 3 — Reputation, ticket, QR */}
              <div className="space-y-4">
                {/* Reputation + wallet */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Reputation
                      </p>
                      <p className="flex items-center gap-1 text-sm font-medium text-brand-green">
                        <TrendingUp className="size-3.5" /> Rising
                      </p>
                    </div>
                    <ReputationRing score={isDone ? 82 : 78} />
                  </div>
                </div>

                {/* NFT ticket / QR */}
                <div className="relative min-h-[168px] rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <AnimatePresence mode="wait">
                    {isDone ? (
                      <motion.div
                        key="ticket"
                        initial={{ opacity: 0, scale: 0.9, rotateY: -20 }}
                        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-col items-center"
                      >
                        <div className="mb-2 flex w-full items-center justify-between">
                          <span className="flex items-center gap-1 text-xs font-semibold text-brand-purple">
                            <Ticket className="size-3.5" /> NFT Ticket
                          </span>
                          <Badge variant="green">Minted</Badge>
                        </div>
                        <div className="grid size-24 grid-cols-6 grid-rows-6 gap-0.5 rounded-xl bg-white/[0.04] p-2">
                          {Array.from({ length: 36 }).map((_, i) => (
                            <span
                              key={i}
                              className={cn(
                                "rounded-[1px]",
                                (i * 5 + 2) % 3 === 0
                                  ? "bg-white/90"
                                  : "bg-transparent"
                              )}
                            />
                          ))}
                        </div>
                        <p className="mt-2 flex items-center gap-1 text-[11px] text-brand-green">
                          <QrCode className="size-3" /> Scan to check in
                        </p>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex h-full min-h-[136px] flex-col items-center justify-center text-center"
                      >
                        <div className="flex size-11 items-center justify-center rounded-xl bg-white/[0.04] text-muted-foreground">
                          <Ticket className="size-5" />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          RSVP to mint your
                          <br /> NFT ticket
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
