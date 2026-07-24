"use client";

import { motion } from "framer-motion";
import { Check, CircleDot, Map, Rocket } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { roadmap, type RoadmapPhase } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusMeta: Record<
  RoadmapPhase["status"],
  { label: string; badge: "green" | "purple" | "default"; ring: string; dot: string }
> = {
  shipping: {
    label: "Shipping now",
    badge: "green",
    ring: "border-brand-green/40 shadow-[0_0_40px_-12px_rgba(20,241,149,0.5)]",
    dot: "bg-brand-green",
  },
  building: {
    label: "In progress",
    badge: "purple",
    ring: "border-brand-purple/40 shadow-glow",
    dot: "bg-brand-purple",
  },
  planned: {
    label: "Planned",
    badge: "default",
    ring: "border-white/10",
    dot: "bg-white/30",
  },
};

export function Roadmap() {
  return (
    <section id="roadmap" className="section">
      <div className="container">
        <SectionHeading
          eyebrow="Roadmap"
          icon={<Map className="size-3.5 text-brand-purple" />}
          title={
            <>
              The path to the{" "}
              <span className="text-gradient">event layer of Web3</span>
            </>
          }
          description="A focused, three-phase rollout — from a wallet-native MVP to a full DAO and cross-chain ecosystem."
        />

        <div className="relative mt-16">
          {/* connecting line (desktop) */}
          <div className="pointer-events-none absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-brand-green/40 via-brand-purple/40 to-white/10 lg:block" />

          <div className="grid gap-6 lg:grid-cols-3">
            {roadmap.map((phase, i) => {
              const meta = statusMeta[phase.status];
              return (
                <motion.div
                  key={phase.phase}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.6, delay: i * 0.12 }}
                  className="relative"
                >
                  {/* node */}
                  <div className="mb-6 flex items-center gap-3 lg:mb-8">
                    <span
                      className={cn(
                        "relative z-10 flex size-12 items-center justify-center rounded-2xl border bg-brand-bg-soft",
                        meta.ring
                      )}
                    >
                      {phase.status === "planned" ? (
                        <CircleDot className="size-5 text-white/50" />
                      ) : (
                        <Rocket className="size-5 text-white" />
                      )}
                      {phase.status !== "planned" && (
                        <span
                          className={cn(
                            "absolute -right-0.5 -top-0.5 size-3 rounded-full ring-2 ring-brand-bg-soft",
                            meta.dot
                          )}
                        />
                      )}
                    </span>
                  </div>

                  <div
                    className={cn(
                      "h-full rounded-3xl border bg-white/[0.03] p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1",
                      phase.status === "planned"
                        ? "border-white/10 hover:border-white/20"
                        : meta.ring
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {phase.phase}
                      </span>
                      <Badge variant={meta.badge}>
                        <span className={cn("size-1.5 rounded-full", meta.dot)} />
                        {meta.label}
                      </Badge>
                    </div>
                    <h3 className="mt-2 font-display text-xl font-bold text-white">
                      {phase.title}
                    </h3>

                    <ul className="mt-5 space-y-3">
                      {phase.items.map((item, j) => (
                        <motion.li
                          key={item}
                          initial={{ opacity: 0, x: -12 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: 0.2 + j * 0.08 }}
                          className="flex items-center gap-3 text-sm text-white/85"
                        >
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-full",
                              phase.status === "planned"
                                ? "bg-white/[0.06] text-white/40"
                                : "bg-brand-green/15 text-brand-green"
                            )}
                          >
                            <Check className="size-3" strokeWidth={3} />
                          </span>
                          {item}
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
