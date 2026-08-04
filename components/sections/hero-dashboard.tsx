"use client";

import * as React from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  Wallet,
  Ticket,
  QrCode,
  BadgeCheck,
  CalendarDays,
  MapPin,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Parallax layer - translates based on shared pointer motion values. */
function Layer({
  children,
  depth,
  mx,
  my,
  className,
  float,
  floatDelay = 0,
}: {
  children: React.ReactNode;
  depth: number;
  mx: MotionValue<number>;
  my: MotionValue<number>;
  className?: string;
  float?: boolean;
  floatDelay?: number;
}) {
  const x = useTransform(mx, (v) => v * depth);
  const y = useTransform(my, (v) => v * depth);
  return (
    <motion.div
      style={{ x, y }}
      className={cn("absolute", className)}
      animate={float ? { y: [0, -12, 0] } : undefined}
      transition={
        float
          ? {
              duration: 5 + floatDelay,
              repeat: Infinity,
              ease: "easeInOut",
              delay: floatDelay,
            }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}


/* -------------------------------------------------------------------------- */
/*  The four feature cards                                                     */
/*                                                                             */
/*  Defined once and rendered twice: floating around the dashboard from `md`   */
/*  up, and as a plain two-column grid beneath it below that. Only the wrapper */
/*  differs, so the two layouts cannot drift apart.                            */
/* -------------------------------------------------------------------------- */

function TicketCard() {
  return (
    <div className="gradient-border h-full rounded-2xl bg-brand-bg-soft/90 p-3 shadow-glow backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-brand-purple">
          <Ticket className="size-3" /> NFT Ticket
        </span>
        <Sparkles className="size-3 text-brand-cyan" />
      </div>
      <div className="relative h-16 overflow-hidden rounded-xl bg-brand-gradient">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.4),transparent_60%)]" />
        <div className="absolute bottom-2 left-2 text-[9px] font-medium text-white/90">
          #04821
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
        <span>Compressed</span>
        <span className="text-brand-green">Verified</span>
      </div>
    </div>
  );
}

function ReputationCard() {
  return (
    <div className="gradient-border h-full rounded-2xl bg-brand-bg-soft/90 p-3 shadow-glow-cyan backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-cyan/15 text-brand-cyan">
          <BadgeCheck className="size-4" />
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground">Reputation</div>
          <div className="font-display text-base font-bold text-white">
            Level 7
          </div>
        </div>
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: "78%" }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.4 }}
          className="h-full rounded-full bg-gradient-to-r from-brand-cyan to-brand-green"
        />
      </div>
    </div>
  );
}

function BalanceCard() {
  return (
    <div className="gradient-border h-full rounded-2xl bg-brand-bg-soft/90 p-3 shadow-glow-blue backdrop-blur-xl">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-brand-blue">
        <Wallet className="size-3" /> Balance
      </div>
      <div className="font-display text-lg font-bold text-white">◎ 12.84</div>
      <div className="flex items-center gap-1 text-[9px] text-brand-green">
        <TrendingUp className="size-2.5" /> +4.2% today
      </div>
    </div>
  );
}

function CheckInCard() {
  return (
    <div className="gradient-border h-full rounded-2xl bg-brand-bg-soft/90 p-3 text-center shadow-glow backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-center gap-1 text-[10px] font-semibold text-brand-purple">
        <QrCode className="size-3" /> Check-in
      </div>
      <div className="mx-auto grid size-16 grid-cols-5 grid-rows-5 gap-0.5 rounded-lg bg-white/[0.04] p-1.5">
        {Array.from({ length: 25 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "rounded-[1px]",
              // deterministic pseudo-random pattern
              (i * 7 + 3) % 3 === 0 ? "bg-white/85" : "bg-transparent"
            )}
          />
        ))}
      </div>
      <div className="mt-1.5 text-[9px] text-brand-green">Scan to enter</div>
    </div>
  );
}

export function HeroDashboard() {
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const mx = useSpring(rawX, { stiffness: 120, damping: 20 });
  const my = useSpring(rawY, { stiffness: 120, damping: 20 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    rawX.set((e.clientX - rect.left) / rect.width - 0.5);
    rawY.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const reset = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <div
      onMouseMove={handleMove}
      onMouseLeave={reset}
      className="relative mx-auto w-full max-w-2xl md:aspect-[16/11]"
    >
      {/* Glow behind */}
      <div className="absolute left-1/2 top-1/2 -z-10 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-purple/25 blur-[90px]" />

      {/*
        ---- Main dashboard panel ----

        In normal flow on mobile, absolutely positioned from `md` up. Two
        separate faults made this overlap the stats block underneath it:

        1. The container had a fixed aspect ratio, and the panel inside it was
           absolutely positioned and centred. The panel's height comes from its
           content - window chrome, an event card, three mini stats - which on a
           narrow screen is *taller* than the aspect box. With nothing clipping
           it, the excess spilled out of the bottom and straight over the stats
           grid that follows. Clipping it would have been worse: the fix is for
           the box to be as tall as its contents, which is what normal flow does
           for free.

        2. It was centred with `left-1/2 -translate-x-1/2`, and framer-motion
           writes `transform` inline to drive the parallax. An inline style beats
           a class, so the translate never applied and the panel sat half a width
           right of where it looked like it should - visible on desktop too, as a
           composition that was subtly off-centre.

        Both go away by positioning from the edge instead of the centre:
        `w-[78%]` at `left-[11%]` is centred by arithmetic ((100-78)/2), needs no
        transform, and so cannot be clobbered by one. `inset-y-0 my-auto h-fit`
        does the vertical centring the same way.
      */}
      <Layer
        depth={-18}
        mx={mx}
        my={my}
        className="relative w-full md:absolute md:inset-y-0 md:left-[11%] md:my-auto md:h-fit md:w-[78%]"
      >
        <div className="gradient-border overflow-hidden rounded-3xl bg-brand-bg-soft/80 shadow-card backdrop-blur-2xl">
          {/* window chrome */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-red-400/70" />
              <span className="size-2.5 rounded-full bg-yellow-400/70" />
              <span className="size-2.5 rounded-full bg-green-400/70" />
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-brand-green/30 bg-brand-green/10 px-2.5 py-1 text-[10px] font-medium text-brand-green">
              <span className="size-1.5 animate-pulse rounded-full bg-brand-green" />
              Wallet Connected
            </div>
          </div>

          <div className="space-y-3 p-4">
            {/* Event card */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-brand-cyan">
                    <CalendarDays className="size-3" />
                    Aug 14 · 6:00 PM
                  </div>
                  <h3 className="font-display text-sm font-semibold text-white">
                    Solana Superteam Summit
                  </h3>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <MapPin className="size-3" />
                    Bengaluru · 300 spots
                  </div>
                </div>
                <div className="h-12 w-12 shrink-0 rounded-xl bg-brand-gradient shadow-glow" />
              </div>
              <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-gradient py-2 text-xs font-semibold text-white shadow-glow transition-transform hover:scale-[1.02]">
                <BadgeCheck className="size-3.5" />
                RSVP On-chain
              </button>
            </div>

            {/* mini stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Minted", value: "48.2K" },
                { label: "Check-ins", value: "92%" },
                { label: "Rep", value: "820" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-center"
                >
                  <div className="text-sm font-bold text-white">{s.value}</div>
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Layer>

      {/*
        The four feature cards, floating - from `md` up only.

        They are absolutely positioned at percentage offsets around a panel that
        is 78% of the container, which composes well at 1024px and collapses
        below it: on a phone the ticket, the reputation badge, the balance and
        the QR card all landed on top of each other *and* on the dashboard
        behind them. Scaling them down would keep the collision and add
        unreadable text to it.

        Below `md` the same four render in a grid underneath the panel - see
        after this block. Hiding them outright was the first fix and the wrong
        one: they are what the hero is actually claiming (a ticket, a
        reputation, a balance, a door), so dropping them on the platform most
        visitors arrive on removed the argument rather than tidying it.
      */}
      <Layer depth={40} mx={mx} my={my} float floatDelay={0.4}
        className="hidden w-40 md:block md:left-0 md:top-[6%]">
        <TicketCard />
      </Layer>

      <Layer depth={52} mx={mx} my={my} float floatDelay={1.1}
        className="hidden w-36 md:block md:right-0 md:top-[2%]">
        <ReputationCard />
      </Layer>

      <Layer depth={46} mx={mx} my={my} float floatDelay={0.8}
        className="hidden w-36 md:block md:bottom-[6%] md:left-[-4%]">
        <BalanceCard />
      </Layer>

      <Layer depth={58} mx={mx} my={my} float floatDelay={1.5}
        className="hidden w-32 md:block md:bottom-[2%] md:right-[-2%]">
        <CheckInCard />
      </Layer>

      {/*
        ...and the same four in normal flow on mobile.

        A two-column grid under the dashboard: nothing overlaps, everything is
        legible at its natural size, and the section reads as one composition
        rather than a pile. `items-stretch` plus `h-full` on the cards keeps each
        row level despite the four having different content heights.
      */}
      <div className="mt-4 grid grid-cols-2 items-stretch gap-3 md:hidden">
        <TicketCard />
        <ReputationCard />
        <BalanceCard />
        <CheckInCard />
      </div>
    </div>
  );
}
