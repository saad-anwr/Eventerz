"use client";

import { motion } from "framer-motion";
import { SectionHeading } from "@/components/ui/section-heading";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { staggerContainer, staggerItem } from "@/components/ui/reveal";
import { features, type Feature } from "@/lib/data";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const accentStyles: Record<
  Feature["accent"],
  { icon: string; glow: string; ring: string }
> = {
  purple: {
    icon: "text-brand-purple bg-brand-purple/10",
    glow: "rgba(153,69,255,0.18)",
    ring: "group-hover/spotlight:border-brand-purple/40",
  },
  blue: {
    icon: "text-brand-blue bg-brand-blue/10",
    glow: "rgba(47,128,255,0.18)",
    ring: "group-hover/spotlight:border-brand-blue/40",
  },
  cyan: {
    icon: "text-brand-cyan bg-brand-cyan/10",
    glow: "rgba(34,211,238,0.18)",
    ring: "group-hover/spotlight:border-brand-cyan/40",
  },
  green: {
    icon: "text-brand-green bg-brand-green/10",
    glow: "rgba(20,241,149,0.18)",
    ring: "group-hover/spotlight:border-brand-green/40",
  },
};

export function Features() {
  return (
    <section id="features" className="section">
      <div className="container">
        <SectionHeading
          eyebrow="Features"
          icon={<Layers className="size-3.5 text-brand-purple" />}
          title={
            <>
              Everything you need to run{" "}
              <span className="text-gradient">on-chain events</span>
            </>
          }
          description="A complete, wallet-native toolkit - from discovery and RSVP to NFT ticketing, proof-of-attendance and portable reputation."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-14 flex flex-wrap justify-center gap-4"
        >
          {features.map((feature) => {
            const styles = accentStyles[feature.accent];
            return (
              <motion.div
                key={feature.title}
                variants={staggerItem}
                className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)]"
              >
                <SpotlightCard
                  tilt
                  glowColor={styles.glow}
                  className={cn("h-full p-6", styles.ring)}
                >
                  <div
                    className={cn(
                      "mb-5 flex size-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover/spotlight:scale-110",
                      styles.icon
                    )}
                  >
                    <feature.icon className="size-6" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-white">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </SpotlightCard>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
