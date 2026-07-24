"use client";

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  LayoutDashboard,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { Badge } from "@/components/ui/badge";
import {
  analyticsSeries,
  dashboardStats,
  recentEvents,
  type DashboardStat,
} from "@/lib/data";
import { cn } from "@/lib/utils";

const accentText: Record<DashboardStat["accent"], string> = {
  purple: "text-brand-purple bg-brand-purple/10",
  blue: "text-brand-blue bg-brand-blue/10",
  cyan: "text-brand-cyan bg-brand-cyan/10",
  green: "text-brand-green bg-brand-green/10",
};

function StatCard({ stat, index }: { stat: DashboardStat; index: number }) {
  const Icon: LucideIcon = stat.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20"
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl",
            accentText[stat.accent]
          )}
        >
          <Icon className="size-5" />
        </span>
        <Badge variant="green">
          <ArrowUpRight className="size-3" />
          {stat.delta}
        </Badge>
      </div>
      <div className="mt-4 font-display text-2xl font-bold text-white">
        <AnimatedCounter
          value={stat.value}
          prefix={stat.prefix}
          suffix={stat.suffix}
        />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
    </motion.div>
  );
}

/** Build a smooth cubic path (Catmull-Rom → Bézier) through the series. */
function buildPaths(values: number[], w: number, h: number, pad = 6) {
  const n = values.length;
  const max = 100;
  const pts = values.map((v, i) => ({
    x: (i / (n - 1)) * (w - pad * 2) + pad,
    y: h - pad - (v / max) * (h - pad * 2),
  }));

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  const area = `${d} L ${pts[n - 1].x} ${h} L ${pts[0].x} ${h} Z`;
  return { line: d, area, pts };
}

function AnalyticsChart() {
  const W = 340;
  const H = 150;
  const { line, area, pts } = buildPaths(
    analyticsSeries.map((d) => d.value),
    W,
    H
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Tickets Minted</h3>
          <p className="text-xs text-muted-foreground">Last 9 months</p>
        </div>
        <Badge variant="cyan">
          <ArrowUpRight className="size-3" /> +34%
        </Badge>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label="Tickets minted trend, rising over the last nine months"
        >
          <defs>
            <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9945FF" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#9945FF" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0">
              <stop stopColor="#9945FF" />
              <stop offset="0.5" stopColor="#2F80FF" />
              <stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
          </defs>

          {/* gridlines */}
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1="0"
              x2={W}
              y1={H * g}
              y2={H * g}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
          ))}

          {/* area */}
          <motion.path
            d={area}
            fill="url(#area-grad)"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.6 }}
          />
          {/* line */}
          <motion.path
            d={line}
            fill="none"
            stroke="url(#line-grad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, ease: "easeInOut" }}
          />
          {/* points */}
          {pts.map((p, i) => (
            <motion.circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="3"
              fill="#050816"
              stroke="url(#line-grad)"
              strokeWidth="2"
              initial={{ scale: 0, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: 0.6 + i * 0.08 }}
              style={{ transformOrigin: `${p.x}px ${p.y}px` }}
            />
          ))}
        </svg>

        {/* x labels */}
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          {analyticsSeries.map((d) => (
            <span key={d.month}>{d.month}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

const walletInsights = [
  { label: "New wallets", value: 62, color: "bg-brand-purple" },
  { label: "Returning", value: 28, color: "bg-brand-blue" },
  { label: "Whales", value: 10, color: "bg-brand-cyan" },
];

function WalletInsights() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="size-4 text-brand-blue" />
        <h3 className="text-sm font-semibold text-white">Wallet Insights</h3>
      </div>

      {/* segmented bar */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {walletInsights.map((seg) => (
          <motion.div
            key={seg.label}
            className={cn("h-full", seg.color)}
            initial={{ width: 0 }}
            whileInView={{ width: `${seg.value}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2.5">
        {walletInsights.map((seg) => (
          <li
            key={seg.label}
            className="flex items-center justify-between text-xs"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className={cn("size-2 rounded-full", seg.color)} />
              {seg.label}
            </span>
            <span className="font-medium text-white">{seg.value}%</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
        <div>
          <div className="font-display text-lg font-bold text-white">
            <AnimatedCounter value={9214} />
          </div>
          <div className="text-[11px] text-muted-foreground">Unique wallets</div>
        </div>
        <div>
          <div className="font-display text-lg font-bold text-white">2.4</div>
          <div className="text-[11px] text-muted-foreground">Tickets / wallet</div>
        </div>
      </div>
    </div>
  );
}

function RecentEvents() {
  const statusVariant = {
    Completed: "default",
    Live: "live",
    Upcoming: "cyan",
  } as const;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
      <h3 className="mb-4 text-sm font-semibold text-white">Recent Events</h3>
      <div className="space-y-1">
        {recentEvents.map((event) => (
          <div
            key={event.name}
            className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] font-display text-xs font-bold text-white">
                {event.name.slice(0, 2)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {event.name}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {event.wallet}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:block">
                {event.attendees} attendees
              </span>
              <Badge variant={statusVariant[event.status as keyof typeof statusVariant]}>
                {event.status}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrganizerDashboard() {
  return (
    <section className="section">
      <div className="container">
        <SectionHeading
          eyebrow="Organizer Tools"
          icon={<LayoutDashboard className="size-3.5 text-brand-purple" />}
          title={
            <>
              A command center for{" "}
              <span className="text-gradient">every organizer</span>
            </>
          }
          description="Real-time analytics on RSVPs, mints, attendance and revenue — with wallet-level insights you can act on and export."
        />

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7 }}
          className="mt-14 gradient-border rounded-4xl bg-brand-bg-soft/50 p-4 shadow-card backdrop-blur-2xl sm:p-6"
        >
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {dashboardStats.map((stat, i) => (
              <StatCard key={stat.label} stat={stat} index={i} />
            ))}
          </div>

          {/* Charts + insights */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <AnalyticsChart />
            </div>
            <WalletInsights />
          </div>

          {/* Recent events */}
          <div className="mt-4">
            <RecentEvents />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
