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
      className="relative mx-auto aspect-[5/4] w-full max-w-2xl sm:aspect-[16/11]"
    >
      {/* Glow behind */}
      <div className="absolute left-1/2 top-1/2 -z-10 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-purple/25 blur-[90px]" />

      {/* ---- Main dashboard panel ---- */}
      <Layer
        depth={-18}
        mx={mx}
        my={my}
        className="left-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2 md:w-[78%]"
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
        The four floating cards are desktop-only.

        They are absolutely positioned at percentage offsets around a panel that
        was 78% of the container, which works at 1024px and collapses below it:
        on a phone the ticket, the reputation badge, the balance and the QR card
        all landed on top of each other *and* on top of the dashboard behind
        them, so the first thing a visitor saw was four illegible overlapping
        boxes. Scaling them down would keep the collision and add unreadable
        text to it.

        Below `md` the dashboard panel goes full width and stands alone, which
        is the one piece of this composition that reads on a small screen - it
        is a self-contained mock of the product rather than a decoration around
        one. The floating cards return, unchanged, where there is room.
      */}

      {/* ---- Floating: NFT Ticket (top-left) ---- */}
      <Layer
        depth={40}
        mx={mx}
        my={my}
        float
        floatDelay={0.4}
        className="hidden md:block left-[-2%] top-[6%] w-40 sm:left-0"
      >
        <div className="gradient-border rounded-2xl bg-brand-bg-soft/90 p-3 shadow-glow backdrop-blur-xl">
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
      </Layer>

      {/* ---- Floating: Reputation badge (top-right) ---- */}
      <Layer
        depth={52}
        mx={mx}
        my={my}
        float
        floatDelay={1.1}
        className="hidden md:block right-[-2%] top-[2%] w-36 sm:right-0"
      >
        <div className="gradient-border rounded-2xl bg-brand-bg-soft/90 p-3 shadow-glow-cyan backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand-cyan/15 text-brand-cyan">
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
      </Layer>

      {/* ---- Floating: Wallet balance (bottom-left) ---- */}
      <Layer
        depth={46}
        mx={mx}
        my={my}
        float
        floatDelay={0.8}
        className="hidden md:block bottom-[6%] left-[2%] w-36 sm:left-[-4%]"
      >
        <div className="gradient-border rounded-2xl bg-brand-bg-soft/90 p-3 shadow-glow-blue backdrop-blur-xl">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-brand-blue">
            <Wallet className="size-3" /> Balance
          </div>
          <div className="font-display text-lg font-bold text-white">
            ◎ 12.84
          </div>
          <div className="flex items-center gap-1 text-[9px] text-brand-green">
            <TrendingUp className="size-2.5" /> +4.2% today
          </div>
        </div>
      </Layer>

      {/* ---- Floating: QR check-in (bottom-right) ---- */}
      <Layer
        depth={58}
        mx={mx}
        my={my}
        float
        floatDelay={1.5}
        className="hidden md:block bottom-[2%] right-[0%] w-32 sm:right-[-2%]"
      >
        <div className="gradient-border rounded-2xl bg-brand-bg-soft/90 p-3 text-center shadow-glow backdrop-blur-xl">
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
      </Layer>
    </div>
  );
}
