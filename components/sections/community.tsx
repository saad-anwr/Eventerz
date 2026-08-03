"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Globe } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { staggerContainer, staggerItem } from "@/components/ui/stagger";
import { communities, type Community } from "@/lib/data";
import { cn } from "@/lib/utils";

const accentStyles: Record<
  Community["accent"],
  { icon: string; glow: string }
> = {
  purple: { icon: "text-brand-purple bg-brand-purple/10", glow: "rgba(153,69,255,0.18)" },
  blue: { icon: "text-brand-blue bg-brand-blue/10", glow: "rgba(47,128,255,0.18)" },
  cyan: { icon: "text-brand-cyan bg-brand-cyan/10", glow: "rgba(34,211,238,0.18)" },
  green: { icon: "text-brand-green bg-brand-green/10", glow: "rgba(20,241,149,0.18)" },
};

export function CommunitySection() {
  return (
    <section className="section">
      <div className="container">
        <SectionHeading
          eyebrow="Communities"
          icon={<Globe className="size-3.5 text-brand-purple" />}
          title={
            <>
              Built for every kind of{" "}
              <span className="text-gradient">community</span>
            </>
          }
          description="From DAOs to hackathons to campus clubs - Eventerz is lightweight for local organizers and scalable for global ecosystems."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-14 flex flex-wrap justify-center gap-4"
        >
          {communities.map((community) => {
            const styles = accentStyles[community.accent];
            return (
              <motion.div
                key={community.name}
                variants={staggerItem}
                className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)] xl:w-[calc(25%-0.75rem)]"
              >
                <SpotlightCard
                  tilt
                  glowColor={styles.glow}
                  className="group/spotlight h-full p-5"
                >
                  <div className="flex items-start justify-between">
                    <div
                      className={cn(
                        "flex size-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover/spotlight:scale-110",
                        styles.icon
                      )}
                    >
                      <community.icon className="size-6" />
                    </div>
                    <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-all duration-300 group-hover/spotlight:-translate-y-0.5 group-hover/spotlight:opacity-100" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold text-white">
                    {community.name}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {community.description}
                  </p>
                  <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-white">
                      {community.members}
                    </span>
                    active organizers
                  </div>
                </SpotlightCard>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
