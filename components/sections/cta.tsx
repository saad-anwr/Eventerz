"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, CalendarClock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic";
import { siteConfig } from "@/lib/site";

export function CTA() {
  return (
    <section id="cta" className="section">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-4xl border border-white/10 bg-brand-bg-soft/60 px-6 py-16 text-center backdrop-blur-2xl sm:px-16 sm:py-24"
        >
          {/* Animated gradient glow backdrop */}
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-0 size-[42rem] max-w-full -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-purple/25 blur-[110px] animate-pulse-glow" />
            <div
              className="absolute bottom-0 left-1/4 size-80 rounded-full bg-brand-cyan/15 blur-[100px] animate-pulse-glow"
              style={{ animationDelay: "1.5s" }}
            />
            <div className="absolute inset-0 bg-grid-pattern bg-[size:44px_44px] opacity-20 mask-radial-faded" />
          </div>

          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="chip mx-auto"
          >
            <Sparkles className="size-3.5 text-brand-cyan" />
            <span className="text-gradient font-semibold uppercase tracking-[0.18em]">
              Get started
            </span>
          </motion.span>

          <h2 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.1] tracking-tight text-white text-balance sm:text-5xl md:text-6xl">
            Ready to build the{" "}
            <span className="text-gradient-animated">future of events?</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
            {siteConfig.tagline} Join the communities already running
            wallet-native events on Solana.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Magnetic>
              <Button asChild size="lg">
                <Link href="/dashboard">
                  Launch App
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </Magnetic>
            <Button asChild size="lg" variant="secondary">
              <Link href={`mailto:eventerz.web@gmail.com?subject=Eventerz%20Demo`}>
                <CalendarClock className="size-4" />
                Book a Demo
              </Link>
            </Button>
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            No email required · Connect your wallet in seconds · Live on Solana
          </p>
        </motion.div>
      </div>
    </section>
  );
}
